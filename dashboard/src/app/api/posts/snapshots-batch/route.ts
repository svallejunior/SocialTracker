import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Retorna, para uma lista de post_id, o histórico de curtidas/comentários
// (posts_metricas_snapshots) agrupado por post — usado pela sparkline de
// histórico no Feed Geral, evitando N requisições (uma por post) na tabela.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids') || '';
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, snapshots: {} });
    }

    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT post_id, likes, comentarios, data_carga
       FROM posts_metricas_snapshots
       WHERE post_id IN (${placeholders})
       ORDER BY data_carga ASC, id ASC`,
      ids
    );

    const grouped: Record<string, { likes: number; comentarios: number; data_carga: string }[]> = {};
    for (const r of rows) {
      if (!grouped[r.post_id]) grouped[r.post_id] = [];
      grouped[r.post_id].push({
        likes: r.likes || 0,
        comentarios: r.comentarios || 0,
        data_carga: r.data_carga
      });
    }

    return NextResponse.json({ success: true, snapshots: grouped });
  } catch (error: any) {
    console.error('Erro ao buscar snapshots em lote:', error);
    return NextResponse.json({ success: false, error: error.message || 'Erro interno' }, { status: 500 });
  }
}
