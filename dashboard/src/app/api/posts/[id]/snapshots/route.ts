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

    // Busca detalhes do post
    const post = await db.get(
      'SELECT * FROM posts_historico WHERE post_id = ? OR shortcode = ?',
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
      post: post || null,
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
