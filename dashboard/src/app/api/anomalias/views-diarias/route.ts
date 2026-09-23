import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: visualizações ganhas por dia de um perfil, do primeiro snapshot até hoje.
// Mesmo cálculo da coluna "Views" da tabela do Histórico da Conta (/api/anomalias):
// por post, maior views do dia menos a do dia anterior coletado; post publicado
// no próprio dia conta inteiro.
export async function GET(request: NextRequest) {
  try {
    const username = request.nextUrl.searchParams.get('username');
    if (!username) {
      return NextResponse.json({ success: false, error: 'username é obrigatório' }, { status: 400 });
    }

    const db = await getDb();
    const rows = await db.all(`
      WITH daily_post_views AS (
        SELECT
          SUBSTR(s.data_carga, 1, 10) as dia,
          s.post_id,
          MAX(s.views) as max_views,
          SUBSTR(p.data_postagem, 1, 10) as dia_postagem
        FROM posts_metricas_snapshots s
        LEFT JOIN posts_historico p ON p.post_id = s.post_id
        WHERE LOWER(s.username) = LOWER(?)
        GROUP BY SUBSTR(s.data_carga, 1, 10), s.post_id
      ),
      with_prev_views AS (
        SELECT
          dia,
          max_views,
          dia_postagem,
          LAG(max_views) OVER (PARTITION BY post_id ORDER BY dia) as prev_views
        FROM daily_post_views
      )
      SELECT
        dia,
        SUM(
          CASE
            WHEN prev_views IS NOT NULL THEN MAX(0, max_views - prev_views)
            WHEN dia_postagem = dia THEN max_views
            ELSE 0
          END
        ) as views
      FROM with_prev_views
      GROUP BY dia
      ORDER BY dia ASC
    `, [username]);

    if (rows.length === 0) {
      return NextResponse.json({ success: true, serie: [] });
    }

    // Preenche todos os dias do primeiro snapshot até hoje (Brasília); dia sem
    // coleta fica null (sem barra) em vez de um zero enganoso.
    const porDia = new Map<string, number>(rows.map((r: any) => [r.dia, Number(r.views) || 0]));
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const serie: { dia: string; views: number | null }[] = [];
    const cursor = new Date(`${rows[0].dia}T12:00:00Z`);
    const fim = new Date(`${hoje > rows[rows.length - 1].dia ? hoje : rows[rows.length - 1].dia}T12:00:00Z`);
    while (cursor <= fim) {
      const dia = cursor.toISOString().substring(0, 10);
      serie.push({ dia, views: porDia.has(dia) ? porDia.get(dia)! : null });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return NextResponse.json({ success: true, serie });
  } catch (error: any) {
    console.error('Erro ao buscar views diárias:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
