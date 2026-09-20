import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/controle/follow-stats?username=xxx
 * Retorna contabilidade precisa de Follows e Unfollows do dia atual (Horário de Brasília)
 * baseado no histórico de leituras (15 min) da Meta Graph API / Ingestion.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username')?.trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ success: false, error: 'username é obrigatório' }, { status: 400 });
    }

    const db = await getDb();

    // Data de hoje no fuso oficial de Brasília (UTC-3)
    const offsetMs = -3 * 60 * 60 * 1000;
    const dataHojeLocal = new Date(Date.now() + offsetMs);
    const hojeStr = dataHojeLocal.toISOString().substring(0, 10);
    const limiteHoje = `${hojeStr} 00:00:00`;

    // 1. Busca meta diária configurada para o perfil
    const cpRow = await db.get(
      `SELECT meta_follows_dia FROM controle_perfis WHERE LOWER(username) = LOWER(?)`,
      [username]
    ).catch(() => null);
    const metaDia = Number(cpRow?.meta_follows_dia) || 30;

    // 2. Busca histórico de leituras de seguindo válidos de hoje e a última leitura de fechamento anterior
    const rows = await db.all(`
      SELECT data_coleta, seguindo
      FROM perfis_historico
      WHERE LOWER(username) = LOWER(?)
        AND seguindo IS NOT NULL
        AND seguindo > 0
        AND (
          data_coleta >= ?
          OR data_coleta = (
            SELECT MAX(data_coleta)
            FROM perfis_historico
            WHERE LOWER(username) = LOWER(?)
              AND seguindo IS NOT NULL
              AND seguindo > 0
              AND data_coleta < ?
          )
        )
      ORDER BY data_coleta ASC, id ASC
    `, [username, limiteHoje, username, limiteHoje]).catch(() => []);

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        username,
        follows_dia: 0,
        unfollows_dia: 0,
        meta_dia: metaDia,
        seguindo_atual: 0,
        seguindo_baseline: 0,
        total_leituras: 0,
        historico_hoje: []
      });
    }

    // Identifica baseline (fechamento de ontem) e leituras de hoje
    const antes00 = rows.filter((r: any) => r.data_coleta < limiteHoje);
    const deHoje = rows.filter((r: any) => r.data_coleta >= limiteHoje);
    const baseline = antes00.length > 0 ? antes00[antes00.length - 1] : (deHoje.length > 0 ? deHoje[0] : null);

    const seq = baseline ? [baseline, ...deHoje.filter((r: any) => r.data_coleta !== baseline.data_coleta)] : deHoje;

    let followsDia = 0;
    let unfollowsDia = 0;
    const historicoHoje: Array<{
      data: string;
      hora: string;
      seguindo: number;
      delta: number;
      tipo: 'baseline' | 'follow' | 'unfollow' | 'igual';
      marcador_follow?: string;
    }> = [];

    for (let i = 0; i < seq.length; i++) {
      const item = seq[i];
      const horaStr = item.data_coleta.includes(' ')
        ? item.data_coleta.split(' ')[1].substring(0, 5)
        : item.data_coleta;

      if (i === 0) {
        historicoHoje.push({
          data: item.data_coleta,
          hora: horaStr,
          seguindo: Number(item.seguindo) || 0,
          delta: 0,
          tipo: 'baseline'
        });
      } else {
        const segAtual = Number(item.seguindo) || 0;
        const segAnt = Number(seq[i - 1].seguindo) || 0;
        const delta = segAtual - segAnt;

        if (delta > 0) {
          followsDia += delta;
          historicoHoje.push({
            data: item.data_coleta,
            hora: horaStr,
            seguindo: segAtual,
            delta,
            tipo: 'follow',
            marcador_follow: `${followsDia}/${metaDia}`
          });
        } else if (delta < 0) {
          unfollowsDia += Math.abs(delta);
          historicoHoje.push({
            data: item.data_coleta,
            hora: horaStr,
            seguindo: segAtual,
            delta,
            tipo: 'unfollow',
            marcador_follow: `${followsDia}/${metaDia}`
          });
        } else {
          historicoHoje.push({
            data: item.data_coleta,
            hora: horaStr,
            seguindo: segAtual,
            delta: 0,
            tipo: 'igual',
            marcador_follow: `${followsDia}/${metaDia}`
          });
        }
      }
    }

    const ultimoSeguindo = seq.length > 0 ? Number(seq[seq.length - 1].seguindo) || 0 : 0;
    const baselineSeguindo = baseline ? Number(baseline.seguindo) || 0 : ultimoSeguindo;

    return NextResponse.json({
      success: true,
      username,
      follows_dia: followsDia,
      unfollows_dia: unfollowsDia,
      meta_dia: metaDia,
      progresso_pct: Math.min(100, Math.round((followsDia / (metaDia || 1)) * 100)),
      seguindo_atual: ultimoSeguindo,
      seguindo_baseline: baselineSeguindo,
      total_leituras: seq.length,
      historico_hoje: historicoHoje
    });

  } catch (error: any) {
    console.error('Erro GET /api/controle/follow-stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/controle/follow-stats
 * Atualiza a meta diária de follows da modelo (default 30)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const username = body?.username?.trim().toLowerCase();
    const metaDia = Number(body?.meta_dia);

    if (!username) {
      return NextResponse.json({ success: false, error: 'username é obrigatório' }, { status: 400 });
    }
    if (isNaN(metaDia) || metaDia < 1) {
      return NextResponse.json({ success: false, error: 'meta_dia deve ser um número positivo' }, { status: 400 });
    }

    const db = await getDb();
    await db.run(`
      INSERT INTO controle_perfis (username, meta_follows_dia, atualizado_em)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(username) DO UPDATE SET
        meta_follows_dia = excluded.meta_follows_dia,
        atualizado_em = datetime('now')
    `, [username, metaDia]);

    return NextResponse.json({ success: true, username, meta_dia: metaDia });
  } catch (error: any) {
    console.error('Erro PUT /api/controle/follow-stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
