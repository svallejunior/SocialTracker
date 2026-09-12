import { NextRequest, NextResponse } from 'next/server';
import { formatToBrazilDateTime } from '@/lib/timezone';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = await getDb();
    
    const profiles = await db.all(`
      SELECT 
        p.*,
        cp.status as status_controle,
        cp.foto_url,
        cp.nome as nome_controle,
        ac.meta_account_id
      FROM perfis_monitorados p
      LEFT JOIN controle_perfis cp ON LOWER(p.username) = LOWER(cp.username)
      LEFT JOIN automacao_config ac ON (LOWER(p.username) = LOWER(ac.username) AND ac.id != 'default_config')
      ORDER BY p.username ASC
    `);
    
    const history = await db.all(
      "SELECT * FROM perfis_historico ORDER BY data_coleta ASC, id ASC"
    );

    const seguidoresHistorico = await db.all(
      "SELECT username, data_coleta, total_seguidores FROM seguidores_historico ORDER BY data_coleta ASC, id ASC"
    ).catch(() => []);

    const segHistByUser: Record<string, any[]> = {};
    for (const sh of seguidoresHistorico) {
      const u = (sh.username || '').toLowerCase();
      if (!segHistByUser[u]) segHistByUser[u] = [];
      segHistByUser[u].push(sh);
    }

    const rawPosts = await db.all(
      "SELECT * FROM posts_historico WHERE (is_deleted IS NULL OR is_deleted = 0) ORDER BY data_postagem DESC"
    );

    // Mapeia mídias/imagens salvas na automação por meta_media_id para thumbnail dos posts
    const automacaoMidias = await db.all(`
      SELECT meta_media_id, arquivos
      FROM automacao_publicacoes
      WHERE (is_deleted IS NULL OR is_deleted = 0) AND status = 'PUBLICADO' AND meta_media_id IS NOT NULL AND arquivos IS NOT NULL AND arquivos != ''
    `).catch(() => []);

    const midiaUrlMap: Record<string, string> = {};
    const thumbnailUrlMap: Record<string, string> = {};
    for (const item of automacaoMidias) {
      if (!item.meta_media_id) continue;
      try {
        const arqs = typeof item.arquivos === 'string' ? JSON.parse(item.arquivos) : item.arquivos;
        if (Array.isArray(arqs) && arqs.length > 0) {
          const first = arqs[0];
          const url = first.previewUrl || first.url;
          if (url && typeof url === 'string') {
            midiaUrlMap[item.meta_media_id] = url;
          }
          // previewUrl é sempre uma imagem estática (capa), mesmo para Reels
          if (first.previewUrl && typeof first.previewUrl === 'string') {
            thumbnailUrlMap[item.meta_media_id] = first.previewUrl;
          }
        }
      } catch (e) {
        // Ignora JSON mal formatado
      }
    }

    // Métricas de visualizações dos posts por perfil e por post (views hoje e delta na última carga)
    const viewsDiaMap: Record<string, number> = {};
    const viewsDeltaMap: Record<string, number> = {};
    const postViewsDeltaMap: Record<string, number> = {};
    const postViewsDiaMap: Record<string, number> = {};
    const curvaViewsDiaMap: Record<string, number[]> = {};
    const viewsSempreMap: Record<string, number> = {};

    try {
      // Data de hoje no fuso oficial de Brasília (America/Sao_Paulo)
      const hojeStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      let limiteHoje = `${hojeStr} 00:00:00`;

      // Fallback protetor: se ainda não houver cargas registradas no dia atual (ex: primeiros minutos após a meia-noite),
      // mantém como base o dia da última carga registrada para evitar que os dados zerem na tela
      const maxCargaRow = await db.get(`SELECT MAX(data_carga) as max_c FROM posts_metricas_snapshots`).catch(() => null);
      if (maxCargaRow?.max_c) {
        const diaUltimaCarga = String(maxCargaRow.max_c).substring(0, 10);
        if (diaUltimaCarga < hojeStr) {
          limiteHoje = `${diaUltimaCarga} 00:00:00`;
        }
      }

      // 1) Duas últimas cargas de snapshots para delta do último ciclo calculadas por perfil individualmente
      // (Isso impede que o delta zere enquanto a ingestão está em andamento gravando outro perfil primeiro)
      const userCargasRows = await db.all(`
        SELECT LOWER(username) as uname, data_carga
        FROM posts_metricas_snapshots
        GROUP BY LOWER(username), data_carga
        ORDER BY LOWER(username), data_carga DESC
      `).catch(() => []);

      const userCargasPair: Record<string, { uCarga: string; pCarga?: string }> = {};
      for (const row of userCargasRows) {
        const u = row.uname;
        if (!userCargasPair[u]) {
          userCargasPair[u] = { uCarga: row.data_carga };
        } else if (!userCargasPair[u].pCarga) {
          userCargasPair[u].pCarga = row.data_carga;
        }
      }

      const distinctCargas = Array.from(new Set(
        Object.values(userCargasPair).flatMap(p => [p.uCarga, p.pCarga].filter(Boolean) as string[])
      ));

      if (distinctCargas.length > 0) {
        const placeholders = distinctCargas.map(() => '?').join(',');
        const recentSnaps = await db.all(`
          SELECT 
            s.post_id,
            LOWER(s.username) as uname,
            s.views,
            s.data_carga,
            p.data_postagem
          FROM posts_metricas_snapshots s
          JOIN posts_historico p ON p.post_id = s.post_id
          WHERE s.data_carga IN (${placeholders})
        `, distinctCargas).catch(() => []);

        const snapViewsMap: Record<string, Record<string, Record<string, number>>> = {};
        const postDateMap: Record<string, string> = {};

        for (const s of recentSnaps) {
          const u = s.uname;
          const pid = s.post_id;
          if (!snapViewsMap[u]) snapViewsMap[u] = {};
          if (!snapViewsMap[u][pid]) snapViewsMap[u][pid] = {};
          snapViewsMap[u][pid][s.data_carga] = Number(s.views) || 0;
          postDateMap[pid] = s.data_postagem || '';
        }

        for (const [u, pair] of Object.entries(userCargasPair)) {
          const uC = pair.uCarga;
          const pC = pair.pCarga;
          const userPosts = snapViewsMap[u] || {};

          let userDeltaSum = 0;
          for (const [pid, cargasObj] of Object.entries(userPosts)) {
            const vU = cargasObj[uC];
            if (vU === undefined) continue;

            const vP = pC ? cargasObj[pC] : undefined;
            const postDate = postDateMap[pid] || '';

            let deltaReal = 0;
            if (vP !== undefined && vP > 0) {
              deltaReal = Math.max(0, vU - vP);
            } else if (postDate >= limiteHoje) {
              deltaReal = vU;
            }

            postViewsDeltaMap[pid] = deltaReal;
            userDeltaSum += deltaReal;
          }
          viewsDeltaMap[u] = userDeltaSum;
        }
      }

      // 2) Views ganhas hoje por perfil e por post
      const snapHoje = await db.all(`
        SELECT 
          LOWER(username) as uname,
          post_id,
          MAX(views) as max_views,
          MIN(views) as min_views
        FROM posts_metricas_snapshots
        WHERE data_carga >= ?
        GROUP BY LOWER(username), post_id
      `, [limiteHoje]).catch(() => []);

      const snapAntes = await db.all(`
        SELECT post_id, views
        FROM posts_metricas_snapshots
        WHERE data_carga < ?
        ORDER BY data_carga DESC
      `, [limiteHoje]).catch(() => []);

      const antesMap: Record<string, number> = {};
      for (const s of snapAntes) {
        if (antesMap[s.post_id] === undefined) {
          antesMap[s.post_id] = Number(s.views) || 0;
        }
      }

      for (const s of snapHoje) {
        const u = s.uname;
        const maxV = Number(s.max_views) || 0;
        const baseV = antesMap[s.post_id] !== undefined ? antesMap[s.post_id] : (Number(s.min_views) || 0);
        const delta = maxV - baseV;
        if (delta > 0) {
          viewsDiaMap[u] = (viewsDiaMap[u] || 0) + delta;
          postViewsDiaMap[s.post_id] = delta;
        }
      }

      // 3) Curva de evolução de visualizações ganhas acumuladas hoje por perfil (começando de 00h e evoluindo com as amostras)
      const snapRowsHoje = await db.all(`
        SELECT data_carga, LOWER(username) as uname, post_id, views
        FROM posts_metricas_snapshots
        WHERE data_carga >= ?
        ORDER BY data_carga ASC
      `, [limiteHoje]).catch(() => []);

      const userCargasMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const row of snapRowsHoje) {
        const u = row.uname;
        const dc = row.data_carga;
        if (!userCargasMap[u]) userCargasMap[u] = {};
        if (!userCargasMap[u][dc]) userCargasMap[u][dc] = {};
        userCargasMap[u][dc][row.post_id] = Number(row.views) || 0;
      }

      for (const [u, cargasObj] of Object.entries(userCargasMap)) {
        const cargasOrdenadas = Object.keys(cargasObj).sort();
        const curva: number[] = [0]; // Ponto 0 às 00h
        const localBaseMap: Record<string, number> = { ...antesMap };

        for (const dc of cargasOrdenadas) {
          const postsDc = cargasObj[dc];
          let viewsGanhasDc = 0;
          for (const [pid, v] of Object.entries(postsDc)) {
            if (localBaseMap[pid] === undefined) {
              localBaseMap[pid] = v;
            }
            const diff = Math.max(0, v - localBaseMap[pid]);
            viewsGanhasDc += diff;
          }
          curva.push(viewsGanhasDc);
        }
        curvaViewsDiaMap[u] = curva;
      }
    } catch (e) {
      console.warn("Aviso ao calcular views_dia e views_delta:", e);
    }

    const posts = rawPosts.map((p: any) => {
      let formatoPadrao = p.formato || 'Imagem';
      const fUpper = (p.formato || '').toUpperCase();
      const mptUpper = (p.media_product_type || '').toUpperCase();

      if (fUpper === 'VIDEO' || fUpper === 'REELS' || mptUpper === 'REELS') {
        formatoPadrao = 'Reels';
      } else if (fUpper === 'CAROUSEL_ALBUM' || fUpper === 'CARROSSEL' || fUpper === 'ALBUM') {
        formatoPadrao = 'Carrossel';
      } else if (fUpper === 'IMAGE' || fUpper === 'IMAGEM') {
        formatoPadrao = 'Imagem';
      }

      const mediaUrl = p.media_url || midiaUrlMap[p.post_id] || midiaUrlMap[p.shortcode] || null;
      const thumbnailUrl = p.thumbnail_url || thumbnailUrlMap[p.post_id] || thumbnailUrlMap[p.shortcode] || mediaUrl;

      return {
        ...p,
        formato: formatoPadrao,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl || mediaUrl,
        delta_views_coleta: postViewsDeltaMap[p.post_id] || 0,
        views_dia: postViewsDiaMap[p.post_id] || 0
      };
    });

    for (const p of rawPosts) {
      const u = (p.username || '').toLowerCase();
      viewsSempreMap[u] = (viewsSempreMap[u] || 0) + (Number(p.views) || 0);
    }


    // Mapeia status de cada perfil para saber se morreu/inativo
    const statusPerfilMap: Record<string, boolean> = {};
    for (const p of profiles) {
      const u = (p.username || '').toLowerCase();
      const isM = p.status === 'MORREU' || p.status === 'INATIVO' || p.status_controle === '☠️ Morreu' || (p.status_controle || '').includes('Morreu') || (p.status || '').toUpperCase() === 'MORREU';
      statusPerfilMap[u] = isM;
    }

    // Agrupa histórico por username ordenado cronologicamente com forward-fill para quedas transitórias
    const historyByUser: Record<string, any[]> = {};
    for (const h of history) {
      const u = (h.username || '').toLowerCase();
      if (!historyByUser[u]) historyByUser[u] = [];
      historyByUser[u].push(h);
    }

    const followersHistory: Record<string, any[]> = {};
    const coletasMap: Record<string, { inicio_monitoramento: string; data_coleta: string; ultimosSeguidores: number; ultimosPosts: number; ultimosSeguindo: number }> = {};

    for (const [u, list] of Object.entries(historyByUser)) {
      // Deduplica: para cada dia, mantém o registro mais recente pelo timestamp/id
      const porDia: Record<string, any> = {};
      for (const h of list) {
        const dia = (h.data_coleta || '').substring(0, 10); // 'YYYY-MM-DD'
        if (!dia) continue;
        const cur = porDia[dia];
        if (!cur) {
          porDia[dia] = h;
        } else {
          const curTs = cur.data_carga || cur.data_coleta || '';
          const newTs = h.data_carga || h.data_coleta || '';
          if (newTs > curTs || (newTs === curTs && (h.id || 0) >= (cur.id || 0))) {
            porDia[dia] = h;
          }
        }
      }
      const listaDiaria = Object.values(porDia).sort((a, b) => {
        const dComp = (a.data_coleta || '').localeCompare(b.data_coleta || '');
        return dComp !== 0 ? dComp : (a.id || 0) - (b.id || 0);
      });

      const isDead = statusPerfilMap[u] || false;
      let lastValidSeguidores = 0;
      let lastValidPosts = 0;
      let lastValidSeguindo = 0;
      followersHistory[u] = [];

      for (const h of listaDiaria) {
        let seg = Number(h.seguidores) || 0;
        if (seg > 0) {
          lastValidSeguidores = seg;
          lastValidPosts = h.total_posts || lastValidPosts;
          lastValidSeguindo = h.seguindo || lastValidSeguindo;
        } else if (!isDead && lastValidSeguidores > 0) {
          // Se a conta está viva e houve queda temporária para 0: assume o último valor válido
          seg = lastValidSeguidores;
        }

        followersHistory[u].push({
          ...h,
          data: h.data_coleta || '',
          total_seguidores: seg
        });

        if (!coletasMap[u]) {
          coletasMap[u] = {
            inicio_monitoramento: h.data_coleta,
            data_coleta: h.data_coleta,
            ultimosSeguidores: lastValidSeguidores,
            ultimosPosts: lastValidPosts,
            ultimosSeguindo: lastValidSeguindo
          };
        } else {
          if (h.data_coleta < coletasMap[u].inicio_monitoramento) {
            coletasMap[u].inicio_monitoramento = h.data_coleta;
          }
          if (h.data_coleta > coletasMap[u].data_coleta) {
            coletasMap[u].data_coleta = h.data_coleta;
          }
          coletasMap[u].ultimosSeguidores = lastValidSeguidores;
          coletasMap[u].ultimosPosts = lastValidPosts;
          coletasMap[u].ultimosSeguindo = lastValidSeguindo;
        }
      }
    }


    // Consulta comentários e mensagens pendentes por modelo
    const comentariosPendentes = await db.all(`
      SELECT LOWER(modelo_username) as uname, COUNT(*) as total
      FROM instagram_comentarios
      WHERE COALESCE(respondido, 0) = 0
      GROUP BY LOWER(modelo_username)
    `).catch(() => []);

    const mensagensPendentes = await db.all(`
      SELECT LOWER(modelo_username) as uname, COUNT(*) as total
      FROM instagram_mensagens
      WHERE COALESCE(respondida, 0) = 0
      GROUP BY LOWER(modelo_username)
    `).catch(() => []);

    const comMap: Record<string, number> = {};
    for (const c of comentariosPendentes) comMap[c.uname] = Number(c.total || 0);

    const msgMap: Record<string, number> = {};
    for (const m of mensagensPendentes) msgMap[m.uname] = Number(m.total || 0);

    // Estatísticas de Hoje por Modelo: POST, REELS e STORIES (Publicados e Agendados)
    const statsHojeMap: Record<string, {
      postPub: number;
      postAg: number;
      reelsPub: number;
      reelsAg: number;
      storiesPub: number;
      storiesAg: number;
    }> = {};

    const getStatsModelo = (uname: string) => {
      if (!statsHojeMap[uname]) {
        statsHojeMap[uname] = {
          postPub: 0,
          postAg: 0,
          reelsPub: 0,
          reelsAg: 0,
          storiesPub: 0,
          storiesAg: 0,
        };
      }
      return statsHojeMap[uname];
    };

    try {
      const offsetMs = -3 * 60 * 60 * 1000;
      const dataHojeLocal = new Date(Date.now() + offsetMs);
      const hojeIso = dataHojeLocal.toISOString().substring(0, 10);
      const diaSemanaMap: Record<number, string> = {
        0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SAB'
      };
      const diaSemanaStr = diaSemanaMap[dataHojeLocal.getUTCDay()];
      const [anoStr, mesStr, diaStr] = hojeIso.split('-');
      const hojeBr = `${diaStr}/${mesStr}/${anoStr}`;

      // A) Publicações de posts_historico hoje (para Feed e Reels coletados)
      const postsHistoricoHoje = await db.all(`
        SELECT LOWER(username) as uname, formato, media_product_type
        FROM posts_historico
        WHERE (is_deleted IS NULL OR is_deleted = 0) AND data_postagem LIKE ?
      `, [`${hojeIso}%`]).catch(() => []);

      const histReelsMap: Record<string, number> = {};
      const histPostMap: Record<string, number> = {};
      const histStoriesMap: Record<string, number> = {};

      for (const ph of postsHistoricoHoje) {
        const u = ph.uname;
        const fUpper = (ph.formato || '').toUpperCase();
        const mptUpper = (ph.media_product_type || '').toUpperCase();
        if (fUpper === 'REELS' || mptUpper === 'REELS' || fUpper === 'VIDEO') {
          histReelsMap[u] = (histReelsMap[u] || 0) + 1;
        } else if (fUpper === 'STORIES' || fUpper === 'STORY' || mptUpper === 'STORY' || mptUpper === 'STORIES') {
          histStoriesMap[u] = (histStoriesMap[u] || 0) + 1;
        } else {
          histPostMap[u] = (histPostMap[u] || 0) + 1;
        }
      }

      // B) Publicações da tabela automacao_publicacoes com status 'PUBLICADO' hoje
      const autoPubsHoje = await db.all(`
        SELECT LOWER(username) as uname, tipo_postagem, COUNT(DISTINCT COALESCE(NULLIF(meta_media_id, ''), id)) as total
        FROM automacao_publicacoes
        WHERE status = 'PUBLICADO' AND (is_deleted IS NULL OR is_deleted = 0) AND (data_local = ? OR publicado_em LIKE ?)
        GROUP BY LOWER(username), tipo_postagem
      `, [hojeIso, `${hojeIso}%`]).catch(() => []);

      const autoReelsMap: Record<string, number> = {};
      const autoPostMap: Record<string, number> = {};
      const autoStoriesMap: Record<string, number> = {};

      for (const ap of autoPubsHoje) {
        const u = ap.uname;
        const tot = Number(ap.total) || 0;
        const tipo = (ap.tipo_postagem || '').toUpperCase();
        if (tipo === 'REELS') {
          autoReelsMap[u] = (autoReelsMap[u] || 0) + tot;
        } else if (tipo === 'STORIES' || tipo === 'STORY') {
          autoStoriesMap[u] = (autoStoriesMap[u] || 0) + tot;
        } else {
          autoPostMap[u] = (autoPostMap[u] || 0) + tot;
        }
      }

      // C) Agendamentos de automacao_agendamentos com status 'AGENDADO' programados para hoje
      const agsAtivos = await db.all(`
        SELECT id, LOWER(username) as uname, tipo_postagem, data_especifica, dias_selecionados, recorrencia, tipo_agendamento, data_inicio, data_fim
        FROM automacao_agendamentos
        WHERE status = 'AGENDADO'
      `).catch(() => []);

      const agReelsMap: Record<string, number> = {};
      const agPostMap: Record<string, number> = {};
      const agStoriesMap: Record<string, number> = {};

      for (const ag of agsAtivos) {
        const u = ag.uname;
        const tipo = (ag.tipo_postagem || '').toUpperCase();
        const isDataEsp = ag.tipo_agendamento === 'DATA_ESPECIFICA' || ag.recorrencia === 'UNICA';

        let ehHoje = false;
        if (isDataEsp) {
          if (ag.data_especifica && (ag.data_especifica === hojeIso || ag.data_especifica === hojeBr)) {
            ehHoje = true;
          } else if (ag.dias_selecionados) {
            try {
              const dArr = typeof ag.dias_selecionados === 'string' ? JSON.parse(ag.dias_selecionados) : ag.dias_selecionados;
              if (Array.isArray(dArr) && (dArr.includes(hojeIso) || dArr.includes(hojeBr))) {
                ehHoje = true;
              }
            } catch (e) {}
          }
        } else {
          const passouInicio = !ag.data_inicio || ag.data_inicio <= hojeIso;
          const antesFim = !ag.data_fim || ag.data_fim >= hojeIso;
          if (passouInicio && antesFim) {
            if (ag.recorrencia === 'DIARIA') {
              ehHoje = true;
            } else if (ag.recorrencia === 'DIAS_UTEIS') {
              ehHoje = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'].includes(diaSemanaStr);
            } else if (ag.dias_selecionados) {
              try {
                const dArr = typeof ag.dias_selecionados === 'string' ? JSON.parse(ag.dias_selecionados) : ag.dias_selecionados;
                if (Array.isArray(dArr) && (dArr.includes(diaSemanaStr) || dArr.includes(hojeIso) || dArr.includes(hojeBr))) {
                  ehHoje = true;
                }
              } catch (e) {}
            }
          }
        }

        if (ehHoje) {
          if (tipo === 'REELS') {
            agReelsMap[u] = (agReelsMap[u] || 0) + 1;
          } else if (tipo === 'STORIES' || tipo === 'STORY') {
            agStoriesMap[u] = (agStoriesMap[u] || 0) + 1;
          } else {
            agPostMap[u] = (agPostMap[u] || 0) + 1;
          }
        }
      }

      const allUsers = new Set([
        ...Object.keys(histReelsMap), ...Object.keys(histPostMap), ...Object.keys(histStoriesMap),
        ...Object.keys(autoReelsMap), ...Object.keys(autoPostMap), ...Object.keys(autoStoriesMap),
        ...Object.keys(agReelsMap), ...Object.keys(agPostMap), ...Object.keys(agStoriesMap)
      ]);

      for (const u of allUsers) {
        const st = getStatsModelo(u);
        st.postPub = Math.max(histPostMap[u] || 0, autoPostMap[u] || 0);
        st.reelsPub = Math.max(histReelsMap[u] || 0, autoReelsMap[u] || 0);
        st.storiesPub = Math.max(histStoriesMap[u] || 0, autoStoriesMap[u] || 0);

        st.postAg = agPostMap[u] || 0;
        st.reelsAg = agReelsMap[u] || 0;
        st.storiesAg = agStoriesMap[u] || 0;
      }
    } catch (e) {
      console.warn("Aviso ao calcular stats de hoje por modelo:", e);
    }

    // Enriquece cada perfil com as colunas de primeira coleta, última coleta, seguidores mais recentes válidos, variações e notificações
    const profilesEnriquecidos = profiles.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const c = coletasMap[u];
      const fotoEfetiva = (p.foto_perfil_meta && String(p.foto_perfil_meta).trim().length > 0)
        ? p.foto_perfil_meta
        : (p.foto_url || '');

      const nCom = comMap[u] || 0;
      const nMsg = msgMap[u] || 0;
      const totalPend = nCom + nMsg;

      const userRawHistory = historyByUser[u] || [];
      const userSegHistory = segHistByUser[u] || [];

      // Mescla coletas cronológicas de perfis_historico e seguidores_historico para capturar todos os ciclos (ex: 15 em 15 min)
      const coletasMapUser: Record<string, number> = {};
      for (const h of userRawHistory) {
        const seg = Number(h.seguidores) || 0;
        if (seg > 0 && h.data_coleta) {
          coletasMapUser[h.data_coleta] = seg;
        }
      }
      for (const sh of userSegHistory) {
        const seg = Number(sh.total_seguidores) || 0;
        if (seg > 0 && sh.data_coleta) {
          coletasMapUser[sh.data_coleta] = seg;
        }
      }

      const mergedColetas = Object.entries(coletasMapUser)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dt, seg]) => ({ data_coleta: dt, seguidores: seg }));

      const totalColetas = mergedColetas.length;
      const atual = totalColetas > 0 ? mergedColetas[totalColetas - 1] : null;
      const penultimo = totalColetas > 1 ? mergedColetas[totalColetas - 2] : null;
      const seguidoresAtuais = atual ? Number(atual.seguidores) : (c ? c.ultimosSeguidores : 0);

      // 1) Variação no Último Ciclo (diferença real da penúltima para a última coleta, ex: ciclo de 15 min)
      let variacaoUltima = 0;
      if (atual && penultimo) {
        variacaoUltima = seguidoresAtuais - Number(penultimo.seguidores);
      }

      // 2) Variação no Dia (crescimento acumulado desde a zero hora / 00:00 do dia da última leitura)
      let variacaoDia = 0;
      let curvaSeguidoresDia: number[] = [0]; // Ponto 0 às 00h
      if (atual && atual.data_coleta) {
        const diaRef = String(atual.data_coleta).substring(0, 10);
        const limiteZeroHora = `${diaRef} 00:00:00`;
        const leiturasAntes00h = mergedColetas.filter((h) => String(h.data_coleta) < limiteZeroHora);
        const leiturasDeHoje = mergedColetas.filter((h) => String(h.data_coleta) >= limiteZeroHora);

        let baseDia: any = null;
        if (leiturasAntes00h.length > 0) {
          baseDia = leiturasAntes00h[leiturasAntes00h.length - 1];
        } else if (leiturasDeHoje.length > 0) {
          baseDia = leiturasDeHoje[0];
        } else {
          baseDia = atual;
        }

        const baseSeg = baseDia ? Number(baseDia.seguidores) : seguidoresAtuais;
        if (baseDia) {
          variacaoDia = seguidoresAtuais - baseSeg;
        }

        for (const lh of leiturasDeHoje) {
          const seg = Number(lh.seguidores) || 0;
          const diff = Math.max(0, seg - baseSeg);
          curvaSeguidoresDia.push(diff);
        }
      }

      return {
        ...p,
        foto_url: fotoEfetiva,
        foto_perfil: fotoEfetiva,
        foto_perfil_meta: p.foto_perfil_meta || null,
        foto_local: p.foto_url || null,
        inicio_monitoramento: c ? c.inicio_monitoramento : null,
        data_coleta: c ? c.data_coleta : null,
        seguidores: seguidoresAtuais,
        total_posts: c ? c.ultimosPosts : 0,
        seguindo: c ? c.ultimosSeguindo : 0,
        novos_seguidores_coleta: variacaoUltima,
        novos_seguidores_dia: variacaoDia,
        variacao_ultima: variacaoUltima,
        variacao_dia: variacaoDia,
        curva_seguidores_dia: curvaSeguidoresDia,
        curva_views_dia: curvaViewsDiaMap[u] || [0, 0],
        comentarios_pendentes: nCom,
        mensagens_pendentes: nMsg,
        total_pendencias: totalPend,
        tem_pendencias: totalPend > 0,
        views_dia: viewsDiaMap[u] || 0,
        views_sempre: viewsSempreMap[u] || 0,
        views_delta_ultima_carga: viewsDeltaMap[u] || 0,
        hoje_post_pub: statsHojeMap[u]?.postPub || 0,
        hoje_post_ag: statsHojeMap[u]?.postAg || 0,
        hoje_reels_pub: statsHojeMap[u]?.reelsPub || 0,
        hoje_reels_ag: statsHojeMap[u]?.reelsAg || 0,
        hoje_stories_pub: statsHojeMap[u]?.storiesPub || 0,
        hoje_stories_ag: statsHojeMap[u]?.storiesAg || 0,
        meta_account_id: p.meta_account_id || null,
        tem_meta_id: Boolean(p.meta_account_id && String(p.meta_account_id).trim().length > 0)
      };
    });

    const lastUpdateRow = await db.get(`
      SELECT MAX(data_coleta) as ultima_coleta FROM perfis_historico
    `).catch(() => null);
    const ultimaAtualizacao = lastUpdateRow?.ultima_coleta || null;

    return NextResponse.json({
      success: true,
      ultimaAtualizacao: ultimaAtualizacao,
      profiles: profilesEnriquecidos,
      history: history || [],
      followersHistory: followersHistory,
      posts: posts || []
    });
  } catch (error: any) {
    console.error("Erro no /api/data GET:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      profiles: [],
      history: [],
      followersHistory: {},
      posts: []
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ success: false, error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace('@', '');
    const db = await getDb();

    const existing = await db.get("SELECT * FROM perfis_monitorados WHERE LOWER(username) = ?", [cleanUsername]);

    if (existing) {
      await db.run("UPDATE perfis_monitorados SET status = 'ATIVO', exibir = 1 WHERE LOWER(username) = ?", [cleanUsername]);
    } else {
      await db.run(
        "INSERT INTO perfis_monitorados (username, status, exibir, meu_perfil) VALUES (?, 'ATIVO', 1, 0)",
        [cleanUsername]
      );
    }

    return NextResponse.json({ success: true, message: `Perfil @${cleanUsername} adicionado com sucesso.` });
  } catch (error: any) {
    console.error("Erro no /api/data POST:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await getDb();

    const {
      username,
      newUsername,
      favorito,
      meu_perfil,
      meuPerfil,
      primeira_postagem,
      primeiraPostagem,
      tipo_conta,
      tipoConta,
      tipo_trafego,
      tipoTrafego,
      exibir,
      status,
      seguidores,
      inativo,
      is_verified,
      isVerified
    } = body;

    if (!username) {
      return NextResponse.json({ success: false, error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace('@', '');

    // Renomear username
    if (newUsername) {
      const cleanNewUsername = newUsername.trim().toLowerCase().replace('@', '');
      await db.run("UPDATE perfis_monitorados SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE perfis_historico SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE posts_historico SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE controle_perfis SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE lancamentos SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      return NextResponse.json({ success: true, message: `Username alterado para @${cleanNewUsername}` });
    }

    // Gravação manual de seguidores no histórico
    if (seguidores !== undefined && seguidores !== null) {
      const dataColeta = formatToBrazilDateTime(new Date());
      const hojePrefix = dataColeta.split(' ')[0]; // YYYY-MM-DD

      const inativoVal = inativo !== undefined && inativo !== null ? (inativo ? 1 : 0) : 0;

      // Checa se já existia registro no mesmo dia antes de gravar
      const regHoje = await db.get(
        `SELECT id, tipo_janela, revisado_manualmente FROM perfis_historico WHERE LOWER(username) = ? AND (data_coleta LIKE ? OR data_coleta = ?) ORDER BY data_coleta DESC, id DESC LIMIT 1`,
        [cleanUsername, `${hojePrefix}%`, hojePrefix]
      );

      // Busca se é perfil próprio
      const perfilInfo = await db.get(
        `SELECT meu_perfil FROM perfis_monitorados WHERE LOWER(username) = ?`,
        [cleanUsername]
      );
      const isMeuPerfil = Number(perfilInfo?.meu_perfil || 0) === 1;

      // Busca último valor anterior ao dia de hoje para calcular variação real da janela
      const lastRow = await db.get(
        `SELECT seguindo, total_posts, seguidores, tipo_janela, revisado_manualmente FROM perfis_historico WHERE LOWER(username) = ? AND inativo = 0 AND data_coleta NOT LIKE ? ORDER BY data_coleta DESC LIMIT 1`,
        [cleanUsername, `${hojePrefix}%`]
      );
      const seguindoVal = lastRow ? (lastRow.seguindo || 0) : 0;
      const postsVal = lastRow ? (lastRow.total_posts || 0) : 0;

      // Verifica se a variação está dentro dos parâmetros de validação automática
      // Regra: variação > 2% E ganho >= 10 seguidores → requer análise manual (ADS ou viral)
      const segAnterior = lastRow ? (lastRow.seguidores || 0) : 0;
      const deltaS = Number(seguidores) - segAnterior;
      const pctDeltaS = segAnterior > 0 ? (deltaS / segAnterior) * 100 : 0;
      const precisaAnalise = segAnterior > 0 && pctDeltaS > 2.0 && deltaS >= 10;

      let tipoJanelaInicial = 'ORGANICO';
      let revisadoInicial = 1;

      // 1. Se for meu perfil e na data da ocorrência já estiver como ADS ou VIRAL_ORGANICO, preserva sem cair para verificação
      if (isMeuPerfil && regHoje && (regHoje.tipo_janela === 'ADS' || regHoje.tipo_janela === 'VIRAL_ORGANICO')) {
        tipoJanelaInicial = regHoje.tipo_janela;
        revisadoInicial = 1;
      } else if (regHoje && (regHoje.revisado_manualmente === 1 || ['VIRAL_ORGANICO', 'ADS', 'IGNORAR'].includes(regHoje.tipo_janela))) {
        tipoJanelaInicial = regHoje.tipo_janela;
        revisadoInicial = 1;
      } else if (precisaAnalise) {
        // 2. Se a conta já estava em viralização confirmada na leitura anterior, herda VIRAL_ORGANICO e valida automaticamente
        if (lastRow?.tipo_janela === 'VIRAL_ORGANICO' && lastRow?.revisado_manualmente === 1) {
          tipoJanelaInicial = 'VIRAL_ORGANICO';
          revisadoInicial = 1;
        } else {
          tipoJanelaInicial = 'ADS';
          revisadoInicial = 0;
        }
      }

      if (regHoje) {
        await db.run(
          `UPDATE perfis_historico SET data_coleta = ?, seguidores = ?, tipo_janela = ?, revisado_manualmente = ? WHERE id = ?`,
          [dataColeta, Number(seguidores), tipoJanelaInicial, revisadoInicial, regHoje.id]
        );
      } else {
        await db.run(
          `INSERT INTO perfis_historico (username, data_coleta, seguidores, seguindo, total_posts, inativo, tipo_janela, revisado_manualmente) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cleanUsername, dataColeta, Number(seguidores), seguindoVal, postsVal, inativoVal, tipoJanelaInicial, revisadoInicial]
        );
      }
    }

    // Atualização de propriedades do perfil
    const fields: string[] = [];
    const params: any[] = [];

    if (favorito !== undefined) {
      fields.push("favorito = ?");
      params.push(favorito ? 1 : 0);
    }

    const meuPerfilVal = meu_perfil !== undefined ? meu_perfil : meuPerfil;
    if (meuPerfilVal !== undefined) {
      fields.push("meu_perfil = ?");
      params.push(meuPerfilVal ? 1 : 0);
      try {
        await db.run('INSERT OR IGNORE INTO controle_perfis (username) VALUES (?)', [cleanUsername]);
      } catch (e) {}
    }

    const primeiraPostagemVal = primeira_postagem !== undefined ? primeira_postagem : primeiraPostagem;
    if (primeiraPostagemVal !== undefined) {
      fields.push("primeira_postagem = ?");
      params.push(primeiraPostagemVal);
    }

    const tipoContaVal = tipo_conta !== undefined ? tipo_conta : tipoConta;
    if (tipoContaVal !== undefined) {
      fields.push("tipo_conta = ?");
      params.push(tipoContaVal);
    }

    const tipoTrafegoVal = tipo_trafego !== undefined ? tipo_trafego : tipoTrafego;
    if (tipoTrafegoVal !== undefined) {
      fields.push("tipo_trafego = ?");
      params.push(tipoTrafegoVal);
    }

    const isVerifiedVal = is_verified !== undefined ? is_verified : isVerified;
    if (isVerifiedVal !== undefined) {
      fields.push("is_verified = ?");
      params.push(isVerifiedVal ? 1 : 0);
    }

    if (exibir !== undefined) {
      fields.push("exibir = ?");
      params.push(exibir ? 1 : 0);
    }

    if (status !== undefined) {
      fields.push("status = ?");
      params.push(status);
      if (status === 'MORREU' || status === '☠️ Morreu') {
        await db.run(`
          INSERT INTO controle_perfis (username, status) VALUES (?, '☠️ Morreu')
          ON CONFLICT(username) DO UPDATE SET status = '☠️ Morreu'
        `, [cleanUsername]);
      } else {
        const rowCtrl = await db.get(`SELECT status FROM controle_perfis WHERE LOWER(username) = ?`, [cleanUsername]);
        if (rowCtrl && rowCtrl.status && rowCtrl.status.includes('Morreu')) {
          await db.run(`UPDATE controle_perfis SET status = '⏳ Aguardando' WHERE LOWER(username) = ?`, [cleanUsername]);
        }
      }
      if (status === 'INDISPONIVEL') {
        try {
          const dateStr = new Date().toLocaleDateString('pt-BR');
          await db.run(
            `INSERT INTO controle_perfis_obs (username, texto) VALUES (?, ?)`,
            [cleanUsername, `[SISTEMA] Perfil marcado como INDISPONÍVEL / SUSPENSO em ${dateStr}`]
          );
        } catch (e) {
          // ignora se a tabela não existir
        }
      }
    }

    if (fields.length > 0) {
      params.push(cleanUsername);
      await db.run(`UPDATE perfis_monitorados SET ${fields.join(', ')} WHERE LOWER(username) = ?`, params);
    }

    return NextResponse.json({ success: true, message: "Perfil atualizado com sucesso" });

  } catch (error: any) {
    console.error("Erro no /api/data PUT:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ success: false, error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace('@', '');
    const db = await getDb();

    await db.run("UPDATE perfis_monitorados SET status = 'INATIVO', exibir = 0 WHERE LOWER(username) = ?", [cleanUsername]);

    return NextResponse.json({ success: true, message: `Perfil @${cleanUsername} desativado.` });
  } catch (error: any) {
    console.error("Erro no /api/data DELETE:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}