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

    // 4. Consulta posts_historico para Desempenho por Dia da Postagem, contingência e
    // para o bloco de "Horário Real de Postagem" (baseado no resultado final de cada post,
    // não em snapshots de audiência). Exclui deletados e os stubs de importação corrompidos
    // (mesmo timestamp repetido, formato='Formato', sem legenda/permalink/dado real).
    const postsHistoricoRows = await db.all(
      `SELECT post_id, data_postagem, formato, views, reach, likes, comentarios, data_atualizacao
       FROM posts_historico
       WHERE LOWER(username) = LOWER(?) AND data_postagem LIKE '%:%'
         AND (is_deleted IS NULL OR is_deleted = 0)
         AND formato != 'Formato'
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

    // ─────────────────────────────────────────────────────────
    // 4B. HORÁRIO REAL DE POSTAGEM: desempenho de cada post pelo resultado final
    // (não por crescimento de audiência via snapshot — essa tabela tem buracos
    // grandes de histórico em vários perfis), agrupado por faixa de 2h e dia da
    // semana de QUANDO foi publicado. Usa MEDIANA (não média) para 1-2 posts
    // virais não distorcerem o horário "recomendado".
    //
    // Reels e Fotos/Carrossel NUNCA são misturados no mesmo cálculo — mesmo usando
    // curtidas (que existem nos dois formatos), um Reels tem alcance algorítmico
    // muito maior que uma foto de feed, então comparar os dois juntos continua
    // sendo comparar coisas diferentes. Cada formato vira seu próprio bloco
    // independente, cada um com sua métrica adequada (views pra Reels, curtidas
    // pra Fotos/Carrossel, já que "views" de foto é só um proxy de likes+comentários).
    // Formato com poucos posts NÃO é descartado nem diluído no outro — aparece do
    // mesmo jeito, só que marcado como baixa confiança até acumular mais dado.
    // ─────────────────────────────────────────────────────────
    const MIN_AMOSTRAS_FAIXA = 3;
    const MIN_AMOSTRAS_DIA = 3;
    const MIN_AMOSTRAS_CONFIAVEL = 6;

    function mediana(vals: number[]): number {
      if (vals.length === 0) return 0;
      const s = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    const postsParsed = postsHistoricoRows
      .map((p: any) => {
        const dt = parseSqliteDate(p.data_postagem);
        if (!dt) return null;
        const views = Math.max(
          Number(p.views) || 0,
          Number(p.reach) || 0,
          (Number(p.likes) || 0) + (Number(p.comentarios) || 0)
        );
        return {
          dt,
          hora: dt.getHours(),
          diaSemana: dt.getDay(),
          formato: p.formato,
          views,
          likes: Number(p.likes) || 0,
          dataAtualizacao: parseSqliteDate(p.data_atualizacao)
        };
      })
      .filter((p: any): p is NonNullable<typeof p> => p !== null);

    type PostParsed = (typeof postsParsed)[number];

    function calcularBlocoPostagem(postsBase: PostParsed[], campoMetrica: 'views' | 'likes', metricaLabel: string) {
      const faixasMap: { [f: number]: number[] } = {};
      for (let f = 0; f < 24; f += 2) faixasMap[f] = [];
      for (const p of postsBase) {
        faixasMap[Math.floor(p.hora / 2) * 2].push(p[campoMetrica]);
      }

      let melhorFaixaInicio = 15;
      let melhorFaixaMediana = -1;
      let faixaMaxMediana = 0;
      for (let f = 0; f < 24; f += 2) {
        const vals = faixasMap[f];
        const med = mediana(vals);
        if (vals.length >= MIN_AMOSTRAS_FAIXA && med > melhorFaixaMediana) {
          melhorFaixaMediana = med;
          melhorFaixaInicio = f;
        }
        if (med > faixaMaxMediana) faixaMaxMediana = med;
      }
      const faixasList = [];
      for (let f = 0; f < 24; f += 2) {
        const vals = faixasMap[f];
        const med = mediana(vals);
        const media = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const fFim = (f + 2) % 24;
        faixasList.push({
          faixa: `${String(f).padStart(2, '0')}:00 - ${String(fFim).padStart(2, '0')}:00`,
          horaInicio: f,
          mediana: Math.round(med),
          media: Math.round(media),
          amostras: vals.length,
          percentual: faixaMaxMediana > 0 ? Math.round((med / faixaMaxMediana) * 100) : 0,
          isMelhor: f === melhorFaixaInicio && melhorFaixaMediana > 0
        });
      }

      const diasMap: { [d: number]: number[] } = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      for (const p of postsBase) diasMap[p.diaSemana].push(p[campoMetrica]);
      let melhorDiaIndex = -1;
      let melhorDiaMediana = -1;
      let diaMaxMediana = 0;
      for (let d = 0; d < 7; d++) {
        const vals = diasMap[d];
        const med = mediana(vals);
        if (vals.length >= MIN_AMOSTRAS_DIA && med > melhorDiaMediana) {
          melhorDiaMediana = med;
          melhorDiaIndex = d;
        }
        if (med > diaMaxMediana) diaMaxMediana = med;
      }
      const diasList = [];
      for (const dIdx of ORDEM_DIAS) {
        const vals = diasMap[dIdx];
        const med = mediana(vals);
        const media = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const { nome, curto } = DIAS_NOMES[dIdx];
        diasList.push({
          dia: nome,
          diaCurto: curto,
          diaIndex: dIdx,
          mediana: Math.round(med),
          media: Math.round(media),
          amostras: vals.length,
          percentual: diaMaxMediana > 0 ? Math.round((med / diaMaxMediana) * 100) : 0,
          destaque: dIdx === melhorDiaIndex && melhorDiaMediana > 0
        });
      }

      const amostrasMelhorFaixa = melhorFaixaMediana > 0 ? faixasMap[melhorFaixaInicio].length : 0;
      const fFimPost = (melhorFaixaInicio + 2) % 24;

      return {
        metricaLabel,
        postsConsiderados: postsBase.length,
        temDados: melhorFaixaMediana > 0,
        amostraBaixa: melhorFaixaMediana > 0 ? amostrasMelhorFaixa < MIN_AMOSTRAS_CONFIAVEL : true,
        melhorFaixaAmostras: amostrasMelhorFaixa,
        melhorFaixa: melhorFaixaMediana > 0
          ? `${String(melhorFaixaInicio).padStart(2, '0')}:00 às ${String(fFimPost).padStart(2, '0')}:00`
          : undefined,
        melhorFaixaInicio,
        melhorFaixaFim: fFimPost,
        melhorFaixaValor: melhorFaixaMediana > 0 ? Math.round(melhorFaixaMediana) : 0,
        faixas: faixasList,
        melhorDia: melhorDiaIndex >= 0 ? DIAS_NOMES[melhorDiaIndex].nome : undefined,
        dias: diasList,
        observacao: postsBase.length === 0
          ? 'Nenhum post desse formato publicado ainda.'
          : melhorFaixaMediana > 0
            ? (amostrasMelhorFaixa < MIN_AMOSTRAS_CONFIAVEL
              ? `A faixa vencedora teve só ${amostrasMelhorFaixa} post(s) publicado(s) nela — é o mínimo pra entrar na disputa, mas ainda é pouco pra confiar de olhos fechados. Outras faixas com números maiores podem estar aparecendo só porque tiveram 1-2 posts (inclusive algum viral isolado), não porque o horário funciona melhor.`
              : undefined)
            : `Só ${postsBase.length} post(s) desse formato até agora — nenhuma faixa bateu o mínimo de 3 posts ainda para recomendar um horário com confiança.`
      };
    }

    const reelsPosts = postsParsed.filter((p: any) => p.formato === 'Reels');
    const fotosPosts = postsParsed.filter((p: any) => p.formato !== 'Reels');

    const postagemReels = calcularBlocoPostagem(reelsPosts, 'views', `views de Reels (${reelsPosts.length} posts)`);
    const postagemFotos = calcularBlocoPostagem(fotosPosts, 'likes', `curtidas de Fotos/Carrossel (${fotosPosts.length} posts)`);

    // --- Qualidade de dados: posts cujo tracking "morreu" (Meta parou de mandar update) ---
    const datasAtualizacao = postsParsed
      .map((p: any) => p.dataAtualizacao)
      .filter((d: any): d is Date => d !== null);
    const ultimaAtualizacaoGeral = datasAtualizacao.length > 0
      ? new Date(Math.max(...datasAtualizacao.map((d: Date) => d.getTime())))
      : null;
    // O pipeline de ingestão atualiza posts em ciclos (não todos a cada run), então gaps de
    // até ~3 semanas entre atualizações são normais. Testado contra dados reais: perfis com
    // posts "vivos" mostram gap máximo de ~22 dias; posts com tracking realmente morto (a Meta
    // parou de mandar dado) pulam pra 70+ dias sem nenhuma atualização. 35 dias separa os dois casos.
    const LIMITE_DIAS_DESATUALIZADO = 35;
    let postsDesatualizados = 0;
    if (ultimaAtualizacaoGeral) {
      for (const p of postsParsed) {
        if (!p.dataAtualizacao) continue;
        const diasSemUpdate = (ultimaAtualizacaoGeral.getTime() - p.dataAtualizacao.getTime()) / (1000 * 60 * 60 * 24);
        const diasDesdePostagem = (ultimaAtualizacaoGeral.getTime() - p.dt.getTime()) / (1000 * 60 * 60 * 24);
        if (diasSemUpdate > LIMITE_DIAS_DESATUALIZADO && diasDesdePostagem > LIMITE_DIAS_DESATUALIZADO) {
          postsDesatualizados++;
        }
      }
    }

    const postagem = {
      reels: postagemReels,
      fotos: postagemFotos,
      qualidadeDados: {
        postsDesatualizados,
        percentualDesatualizado: postsParsed.length > 0 ? Math.round((postsDesatualizados / postsParsed.length) * 100) : 0,
        observacao: postsDesatualizados > 0
          ? `${postsDesatualizados} post(s) pararam de receber atualização da Meta (métrica congelada) e foram mantidos no cálculo mesmo assim — resultado pode estar levemente subestimado para eles.`
          : undefined
      }
    };

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
      },
      postagem
    });
  } catch (err: any) {
    console.error('[api/perfis/melhores-horarios] Erro:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
