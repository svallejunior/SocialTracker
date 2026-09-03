import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const BUCKET_MINUTES = 15;
const MAX_DAYS = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID não fornecido' }, { status: 400 });
    }

    const db = await getDb();

    // Busca o post alvo
    const post = await db.get(
      'SELECT post_id, username, formato, data_postagem FROM posts_historico WHERE post_id = ? OR shortcode = ?',
      [id, id]
    );

    if (!post || !post.data_postagem) {
      return NextResponse.json({ success: true, benchmark: [], sampleSize: 0 });
    }

    // Busca snapshots de OUTROS posts do mesmo username + formato
    const rows = await db.all(`
      SELECT
        s.likes,
        s.comentarios,
        s.views,
        s.data_carga,
        p.data_postagem
      FROM posts_metricas_snapshots s
      JOIN posts_historico p ON s.post_id = p.post_id
      WHERE p.username = ?
        AND p.formato = ?
        AND s.post_id != ?
        AND p.data_postagem IS NOT NULL
        AND p.data_postagem != ''
      ORDER BY s.data_carga ASC
    `, [post.username, post.formato, post.post_id]);

    // Conta posts únicos na amostra (que têm pelo menos 1 snapshot)
    const uniqueRow = await db.get(`
      SELECT COUNT(DISTINCT p.post_id) as cnt
      FROM posts_historico p
      WHERE p.username = ?
        AND p.formato = ?
        AND p.post_id != ?
        AND EXISTS (SELECT 1 FROM posts_metricas_snapshots s WHERE s.post_id = p.post_id)
    `, [post.username, post.formato, post.post_id]);

    const sampleSize = uniqueRow?.cnt || 0;

    if (rows.length < 2 || sampleSize < 1) {
      return NextResponse.json({ success: true, benchmark: [], sampleSize });
    }

    // Agrupa snapshots em buckets de BUCKET_MINUTES minutos desde a publicação
    const buckets: Record<number, {
      sumViews: number;
      sumLikes: number;
      sumComentarios: number;
      count: number;
    }> = {};

    for (const row of rows) {
      const postMs = new Date(row.data_postagem.replace(' ', 'T')).getTime();
      const snapMs = new Date(row.data_carga.replace(' ', 'T')).getTime();
      if (isNaN(postMs) || isNaN(snapMs)) continue;

      const minutesSince = (snapMs - postMs) / 60000;

      // Ignora snapshots negativos (dados inconsistentes) ou muito antigos
      if (minutesSince < 0 || minutesSince > MAX_DAYS * 24 * 60) continue;

      const bucket = Math.floor(minutesSince / BUCKET_MINUTES) * BUCKET_MINUTES;

      if (!buckets[bucket]) {
        buckets[bucket] = { sumViews: 0, sumLikes: 0, sumComentarios: 0, count: 0 };
      }
      buckets[bucket].sumViews += Number(row.views) || 0;
      buckets[bucket].sumLikes += Number(row.likes) || 0;
      buckets[bucket].sumComentarios += Number(row.comentarios) || 0;
      buckets[bucket].count += 1;
    }

    // Monta curva ordenada por bucket
    const benchmark = Object.entries(buckets)
      .map(([bucket, d]) => ({
        minutesBucket: Number(bucket),
        avgViews: Math.round(d.sumViews / d.count),
        avgLikes: Math.round(d.sumLikes / d.count),
        avgComentarios: Math.round(d.sumComentarios / d.count),
        sampleCount: d.count,
      }))
      .sort((a, b) => a.minutesBucket - b.minutesBucket);

    // Garante ponto zero no início
    if (benchmark.length > 0 && benchmark[0].minutesBucket > 0) {
      benchmark.unshift({
        minutesBucket: 0,
        avgViews: 0,
        avgLikes: 0,
        avgComentarios: 0,
        sampleCount: 0,
      });
    }

    return NextResponse.json({
      success: true,
      benchmark,
      sampleSize,
      username: post.username,
      formato: post.formato,
    });
  } catch (error: any) {
    console.error('[benchmark route]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
