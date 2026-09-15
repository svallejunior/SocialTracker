import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DIAS_NOMES: { [k: number]: { nome: string; curto: string } } = {
  0: { nome: 'Domingo', curto: 'DOM' },
  1: { nome: 'Segunda-feira', curto: 'SEG' },
  2: { nome: 'Terça-feira', curto: 'TER' },
  3: { nome: 'Quarta-feira', curto: 'QUA' },
  4: { nome: 'Quinta-feira', curto: 'QUI' },
  5: { nome: 'Sexta-feira', curto: 'SEX' },
  6: { nome: 'Sábado', curto: 'SÁB' }
};

// Ordem amigável de exibição (Segunda a Domingo)
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

function parseSqliteDate(str: string): Date | null {
  if (!str) return null;
  // Converte "YYYY-MM-DD HH:MM:SS" em formato ISO aceito pelo Date
  const isoStr = str.includes('T') ? str : str.replace(' ', 'T');
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = (searchParams.get('username') || '').trim();

    if (!username) {
      return NextResponse.json({ success: false, error: 'Username não informado' }, { status: 400 });
    }

    const db = await getDb();

    // 1. Dados básicos do perfil
    const perfil = await db.get(
      `SELECT username, status, foto_perfil_meta FROM perfis_monitorados WHERE LOWER(username) = LOWER(?)`,
      [username]
    );
    const pCtrl = await db.get(
      `SELECT nome, foto_url, foto_perfil_meta FROM controle_perfis WHERE LOWER(username) = LOWER(?)`,
      [username]
    );

    const nomeExibicao = pCtrl?.nome || username;
    const fotoExibicao = pCtrl?.foto_perfil_meta || perfil?.foto_perfil_meta || pCtrl?.foto_url || null;

    // 2. Análise de Seguidores (perfis_historico + seguidores_historico)
    const historicoPh = await db.all(
      `SELECT data_coleta, seguidores
       FROM perfis_historico
       WHERE LOWER(username) = LOWER(?) AND data_coleta LIKE '%:%'
       ORDER BY data_coleta ASC`,
      [username]
    );

    const historicoSh = await db.all(
      `SELECT data_coleta, total_seguidores as seguidores
       FROM seguidores_historico
       WHERE LOWER(username) = LOWER(?) AND data_coleta LIKE '%:%'
       ORDER BY data_coleta ASC`,
      [username]
    );

    // Mescla e desduplica por data_coleta
    const mapColetas: { [dt: string]: number } = {};
    for (const h of historicoPh) {
      if (h.data_coleta && h.seguidores > 0) {
        mapColetas[h.data_coleta] = Number(h.seguidores);
      }
    }
    for (const sh of historicoSh) {
      if (sh.data_coleta && sh.seguidores > 0) {
        mapColetas[sh.data_coleta] = Number(sh.seguidores);
      }
    }

    const coletasOrdenadas = Object.entries(mapColetas)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dt, seg]) => ({ data_coleta: dt, seguidores: seg }));

    // Contagem de leituras por data (YYYY-MM-DD).
    // O usuário relatou que antes realizava coletas apenas 1x ao dia (entre 5h e 8h),
    // o que acumulava o ganho de 24h na manhã e distorcia a melhor faixa.
    // Desprezamos dias com poucas coletas (< 6 coletas no dia).
    const leiturasPorDia: { [dia: string]: number } = {};
    for (const c of coletasOrdenadas) {
      const dia = c.data_coleta.substring(0, 10);
      leiturasPorDia[dia] = (leiturasPorDia[dia] || 0) + 1;
    }

    const MIN_COLETAS_DIA = 6;
    const diasValidos = new Set<string>(
      Object.entries(leiturasPorDia)
        .filter(([_, cnt]) => cnt >= MIN_COLETAS_DIA)
        .map(([dia]) => dia)
    );
    const diasDescartadosCount = Object.keys(leiturasPorDia).length - diasValidos.size;
    const diasValidosCount = diasValidos.size;

    // Faixas de 2 horas (00h-02h, 02h-04h, ..., 22h-00h)
    const faixasSeguidores: {
      [f: number]: {
        ganhoTotal: number;
        amostras: number;
        ganhoMedio: number;
      };
    } = {};

    for (let f = 0; f < 24; f += 2) {
      faixasSeguidores[f] = { ganhoTotal: 0, amostras: 0, ganhoMedio: 0 };
    }

    const diasSeguidoresMap: { [d: number]: { ganhoTotal: number; amostras: number } } = {
      0: { ganhoTotal: 0, amostras: 0 },
      1: { ganhoTotal: 0, amostras: 0 },
      2: { ganhoTotal: 0, amostras: 0 },
      3: { ganhoTotal: 0, amostras: 0 },
      4: { ganhoTotal: 0, amostras: 0 },
      5: { ganhoTotal: 0, amostras: 0 },
      6: { ganhoTotal: 0, amostras: 0 }
    };

    let totalGanhosAnalisados = 0;

    for (let i = 1; i < coletasOrdenadas.length; i++) {
      const prev = coletasOrdenadas[i - 1];
      const curr = coletasOrdenadas[i];

      const diaPrev = prev.data_coleta.substring(0, 10);
      const diaCurr = curr.data_coleta.substring(0, 10);

      // Despreza medições de dias com poucas coletas
      if (!diasValidos.has(diaPrev) || !diasValidos.has(diaCurr)) {
        continue;
      }

      const dtPrev = parseSqliteDate(prev.data_coleta);
      const dtCurr = parseSqliteDate(curr.data_coleta);

      if (!dtPrev || !dtCurr) continue;

      const diffHoras = (dtCurr.getTime() - dtPrev.getTime()) / (1000 * 60 * 60);

      // Considera intervalos curtos de amostragem periódica (máximo 2.5 horas)
      // Evita imputar gaps longos ou intervalos noturnos a uma única faixa de 2h
      if (diffHoras > 0 && diffHoras <= 2.5) {
        const diffSeg = curr.seguidores - prev.seguidores;
        // Filtra ganhos positivos reais (exclui ruídos de coleta > 10.000)
        if (diffSeg > 0 && diffSeg < 10000) {
          const hora = dtCurr.getHours();
          const faixaInicio = Math.floor(hora / 2) * 2;
          const diaSemana = dtCurr.getDay();

          if (faixasSeguidores[faixaInicio]) {
            faixasSeguidores[faixaInicio].ganhoTotal += diffSeg;
            faixasSeguidores[faixaInicio].amostras += 1;
            totalGanhosAnalisados++;
          }

          if (diasSeguidoresMap[diaSemana]) {
            diasSeguidoresMap[diaSemana].ganhoTotal += diffSeg;
            diasSeguidoresMap[diaSemana].amostras += 1;
          }
        }
      }
    }

    for (let f = 0; f < 24; f += 2) {
      const item = faixasSeguidores[f];
      item.ganhoMedio = item.amostras > 0 ? Math.round((item.ganhoTotal / item.amostras) * 10) / 10 : 0;
    }

    let melhorFaixaSeguidoresInicio = 18; // default 18h se sem dados
    let maxGanhoSeguidores = -1;

    for (let f = 0; f < 24; f += 2) {
      if (faixasSeguidores[f].ganhoTotal > maxGanhoSeguidores) {
        maxGanhoSeguidores = faixasSeguidores[f].ganhoTotal;
        melhorFaixaSeguidoresInicio = f;
      }
    }

    const temDadosSeguidores = maxGanhoSeguidores > 0;

    const listaFaixasSeguidores = [];
    for (let f = 0; f < 24; f += 2) {
      const fFim = (f + 2) % 24;
      const fLabel = `${String(f).padStart(2, '0')}:00 - ${String(fFim).padStart(2, '0')}:00`;
      const ganho = faixasSeguidores[f].ganhoTotal;
      const pct = maxGanhoSeguidores > 0 ? Math.round((ganho / maxGanhoSeguidores) * 100) : 0;
      listaFaixasSeguidores.push({
        faixa: fLabel,
        horaInicio: f,
        ganhoTotal: ganho,
        ganhoMedio: faixasSeguidores[f].ganhoMedio,
        amostras: faixasSeguidores[f].amostras,
        percentual: pct,
        isMelhor: temDadosSeguidores && f === melhorFaixaSeguidoresInicio
      });
    }

    // 3. Análise de Visualizações baseada em Snapshots Periódicos de Métricas
    // Mede os horários e dias em que os posts são mais assistidos (audiência real ao longo do dia/semana),
    // levando em conta fotos (onde views = max(views, reach, likes + comentarios)).
    const snapshotsRows = await db.all(
      `SELECT post_id, data_carga, views, reach, likes, comentarios
       FROM posts_metricas_snapshots
       WHERE (LOWER(username) = LOWER(?) OR username = ?) AND data_carga LIKE '%:%'
       ORDER BY post_id ASC, data_carga ASC`,
      [username, username]
    );

    const faixasViews: {
      [f: number]: {
        viewsTotal: number;
        amostras: number;
        viewsMedia: number;
        viewsMediana: number;
      };
    } = {};

    for (let f = 0; f < 24; f += 2) {
      faixasViews[f] = { viewsTotal: 0, amostras: 0, viewsMedia: 0, viewsMediana: 0 };
    }

    const diasViewsMap: { [d: number]: { viewsTotal: number; amostras: number } } = {
      0: { viewsTotal: 0, amostras: 0 },
      1: { viewsTotal: 0, amostras: 0 },
      2: { viewsTotal: 0, amostras: 0 },
      3: { viewsTotal: 0, amostras: 0 },
      4: { viewsTotal: 0, amostras: 0 },
      5: { viewsTotal: 0, amostras: 0 },
      6: { viewsTotal: 0, amostras: 0 }
    };

    let totalViewsGanhas = 0;
    let totalCiclosViews = 0;

    // Agrupa snapshots por post_id
    const snapshotsPorPost: { [postId: string]: Array<{ dt: Date; views: number }> } = {};
    for (const snap of snapshotsRows) {
      const dt = parseSqliteDate(snap.data_carga);
      const v = Math.max(
        Number(snap.views) || 0,
        Number(snap.reach) || 0,
        (Number(snap.likes) || 0) + (Number(snap.comentarios) || 0)
      );
      if (!dt || v <= 0) continue;
      if (!snapshotsPorPost[snap.post_id]) {
        snapshotsPorPost[snap.post_id] = [];
      }
      snapshotsPorPost[snap.post_id].push({ dt, views: v });
    }

    for (const postId in snapshotsPorPost) {
      const list = snapshotsPorPost[postId];
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const curr = list[i];

        const diffV = curr.views - prev.views;
        if (diffV <= 0 || diffV > 100000) continue;

        const diffHoras = (curr.dt.getTime() - prev.dt.getTime()) / (1000 * 60 * 60);
        // Amostragem contínua periódica (até 2.5 horas)
        if (diffHoras > 0 && diffHoras <= 2.5) {
          const hora = curr.dt.getHours();
          const faixaInicio = Math.floor(hora / 2) * 2;
          const diaSemana = curr.dt.getDay(); // 0 = Domingo, 1 = Segunda, ...

          if (faixasViews[faixaInicio]) {
            faixasViews[faixaInicio].viewsTotal += diffV;
            faixasViews[faixaInicio].amostras += 1;
          }

          if (diasViewsMap[diaSemana]) {
            diasViewsMap[diaSemana].viewsTotal += diffV;
            diasViewsMap[diaSemana].amostras += 1;
          }

          totalViewsGanhas += diffV;
          totalCiclosViews += 1;
        }
      }
    }

    let melhorFaixaViewsInicio = 18;
    let maxViewsFaixa = -1;

    for (let f = 0; f < 24; f += 2) {
      const item = faixasViews[f];
      item.viewsMedia = item.amostras > 0 ? Math.round(item.viewsTotal / item.amostras) : 0;
      item.viewsMediana = item.viewsMedia;
      if (item.viewsTotal > maxViewsFaixa) {
        maxViewsFaixa = item.viewsTotal;
        melhorFaixaViewsInicio = f;
      }
    }

    let totalPostsAnalisados = Object.keys(snapshotsPorPost).length;

    // 4. Consulta posts_historico para Desempenho por Dia da Postagem e contingência
    const postsHistoricoRows = await db.all(
      `SELECT post_id, data_postagem, views, reach, likes, comentarios
       FROM posts_historico
       WHERE LOWER(username) = LOWER(?) AND data_postagem LIKE '%:%'
       ORDER BY data_postagem DESC`,
      [username]
    );

    const diasPostagemMap: { [d: number]: { viewsTotal: number; postsCount: number } } = {
      0: { viewsTotal: 0, postsCount: 0 },
      1: { viewsTotal: 0, postsCount: 0 },
      2: { viewsTotal: 0, postsCount: 0 },
      3: { viewsTotal: 0, postsCount: 0 },
      4: { viewsTotal: 0, postsCount: 0 },
      5: { viewsTotal: 0, postsCount: 0 },
      6: { viewsTotal: 0, postsCount: 0 }
    };

    for (const p of postsHistoricoRows) {
      const dt = parseSqliteDate(p.data_postagem);
      if (!dt) continue;
      const v = Math.max(
        Number(p.views) || 0,
        Number(p.reach) || 0,
        (Number(p.likes) || 0) + (Number(p.comentarios) || 0)
      );
      const diaSemana = dt.getDay();
      diasPostagemMap[diaSemana].viewsTotal += v;
      diasPostagemMap[diaSemana].postsCount += 1;
    }

    // Fallback: se o perfil não possuir snapshots periódicos registrados ainda,
    // utiliza os dados históricos de postagens como contingência para a audiência
    if (totalViewsGanhas === 0 && postsHistoricoRows.length > 0) {
      totalPostsAnalisados = postsHistoricoRows.length;
      for (const p of postsHistoricoRows) {
        const dt = parseSqliteDate(p.data_postagem);
        if (!dt) continue;
        const v = Math.max(
          Number(p.views) || 0,
          Number(p.reach) || 0,
          (Number(p.likes) || 0) + (Number(p.comentarios) || 0)
        );
        if (v <= 0) continue;
        const hora = dt.getHours();
        const faixaInicio = Math.floor(hora / 2) * 2;
        const diaSemana = dt.getDay();

        faixasViews[faixaInicio].viewsTotal += v;
        faixasViews[faixaInicio].amostras += 1;
        diasViewsMap[diaSemana].viewsTotal += v;
        diasViewsMap[diaSemana].amostras += 1;
      }
      for (let f = 0; f < 24; f += 2) {
        const item = faixasViews[f];
        item.viewsMedia = item.amostras > 0 ? Math.round(item.viewsTotal / item.amostras) : 0;
        item.viewsMediana = item.viewsMedia;
        if (item.viewsTotal > maxViewsFaixa) {
          maxViewsFaixa = item.viewsTotal;
          melhorFaixaViewsInicio = f;
        }
      }
    }

    const temDadosViews = maxViewsFaixa > 0;

    const listaFaixasViews = [];
    for (let f = 0; f < 24; f += 2) {
      const fFim = (f + 2) % 24;
      const fLabel = `${String(f).padStart(2, '0')}:00 - ${String(fFim).padStart(2, '0')}:00`;
      const item = faixasViews[f];
      const pct = maxViewsFaixa > 0 ? Math.round((item.viewsTotal / maxViewsFaixa) * 100) : 0;
      listaFaixasViews.push({
        faixa: fLabel,
        horaInicio: f,
        viewsMedia: item.viewsMedia,
        viewsMediana: item.viewsMediana,
        viewsTotal: item.viewsTotal,
        postsCount: item.amostras,
        amostras: item.amostras,
        percentual: pct,
        isMelhor: temDadosViews && f === melhorFaixaViewsInicio
      });
    }

    // 5. Formatação dos 3 Modos de Dias da Semana (Audiência, Seguidores e Dia da Postagem)
    // A) AUDIÊNCIA (visualizações consumidas ao longo da semana)
    const somaViewsAud = Object.values(diasViewsMap).reduce((acc, cur) => acc + cur.viewsTotal, 0);
    const mediaGeralViewsDia = somaViewsAud / 7;
    const diasIndicadosAud: string[] = [];
    let maxDiaViews = -1;
    for (let d = 0; d < 7; d++) {
      if (diasViewsMap[d].viewsTotal > maxDiaViews) {
        maxDiaViews = diasViewsMap[d].viewsTotal;
      }
    }
    const listaDiasAudiencia = [];
    for (const dIdx of ORDEM_DIAS) {
      const { nome, curto } = DIAS_NOMES[dIdx];
      const item = diasViewsMap[dIdx];
      const dTotal = item.viewsTotal;
      const dMedia = item.amostras > 0 ? Math.round(dTotal / item.amostras) : 0;
      const pctSobreMedia = mediaGeralViewsDia > 0 ? ((dTotal - mediaGeralViewsDia) / mediaGeralViewsDia) * 100 : 0;
      const destaque = pctSobreMedia >= 35 && dTotal > 0;
      if (destaque) {
        diasIndicadosAud.push(`${nome} (+${Math.round(pctSobreMedia)}%)`);
      }
      const pctRelativo = maxDiaViews > 0 ? Math.round((dTotal / maxDiaViews) * 100) : 0;
      listaDiasAudiencia.push({
        dia: nome,
        diaCurto: curto,
        diaIndex: dIdx,
        viewsTotal: dTotal,
        viewsMedia: dMedia,
        viewsMediana: dMedia,
        postsCount: item.amostras,
        amostras: item.amostras,
        percentual: pctRelativo,
        destaque
      });
    }

    // B) SEGUIDORES (novos seguidores ganhos por dia da semana)
    const somaSeguidoresDias = Object.values(diasSeguidoresMap).reduce((acc, cur) => acc + cur.ganhoTotal, 0);
    const mediaGeralSeguidoresDia = somaSeguidoresDias / 7;
    const diasIndicadosSeg: string[] = [];
    let maxDiaSeguidores = -1;
    for (let d = 0; d < 7; d++) {
      if (diasSeguidoresMap[d].ganhoTotal > maxDiaSeguidores) {
        maxDiaSeguidores = diasSeguidoresMap[d].ganhoTotal;
      }
    }
    const listaDiasSeguidores = [];
    for (const dIdx of ORDEM_DIAS) {
      const { nome, curto } = DIAS_NOMES[dIdx];
      const item = diasSeguidoresMap[dIdx];
      const dTotal = item.ganhoTotal;
      const dMedia = item.amostras > 0 ? Math.round((dTotal / item.amostras) * 10) / 10 : 0;
      const pctSobreMedia = mediaGeralSeguidoresDia > 0 ? ((dTotal - mediaGeralSeguidoresDia) / mediaGeralSeguidoresDia) * 100 : 0;
      const destaque = pctSobreMedia >= 35 && dTotal > 0;
      if (destaque) {
        diasIndicadosSeg.push(`${nome} (+${Math.round(pctSobreMedia)}%)`);
      }
      const pctRelativo = maxDiaSeguidores > 0 ? Math.round((dTotal / maxDiaSeguidores) * 100) : 0;
      listaDiasSeguidores.push({
        dia: nome,
        diaCurto: curto,
        diaIndex: dIdx,
        seguidoresTotal: dTotal,
        seguidoresMedia: dMedia,
        amostras: item.amostras,
        percentual: pctRelativo,
        destaque
      });
    }

    // C) DIA DA POSTAGEM (performance dos posts agrupados pela data de publicação)
    const somaViewsPostagem = Object.values(diasPostagemMap).reduce((acc, cur) => acc + cur.viewsTotal, 0);
    const somaPostsPostagem = Object.values(diasPostagemMap).reduce((acc, cur) => acc + cur.postsCount, 0);
    const mediaGeralViewsPorPost = somaPostsPostagem > 0 ? somaViewsPostagem / somaPostsPostagem : 0;
    const diasIndicadosPost: string[] = [];
    let maxDiaPostMedia = -1;
    for (let d = 0; d < 7; d++) {
      const item = diasPostagemMap[d];
      const med = item.postsCount > 0 ? item.viewsTotal / item.postsCount : 0;
      if (med > maxDiaPostMedia) {
        maxDiaPostMedia = med;
      }
    }
    const listaDiasPostagem = [];
    for (const dIdx of ORDEM_DIAS) {
      const { nome, curto } = DIAS_NOMES[dIdx];
      const item = diasPostagemMap[dIdx];
      const dTotal = item.viewsTotal;
      const dMedia = item.postsCount > 0 ? Math.round(dTotal / item.postsCount) : 0;
      const pctSobreMedia = mediaGeralViewsPorPost > 0 ? ((dMedia - mediaGeralViewsPorPost) / mediaGeralViewsPorPost) * 100 : 0;
      const destaque = pctSobreMedia >= 35 && item.postsCount > 0 && dMedia > 0;
      if (destaque) {
        diasIndicadosPost.push(`${nome} (+${Math.round(pctSobreMedia)}%)`);
      }
      const pctRelativo = maxDiaPostMedia > 0 ? Math.round((dMedia / maxDiaPostMedia) * 100) : 0;
      listaDiasPostagem.push({
        dia: nome,
        diaCurto: curto,
        diaIndex: dIdx,
        viewsTotal: dTotal,
        viewsMedia: dMedia,
        postsCount: item.postsCount,
        percentual: pctRelativo,
        destaque
      });
    }

    const fFimSeg = (melhorFaixaSeguidoresInicio + 2) % 24;
    const fFimView = (melhorFaixaViewsInicio + 2) % 24;

    return NextResponse.json({
      success: true,
      username,
      nome: nomeExibicao,
      foto_url: fotoExibicao,
      seguidores: {
        melhorFaixa: `${String(melhorFaixaSeguidoresInicio).padStart(2, '0')}:00 às ${String(fFimSeg).padStart(2, '0')}:00`,
        melhorFaixaInicio: melhorFaixaSeguidoresInicio,
        melhorFaixaFim: fFimSeg,
        ganhoTotalFaixa: faixasSeguidores[melhorFaixaSeguidoresInicio]?.ganhoTotal || 0,
        ganhoMedioFaixa: faixasSeguidores[melhorFaixaSeguidoresInicio]?.ganhoMedio || 0,
        totalGanhosAnalisados,
        diasValidosCount,
        diasDescartadosCount,
        faixas: listaFaixasSeguidores,
        temDados: temDadosSeguidores,
        observacaoFiltro: diasDescartadosCount > 0
          ? `Filtro ativo: ${diasDescartadosCount} dia(s) com coletas esparsas (1x/dia) foram descartados.`
          : undefined,
        observacao: temDadosSeguidores
          ? undefined
          : diasValidosCount === 0
            ? 'Aguardando mais dias com coletas frequentes (dias com apenas 1 leitura diária foram descartados para evitar distorções).'
            : 'Poucos registros de variação horária coletados ainda. A estimativa será aprimorada nos próximos ciclos.'
      },
      visualizacoes: {
        melhorFaixa: `${String(melhorFaixaViewsInicio).padStart(2, '0')}:00 às ${String(fFimView).padStart(2, '0')}:00`,
        melhorFaixaInicio: melhorFaixaViewsInicio,
        melhorFaixaFim: fFimView,
        viewsTotalFaixa: faixasViews[melhorFaixaViewsInicio]?.viewsTotal || 0,
        viewsMediaFaixa: faixasViews[melhorFaixaViewsInicio]?.viewsMedia || 0,
        viewsMedianaFaixa: faixasViews[melhorFaixaViewsInicio]?.viewsMediana || 0,
        totalViewsGanhas,
        totalPostsAnalisados,
        faixas: listaFaixasViews,
        diasSemana: listaDiasAudiencia, // mantido para compatibilidade
        diasAudiencia: {
          dias: listaDiasAudiencia,
          diasIndicados: diasIndicadosAud,
          houveDiscrepancia: diasIndicadosAud.length > 0,
          totalViews: somaViewsAud
        },
        diasSeguidores: {
          dias: listaDiasSeguidores,
          diasIndicados: diasIndicadosSeg,
          houveDiscrepancia: diasIndicadosSeg.length > 0,
          totalSeguidores: somaSeguidoresDias
        },
        diasPostagem: {
          dias: listaDiasPostagem,
          diasIndicados: diasIndicadosPost,
          houveDiscrepancia: diasIndicadosPost.length > 0,
          totalPosts: somaPostsPostagem,
          totalViews: somaViewsPostagem
        },
        houveDiscrepancia: diasIndicadosAud.length > 0,
        diasIndicados: diasIndicadosAud,
        temDados: temDadosViews,
        observacao: temDadosViews
          ? undefined
          : 'Nenhum registro de visualizações medido para este perfil ainda.'
      }
    });
  } catch (err: any) {
    console.error('[api/perfis/melhores-horarios] Erro:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
