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
      `SELECT username, nome, foto_url, foto_perfil_meta FROM perfis_monitorados WHERE LOWER(username) = LOWER(?)`,
      [username]
    );
    const pCtrl = await db.get(
      `SELECT nome, foto_url FROM controle_perfis WHERE LOWER(username) = LOWER(?)`,
      [username]
    );

    const nomeExibicao = pCtrl?.nome || perfil?.nome || username;
    const fotoExibicao = perfil?.foto_perfil_meta || perfil?.foto_url || pCtrl?.foto_url || null;

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

    let totalGanhosAnalisados = 0;

    for (let i = 1; i < coletasOrdenadas.length; i++) {
      const prev = coletasOrdenadas[i - 1];
      const curr = coletasOrdenadas[i];

      const dtPrev = parseSqliteDate(prev.data_coleta);
      const dtCurr = parseSqliteDate(curr.data_coleta);

      if (!dtPrev || !dtCurr) continue;

      const diffHoras = (dtCurr.getTime() - dtPrev.getTime()) / (1000 * 60 * 60);

      // Considera intervalos de amostragem razoáveis (até 36h)
      if (diffHoras > 0 && diffHoras <= 36) {
        const diffSeg = curr.seguidores - prev.seguidores;
        // Filtra ganhos positivos reais (exclui ruídos de coleta > 10.000)
        if (diffSeg > 0 && diffSeg < 10000) {
          const hora = dtCurr.getHours();
          const faixaInicio = Math.floor(hora / 2) * 2;

          if (faixasSeguidores[faixaInicio]) {
            faixasSeguidores[faixaInicio].ganhoTotal += diffSeg;
            faixasSeguidores[faixaInicio].amostras += 1;
            totalGanhosAnalisados++;
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

    // 3. Análise de Visualizações (posts_historico)
    const posts = await db.all(
      `SELECT post_id, data_postagem, views, likes, comentarios, formato
       FROM posts_historico
       WHERE LOWER(username) = LOWER(?) AND views > 0 AND data_postagem LIKE '%:%'
       ORDER BY data_postagem DESC`,
      [username]
    );

    const faixasViews: {
      [f: number]: {
        viewsArray: number[];
        viewsTotal: number;
        viewsMedia: number;
        viewsMediana: number;
        postsCount: number;
      };
    } = {};

    for (let f = 0; f < 24; f += 2) {
      faixasViews[f] = { viewsArray: [], viewsTotal: 0, viewsMedia: 0, viewsMediana: 0, postsCount: 0 };
    }

    const diasViewsMap: { [d: number]: number[] } = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
    };

    let somaViewsTotalGeral = 0;

    for (const p of posts) {
      const dt = parseSqliteDate(p.data_postagem);
      if (!dt) continue;

      const v = Number(p.views) || 0;
      if (v <= 0) continue;

      somaViewsTotalGeral += v;

      const hora = dt.getHours();
      const faixaInicio = Math.floor(hora / 2) * 2;
      const diaSemana = dt.getDay(); // 0 a 6

      if (faixasViews[faixaInicio]) {
        faixasViews[faixaInicio].viewsArray.push(v);
        faixasViews[faixaInicio].viewsTotal += v;
        faixasViews[faixaInicio].postsCount += 1;
      }

      diasViewsMap[diaSemana].push(v);
    }

    let maxMediaViews = -1;
    let melhorFaixaViewsInicio = 18; // default 18h se sem dados

    for (let f = 0; f < 24; f += 2) {
      const item = faixasViews[f];
      if (item.postsCount > 0) {
        item.viewsMedia = Math.round(item.viewsTotal / item.postsCount);
        const sorted = [...item.viewsArray].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        item.viewsMediana = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

        if (item.viewsMedia > maxMediaViews) {
          maxMediaViews = item.viewsMedia;
          melhorFaixaViewsInicio = f;
        }
      }
    }

    const temDadosViews = posts.length > 0 && maxMediaViews > 0;

    const listaFaixasViews = [];
    for (let f = 0; f < 24; f += 2) {
      const fFim = (f + 2) % 24;
      const fLabel = `${String(f).padStart(2, '0')}:00 - ${String(fFim).padStart(2, '0')}:00`;
      const item = faixasViews[f];
      const pct = maxMediaViews > 0 ? Math.round((item.viewsMedia / maxMediaViews) * 100) : 0;
      listaFaixasViews.push({
        faixa: fLabel,
        horaInicio: f,
        viewsMedia: item.viewsMedia,
        viewsMediana: item.viewsMediana,
        viewsTotal: item.viewsTotal,
        postsCount: item.postsCount,
        percentual: pct,
        isMelhor: temDadosViews && f === melhorFaixaViewsInicio
      });
    }

    // Análise de Dias da Semana & Discrepância
    const mediaGeralViews = posts.length > 0 ? somaViewsTotalGeral / posts.length : 0;
    const diasIndicados: string[] = [];
    const listaDiasSemana = [];

    for (const dIdx of ORDEM_DIAS) {
      const { nome, curto } = DIAS_NOMES[dIdx];
      const arr = diasViewsMap[dIdx] || [];
      const count = arr.length;
      let dMedia = 0;
      let dMediana = 0;

      if (count > 0) {
        const dTotal = arr.reduce((acc, curr) => acc + curr, 0);
        dMedia = Math.round(dTotal / count);
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        dMediana = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      }

      // Discrepância acentuada: dia rende 30% ou mais acima da média global
      const ratio = mediaGeralViews > 0 ? dMedia / mediaGeralViews : 1.0;
      const destaque = count >= 1 && ratio >= 1.3;

      if (destaque) {
        const pctExtra = Math.round((ratio - 1.0) * 100);
        diasIndicados.push(`${nome} (+${pctExtra}%)`);
      }

      const pctRelativo = maxMediaViews > 0 ? Math.min(100, Math.round((dMedia / maxMediaViews) * 100)) : 0;

      listaDiasSemana.push({
        dia: nome,
        diaCurto: curto,
        diaIndex: dIdx,
        viewsMedia: dMedia,
        viewsMediana: dMediana,
        postsCount: count,
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
        faixas: listaFaixasSeguidores,
        temDados: temDadosSeguidores,
        observacao: temDadosSeguidores
          ? undefined
          : 'Poucos registros de variação horária coletados ainda. A estimativa será aprimorada nos próximos ciclos.'
      },
      visualizacoes: {
        melhorFaixa: `${String(melhorFaixaViewsInicio).padStart(2, '0')}:00 às ${String(fFimView).padStart(2, '0')}:00`,
        melhorFaixaInicio: melhorFaixaViewsInicio,
        melhorFaixaFim: fFimView,
        viewsMediaFaixa: faixasViews[melhorFaixaViewsInicio]?.viewsMedia || 0,
        viewsMedianaFaixa: faixasViews[melhorFaixaViewsInicio]?.viewsMediana || 0,
        totalPostsAnalisados: posts.length,
        faixas: listaFaixasViews,
        diasSemana: listaDiasSemana,
        houveDiscrepancia: diasIndicados.length > 0,
        diasIndicados,
        temDados: temDadosViews,
        observacao: temDadosViews
          ? undefined
          : 'Nenhum post com visualizações registrado para este perfil.'
      }
    });
  } catch (err: any) {
    console.error('[api/perfis/melhores-horarios] Erro:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
