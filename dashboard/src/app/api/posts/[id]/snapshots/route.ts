import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID do post não fornecido' }, { status: 400 });
    }

    const db = await getDb();

    // Só o post_id é usado (para resolver `id` quando um shortcode é passado);
    // o único consumidor desta rota (ModalEvolucaoPost) usa apenas `snapshots`.
    const post = await db.get(
      'SELECT post_id FROM posts_historico WHERE post_id = ? OR shortcode = ?',
      [id, id]
    );

    const actualPostId = post ? post.post_id : id;

    // Busca snapshots ordenados cronologicamente
    const snapshots = await db.all(
      `SELECT 
        id,
        post_id,
        username,
        likes,
        comentarios,
        views,
        reach,
        saved,
        shares,
        total_interactions,
        data_carga
      FROM posts_metricas_snapshots
      WHERE post_id = ?
      ORDER BY data_carga ASC, id ASC`,
      [actualPostId]
    );

    return NextResponse.json({
      success: true,
      postId: actualPostId,
      snapshots: snapshots || []
    });
  } catch (error: any) {
    console.error('Erro ao buscar snapshots do post:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
}
