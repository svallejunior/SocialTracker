// app/api/controle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb as getDbBase } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getDb() {
  const db = await getDbBase();
  
  // Migration: ensure table has foto_url column
  try {
    const columns = await db.all("PRAGMA table_info(controle_perfis)");
    const hasFotoUrl = columns.some((c: any) => c.name === "foto_url");
    if (!hasFotoUrl) {
      await db.exec(`ALTER TABLE controle_perfis ADD COLUMN foto_url TEXT`);
    }

    // Meta Account ID precisa ficar arquivado junto com o resto do cadastro da
    // modelo (não só em automacao_config, que é config de automação). Na
    // primeira vez que a coluna é criada, faz backfill a partir do que já
    // existe em automacao_config, pra não depender de re-digitar tudo.
    const hasMetaAccountId = columns.some((c: any) => c.name === "meta_account_id");
    if (!hasMetaAccountId) {
      await db.exec(`ALTER TABLE controle_perfis ADD COLUMN meta_account_id TEXT`);

      await db.exec(`
        INSERT INTO controle_perfis (username, meta_account_id)
        SELECT ac.username, ac.meta_account_id
        FROM automacao_config ac
        WHERE ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
        ON CONFLICT(username) DO UPDATE SET meta_account_id = excluded.meta_account_id
      `);

      // Contas cujo username no cadastro difere só em maiúsculas/minúsculas do
      // usado em automacao_config (o ON CONFLICT acima é exato) — casa por
      // LOWER() pra não deixar essas de fora do backfill.
      await db.exec(`
        UPDATE controle_perfis
        SET meta_account_id = (
          SELECT ac.meta_account_id FROM automacao_config ac
          WHERE LOWER(ac.username) = LOWER(controle_perfis.username)
            AND ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
        )
        WHERE (meta_account_id IS NULL OR meta_account_id = '')
          AND EXISTS (
            SELECT 1 FROM automacao_config ac
            WHERE LOWER(ac.username) = LOWER(controle_perfis.username)
              AND ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
          )
      `);
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  // Create table for observations history
  await db.exec(`
    CREATE TABLE IF NOT EXISTS controle_perfis_obs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing observations from controle_perfis if any
  try {
    const countObs = await db.get("SELECT COUNT(*) as count FROM controle_perfis_obs");
    if (countObs && countObs.count === 0) {
      await db.exec(`
        INSERT INTO controle_perfis_obs (username, texto, criado_em)
        SELECT username, obs, datetime('now')
        FROM controle_perfis
        WHERE obs IS NOT NULL AND obs != ''
      `);
    }
  } catch (err) {
    console.error("Observation migration error:", err);
  }

  return db;
}

// ─────────────────────────────────────────────
// GET — busca todos os dados da aba Controle (Tratado para o Frontend)
// ─────────────────────────────────────────────
export async function GET() {
  try {
    const db = await getDb();

    // 1. Busca os perfis favoritados e junta com os dados manuais
    const linhasBanco = await db.all(`
      SELECT 
        pm.username,
        pm.foto_perfil_meta,
        ph.seguidores,
        ph.data_coleta,
        cp.nome,
        cp.nascimento,
        cp.email,
        cp.reserva,
        cp.linktree,
        cp.inicio,
        cp.telegram,
        cp.fotos_estoque,
        cp.status as status_controle,
        cp.obs,
        cp.foto_url,
        cp.meta_account_id
      FROM perfis_monitorados pm
      LEFT JOIN controle_perfis cp ON pm.username = cp.username
      LEFT JOIN (
        SELECT id, username, seguidores, data_coleta
        FROM perfis_historico
        WHERE id IN (
          SELECT MAX(id)
          FROM perfis_historico
          GROUP BY username
        )
      ) ph ON LOWER(pm.username) = LOWER(ph.username)
      WHERE pm.meu_perfil = 1 
      ORDER BY pm.username COLLATE NOCASE
    `);

    // 2. Busca todos os lançamentos para poder vincular aos perfis
    const todosLancamentos = await db.all(`SELECT * FROM lancamentos ORDER BY data_lancamento ASC`);

    // 3. Busca todo o histórico de observações
    const todasObs = await db.all(`SELECT * FROM controle_perfis_obs ORDER BY datetime(criado_em) DESC`);

    // 4. Busca quantidade de agendamentos futuros (status = 'AGENDADO') por username na tabela automacao_agendamentos
    const contagemReserva: { [username: string]: number } = {};
    try {
      const reservas = await db.all(`
        SELECT LOWER(username) as uname, COUNT(*) as total
        FROM automacao_agendamentos
        WHERE status = 'AGENDADO'
        GROUP BY LOWER(username)
      `);
      reservas.forEach((r: any) => {
        contagemReserva[r.uname] = r.total || 0;
      });
    } catch (err) {
      // Caso a tabela ainda não exista no banco
    }

    // 4.1 Busca quantidade de comentários e mensagens pendentes
    const contagemComentarios: { [username: string]: number } = {};
    const contagemMensagens: { [username: string]: number } = {};
    try {
      const coms = await db.all(`
        SELECT LOWER(modelo_username) as uname, COUNT(*) as total
        FROM instagram_comentarios
        WHERE COALESCE(respondido, 0) = 0
        GROUP BY LOWER(modelo_username)
      `);
      coms.forEach((c: any) => { contagemComentarios[c.uname] = Number(c.total || 0); });

      const msgs = await db.all(`
        SELECT LOWER(modelo_username) as uname, COUNT(*) as total
        FROM instagram_mensagens
        WHERE COALESCE(respondida, 0) = 0
        GROUP BY LOWER(modelo_username)
      `);
      msgs.forEach((m: any) => { contagemMensagens[m.uname] = Number(m.total || 0); });
    } catch (err) {
      // Tabelas podem não ter registros ainda
    }

    // 4.2 Busca a data/hora da última execução da Ingestão da Meta API
    let ultimaExecucaoMeta: string | null = null;
    try {
      const snapMeta = await db.get(`
        SELECT MAX(data_carga) as max_data
        FROM posts_metricas_snapshots
        WHERE data_carga IS NOT NULL
      `);
      if (snapMeta?.max_data) {
        ultimaExecucaoMeta = snapMeta.max_data;
      } else {
        const perfMeta = await db.get(`
          SELECT MAX(data_carga) as max_data
          FROM perfis_historico
          WHERE data_carga IS NOT NULL
        `);
        if (perfMeta?.max_data) {
          ultimaExecucaoMeta = perfMeta.max_data;
        }
      }
    } catch (err) {
      console.warn("Aviso ao buscar última execução Meta:", err);
    }

    // 4.3 Métricas de visualizações dos posts e variação de seguidores por modelo
    const viewsDiaMap: Record<string, number> = {};
    const viewsDeltaMap: Record<string, number> = {};
    const segDeltaColetaMap: Record<string, number> = {};
    const segDeltaDiaMap: Record<string, number> = {};

    try {
      // Data de hoje no fuso oficial de Brasília (America/Sao_Paulo)
      const hojeStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      let limiteHoje = `${hojeStr} 00:00:00`;

      const maxCargaRow = await db.get(`SELECT MAX(data_carga) as max_c FROM posts_metricas_snapshots`).catch(() => null);
      if (maxCargaRow?.max_c) {
        const diaUltimaCarga = String(maxCargaRow.max_c).substring(0, 10);
        if (diaUltimaCarga < hojeStr) {
          limiteHoje = `${diaUltimaCarga} 00:00:00`;
        }
      }

      // 1) Duas últimas cargas de snapshots para delta do último ciclo
      const ultimasCargas = await db.all(`
        SELECT DISTINCT data_carga
        FROM posts_metricas_snapshots
        WHERE data_carga IS NOT NULL
        ORDER BY data_carga DESC
        LIMIT 2
      `).catch(() => []);

      if (ultimasCargas.length >= 2) {
        const uCarga = ultimasCargas[0].data_carga;
        const pCarga = ultimasCargas[1].data_carga;

        const postDiffRows = await db.all(`
          SELECT 
            su.post_id,
            LOWER(su.username) as uname,
            su.views as v_u,
            sp.views as v_p,
            p.data_postagem,
            CASE 
              WHEN sp.views IS NOT NULL AND sp.views > 0 THEN MAX(0, su.views - sp.views)
              WHEN p.data_postagem >= ? THEN su.views
              ELSE 0 
            END as delta_real
          FROM posts_metricas_snapshots su
          JOIN posts_historico p ON p.post_id = su.post_id
          LEFT JOIN posts_metricas_snapshots sp ON sp.post_id = su.post_id AND sp.data_carga = ?
          WHERE su.data_carga = ?
        `, [limiteHoje, pCarga, uCarga]).catch(() => []);

        for (const row of postDiffRows) {
          const delta = Math.max(0, Number(row.delta_real) || 0);
          viewsDeltaMap[row.uname] = (viewsDeltaMap[row.uname] || 0) + delta;
        }
      }

      // 2) Views ganhas hoje
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
        }
      }

      // 3) Histórico de seguidores para variação da última coleta e no dia
      const phRows = await db.all(`
        SELECT LOWER(username) as uname, data_coleta, seguidores
        FROM perfis_historico
        WHERE seguidores > 0
        ORDER BY data_coleta ASC, id ASC
      `).catch(() => []);

      const shRows = await db.all(`
        SELECT LOWER(username) as uname, data_coleta, total_seguidores as seguidores
        FROM seguidores_historico
        WHERE total_seguidores > 0
        ORDER BY data_coleta ASC, id ASC
      `).catch(() => []);

      const coletasByUser: Record<string, Record<string, number>> = {};
      for (const r of phRows) {
        (coletasByUser[r.uname] ??= {})[r.data_coleta] = Number(r.seguidores);
      }
      for (const r of shRows) {
        (coletasByUser[r.uname] ??= {})[r.data_coleta] = Number(r.seguidores);
      }

      for (const [u, mapDt] of Object.entries(coletasByUser)) {
        const arr = Object.entries(mapDt).sort((a, b) => a[0].localeCompare(b[0])).map(([dt, seg]) => ({ dt, seg }));
        if (arr.length > 0) {
          const atual = arr[arr.length - 1];
          if (arr.length > 1) {
            segDeltaColetaMap[u] = atual.seg - arr[arr.length - 2].seg;
          }
          const limite00 = `${atual.dt.substring(0, 10)} 00:00:00`;
          const antes00 = arr.filter(x => x.dt < limite00);
          const deHoje = arr.filter(x => x.dt >= limite00);
          const base = antes00.length > 0 ? antes00[antes00.length - 1] : (deHoje.length > 0 ? deHoje[0] : atual);
          if (base) {
            segDeltaDiaMap[u] = atual.seg - base.seg;
          }
        }
      }
    } catch (err) {
      console.warn("Aviso ao calcular métricas de controle:", err);
    }

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

      const postsHistoricoHoje = await db.all(`
        SELECT LOWER(username) as uname, formato, media_product_type
        FROM posts_historico
        WHERE (is_deleted IS NULL OR is_deleted = 0) AND data_postagem LIKE ?
      `, [`${hojeIso}%`]).catch(() => []);

      const histReelsMap: Record<string, number> = {};
      const histPostMap: Record<string, number> = {};

      for (const ph of postsHistoricoHoje) {
        const u = ph.uname;
        const fUpper = (ph.formato || '').toUpperCase();
        const mptUpper = (ph.media_product_type || '').toUpperCase();
        if (fUpper === 'REELS' || mptUpper === 'REELS' || fUpper === 'VIDEO') {
          histReelsMap[u] = (histReelsMap[u] || 0) + 1;
        } else {
          histPostMap[u] = (histPostMap[u] || 0) + 1;
        }
      }

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
        ...Object.keys(histReelsMap), ...Object.keys(histPostMap),
        ...Object.keys(autoReelsMap), ...Object.keys(autoPostMap), ...Object.keys(autoStoriesMap),
        ...Object.keys(agReelsMap), ...Object.keys(agPostMap), ...Object.keys(agStoriesMap)
      ]);

      for (const u of allUsers) {
        const st = getStatsModelo(u);
        st.postPub = Math.max(histPostMap[u] || 0, autoPostMap[u] || 0);
        st.reelsPub = Math.max(histReelsMap[u] || 0, autoReelsMap[u] || 0);
        st.storiesPub = autoStoriesMap[u] || 0;

        st.postAg = agPostMap[u] || 0;
        st.reelsAg = agReelsMap[u] || 0;
        st.storiesAg = agStoriesMap[u] || 0;
      }
    } catch (e) {
      console.warn("Aviso ao calcular stats de hoje em controle:", e);
    }

    // 5. Tratamento de Dados: Transforma 'null' em valores seguros que o React aceita

    // Agrupa lançamentos e observações por username uma única vez (O(n)) em vez de
    // filtrar os arrays inteiros para cada perfil dentro do .map() abaixo (O(perfis × n)).
    const lancamentosPorUsername: Record<string, any[]> = {};
    for (const l of todosLancamentos) {
      (lancamentosPorUsername[l.username] ??= []).push(l);
    }
    const obsPorUsername: Record<string, any[]> = {};
    for (const o of todasObs) {
      (obsPorUsername[o.username] ??= []).push(o);
    }

    const perfisTratados = linhasBanco.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const lancamentosDoPerfil = lancamentosPorUsername[p.username] || [];
      const obsDoPerfil = obsPorUsername[p.username] || [];

      // Quantidade de agendamentos futuros (reserva de posts)
      const totalReserva = contagemReserva[u] || 0;

      const nCom = contagemComentarios[u] || 0;
      const nMsg = contagemMensagens[u] || 0;
      const totalPend = nCom + nMsg;

      // Define uma data padrão segura de hoje caso o início seja nulo
      // para evitar que funções como calcDias(p.inicio) quebrem o componente
      const dataHoje = new Date().toISOString().split('T')[0];

      const fotoEfetiva = (p.foto_perfil_meta && String(p.foto_perfil_meta).trim().length > 0)
        ? p.foto_perfil_meta
        : (p.foto_url || '');

      return {
        username: p.username,
        seguidores: p.seguidores || 0,
        ultima_coleta: p.data_coleta || null,
        nome: p.nome || '',
        nascimento: p.nascimento || '',
        email: p.email || '',
        reserva: totalReserva,
        linktree: p.linktree || '',
        inicio: p.inicio || dataHoje, 
        telegram: p.telegram || '',
        fotos_estoque: p.fotos_estoque || 0,
        status: p.status_controle || '⏳ Aguardando',
        obs_historico: obsDoPerfil, // Histórico de observações
        foto_url: fotoEfetiva,
        meta_account_id: p.meta_account_id || '',
        foto_perfil_meta: p.foto_perfil_meta || null,
        foto_local: p.foto_url || null,
        comentarios_pendentes: nCom,
        mensagens_pendentes: nMsg,
        total_pendencias: totalPend,
        tem_pendencias: totalPend > 0,
        views_dia: viewsDiaMap[u] || 0,
        views_delta_ultima_carga: viewsDeltaMap[u] || 0,
        novos_seguidores_coleta: segDeltaColetaMap[u] || 0,
        novos_seguidores_dia: segDeltaDiaMap[u] || 0,
        hoje_post_pub: statsHojeMap[u]?.postPub || 0,
        hoje_post_ag: statsHojeMap[u]?.postAg || 0,
        hoje_reels_pub: statsHojeMap[u]?.reelsPub || 0,
        hoje_reels_ag: statsHojeMap[u]?.reelsAg || 0,
        hoje_stories_pub: statsHojeMap[u]?.storiesPub || 0,
        hoje_stories_ag: statsHojeMap[u]?.storiesAg || 0,
        lancamentos: lancamentosDoPerfil // Injeta obrigatoriamente um array []
      };
    });

    // Retorna a lista perfeitamente segura para o Frontend mapear sem erros
    return NextResponse.json({ 
      success: true, 
      perfis: perfisTratados,
      ultima_execucao_meta: ultimaExecucaoMeta
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });

  } catch (error: any) {
    console.error("Erro GET /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PUT — salva/atualiza dados manuais de um perfil
// Body: { username, nome, nascimento, email, reserva,
//         linktree, inicio, telegram, fotos_estoque, status, obs }
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // ==========================================
    // EDIÇÃO DE LANÇAMENTO
    // ==========================================
    if (body.id) {

      const db = await getDb();

      await db.run(`
        UPDATE lancamentos
        SET
          username = ?,
          tipo = ?,
          valor_brl = ?,
          valor_original = ?,
          moeda = ?,
          taxa_conversao = ?,
          data_lancamento = ?,
          descricao = ?
        WHERE id = ?
      `, [
        body.username,
        body.tipo,
        body.valor_brl,
        body.valor_original,
        body.moeda,
        body.taxa_conversao ?? 1,
        body.data_lancamento,
        body.descricao,
        body.id
      ]);

      return NextResponse.json({
        success: true,
        modo: "lancamento_editado"
      });
    }

    // ==========================================
    // EDIÇÃO DOS DADOS DO PERFIL
    // ==========================================

    const {
      username,
      nome,
      nascimento,
      email,
      reserva,
      linktree,
      inicio,
      telegram,
      fotos_estoque,
      status,
      foto_url,
      meta_account_id,
      nova_obs
    } = body;

    if (!username) throw new Error("username é obrigatório");

    const db = await getDb();

    // Insere nova observação se preenchida
    if (nova_obs && nova_obs.trim() !== '') {
      await db.run(`
        INSERT INTO controle_perfis_obs (username, texto)
        VALUES (?, ?)
      `, [username, nova_obs.trim()]);
    }

    await db.run(`
      INSERT INTO controle_perfis
        (username, nome, nascimento, email, reserva, linktree, inicio, telegram, fotos_estoque, status, foto_url, meta_account_id, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(username) DO UPDATE SET
        nome           = excluded.nome,
        nascimento     = excluded.nascimento,
        email          = excluded.email,
        reserva        = excluded.reserva,
        linktree       = excluded.linktree,
        inicio         = excluded.inicio,
        telegram       = excluded.telegram,
        fotos_estoque  = excluded.fotos_estoque,
        status         = excluded.status,
        foto_url       = excluded.foto_url,
        meta_account_id = excluded.meta_account_id,
        atualizado_em  = datetime('now')
    `, [username, nome, nascimento, email, reserva, linktree, inicio, telegram, fotos_estoque, status, foto_url, meta_account_id ?? '']);

    if (status && (status.includes('Morreu') || status === 'MORREU')) {
      await db.run(`UPDATE perfis_monitorados SET status = 'MORREU' WHERE username = ?`, [username]);
    } else if (status) {
      const perfMon = await db.get(`SELECT status FROM perfis_monitorados WHERE username = ?`, [username]);
      if (perfMon && perfMon.status === 'MORREU') {
        await db.run(`UPDATE perfis_monitorados SET status = 'ATIVO' WHERE username = ?`, [username]);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro PUT /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST — registra um lançamento (despesa ou recebido)
// Body: { username, tipo, valor_brl, valor_original, moeda,
//         taxa_conversao, data_lancamento, descricao,
//         rateio: boolean, perfis_rateio?: string[] }
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      username, tipo, valor_brl, valor_original, moeda,
      taxa_conversao, data_lancamento, descricao,
      rateio, perfis_rateio
    } = body;

    if (!username || !tipo || valor_brl == null) {
      throw new Error("username, tipo e valor_brl são obrigatórios");
    }

    const db = await getDb();
    const grupoRateio = rateio ? randomUUID() : null;

    if (rateio && perfis_rateio && perfis_rateio.length > 0) {
      // Insere um lançamento para cada perfil do rateio
      const valorPorPerfil = valor_brl / perfis_rateio.length;
      const valorOriginalPorPerfil = valor_original / perfis_rateio.length;

      const stmt = await db.prepare(`
        INSERT INTO lancamentos
          (username, tipo, valor_brl, valor_original, moeda, taxa_conversao,
           data_lancamento, descricao, rateado, grupo_rateio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      for (const u of perfis_rateio) {
        await stmt.run([
          u, tipo, valorPorPerfil, valorOriginalPorPerfil,
          moeda, taxa_conversao ?? 1,
          data_lancamento, descricao, grupoRateio
        ]);
      }
      await stmt.finalize();

    } else {
      // Lançamento individual
      await db.run(`
        INSERT INTO lancamentos
          (username, tipo, valor_brl, valor_original, moeda, taxa_conversao,
           data_lancamento, descricao, rateado, grupo_rateio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
      `, [
        username, tipo, valor_brl, valor_original,
        moeda, taxa_conversao ?? 1,
        data_lancamento, descricao
      ]);
    }

    return NextResponse.json({ success: true, grupo_rateio: grupoRateio });

  } catch (error: any) {
    console.error("Erro POST /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE — remove um lançamento pelo id
// ou um grupo de rateio inteiro pelo grupo_rateio
// Query params: ?id=123  ou  ?grupo_rateio=uuid
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const grupo = searchParams.get('grupo_rateio');

    if (!id && !grupo) throw new Error("Informe id ou grupo_rateio");

    const db = await getDb();

    if (grupo) {
      await db.run('DELETE FROM lancamentos WHERE grupo_rateio = ?', [grupo]);
    } else {
      await db.run('DELETE FROM lancamentos WHERE id = ?', [id]);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro DELETE /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}