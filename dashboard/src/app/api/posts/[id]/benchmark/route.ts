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
        s.post_id,
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
      ORDER BY s.post_id ASC, s.data_carga ASC
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

    const MAX_MINUTES = MAX_DAYS * 24 * 60;

    type Point = { minutes: number; views: number; likes: number; comentarios: number };

    // 1) Reconstrói, por post histórico, sua própria série de pontos reais
    //    (minutos desde a publicação -> métricas), ignorando timestamps inválidos.
    const seriesByPost = new Map<string, Point[]>();
    for (const row of rows) {
      const postMs = new Date(row.data_postagem.replace(' ', 'T')).getTime();
      const snapMs = new Date(row.data_carga.replace(' ', 'T')).getTime();
      if (isNaN(postMs) || isNaN(snapMs)) continue;

      const minutesSince = (snapMs - postMs) / 60000;
      if (minutesSince < 0 || minutesSince > MAX_MINUTES) continue;

      const point: Point = {
        minutes: minutesSince,
        views: Number(row.views) || 0,
        likes: Number(row.likes) || 0,
        comentarios: Number(row.comentarios) || 0,
      };
      const list = seriesByPost.get(row.post_id);
      if (list) list.push(point);
      else seriesByPost.set(row.post_id, [point]);
    }

    // 2) Para cada post, interpola linearmente ENTRE OS PRÓPRIOS PONTOS do post
    //    em cada instante de bucket (múltiplo de BUCKET_MINUTES) coberto pelo seu
    //    intervalo [primeiro snapshot, último snapshot]. Fora desse intervalo o post
    //    não contribui (não extrapola) — é assim que uma coleta esparsa (ex.: só a
    //    cada 24h) acaba sendo "dividida linearmente" entre os buckets do meio.
    const bucketSums: Record<number, { sumViews: number; sumLikes: number; sumComentarios: number; count: number }> = {};

    const addSample = (bucketMinutes: number, views: number, likes: number, comentarios: number) => {
      if (!bucketSums[bucketMinutes]) {
        bucketSums[bucketMinutes] = { sumViews: 0, sumLikes: 0, sumComentarios: 0, count: 0 };
      }
      const b = bucketSums[bucketMinutes];
      b.sumViews += views;
      b.sumLikes += likes;
      b.sumComentarios += comentarios;
      b.count += 1;
    };

    for (const points of seriesByPost.values()) {
      points.sort((a, b) => a.minutes - b.minutes);

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];

        if (!b) {
          // Último ponto conhecido do post: contribui só no próprio bucket dele.
          const bucket = Math.round(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
          addSample(bucket, a.views, a.likes, a.comentarios);
          continue;
        }

        // Todo bucket entre os dois pontos reais 'a' e 'b' recebe o valor
        // interpolado linearmente na proporção do tempo decorrido. O intervalo é
        // meio-aberto [a, b) para que o bucket exatamente em 'b' não seja somado
        // aqui E de novo como firstBucket do próximo par (evitaria contar 2x o
        // mesmo ponto real quando ele cai exatamente numa grade de 15min).
        const firstBucket = Math.ceil(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
        const span = b.minutes - a.minutes;

        if (span <= 0) continue;

        for (let bucket = firstBucket; bucket < b.minutes; bucket += BUCKET_MINUTES) {
          const t = (bucket - a.minutes) / span;
          addSample(
            bucket,
            a.views + (b.views - a.views) * t,
            a.likes + (b.likes - a.likes) * t,
            a.comentarios + (b.comentarios - a.comentarios) * t,
          );
        }
      }
    }

    // 3) Média entre posts em cada bucket — só sobre os posts que efetivamente
    //    cobrem aquele instante. Buckets sem nenhum post são descartados, não
    //    zerados.
    const benchmark = Object.entries(bucketSums)
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
