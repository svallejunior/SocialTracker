import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const BUCKET_MINUTES = 15;
// Trava de sanidade contra timestamp corrompido — não é filtro de negócio.
const MAX_DAYS = 730;

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

    // Busca snapshots de posts ANTERIORES do mesmo username + formato. "Esperado"
    // é o que já se sabia sobre a conta até aquele momento — o 1º Reels da conta
    // não tem nenhuma amostra, o 2º tem 1 (só o 1º), o 3º tem 2, e assim por
    // diante. Nunca usa dado de post publicado DEPOIS do post analisado.
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
        AND p.data_postagem < ?
      ORDER BY s.post_id ASC, s.data_carga ASC
    `, [post.username, post.formato, post.post_id, post.data_postagem]);

    // Conta posts anteriores únicos com pelo menos 1 snapshot
    const uniqueRow = await db.get(`
      SELECT COUNT(DISTINCT p.post_id) as cnt
      FROM posts_historico p
      WHERE p.username = ?
        AND p.formato = ?
        AND p.post_id != ?
        AND p.data_postagem < ?
        AND EXISTS (SELECT 1 FROM posts_metricas_snapshots s WHERE s.post_id = p.post_id)
    `, [post.username, post.formato, post.post_id, post.data_postagem]);

    const sampleSize = uniqueRow?.cnt || 0;

    if (sampleSize < 1) {
      return NextResponse.json({ success: true, benchmark: [], sampleSize });
    }

    const MAX_MINUTES = MAX_DAYS * 24 * 60;

    type Point = { minutes: number; views: number; likes: number; comentarios: number };

    // 1) Reconstrói, por post anterior, sua própria série de pontos reais
    //    (minutos desde a publicação -> métricas), ignorando timestamps inválidos.
    const seriesByPost = new Map<string, Point[]>();
    const postPublishMs = new Map<string, number>();
    for (const row of rows) {
      const postMs = new Date(row.data_postagem.replace(' ', 'T')).getTime();
      const snapMs = new Date(row.data_carga.replace(' ', 'T')).getTime();
      if (isNaN(postMs) || isNaN(snapMs)) continue;

      if (!postPublishMs.has(row.post_id)) postPublishMs.set(row.post_id, postMs);

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

    // 2) Para cada post anterior, o valor DELE em cada bucket de 15min: interpola
    //    linearmente entre os próprios pontos reais (ancorado em minutes=0 → 0,
    //    fato garantido, ninguém viu o post antes dele existir), e — passado o
    //    último ponto real — repete esse valor (carry-forward) só até onde esse
    //    post JÁ VIVEU de verdade (agora − a publicação dele). Um post não
    //    "inventa" dado além do que já teve tempo de ter.
    const nowMs = Date.now();
    const perPostBuckets = new Map<string, Map<number, { views: number; likes: number; comentarios: number }>>();

    for (const [postId, rawPoints] of seriesByPost) {
      const points = [...rawPoints].sort((a, b) => a.minutes - b.minutes);
      if (points[0].minutes > 0) {
        points.unshift({ minutes: 0, views: 0, likes: 0, comentarios: 0 });
      }

      const bucketMap = new Map<number, { views: number; likes: number; comentarios: number }>();
      bucketMap.set(0, { views: 0, likes: 0, comentarios: 0 });

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];

        if (!b) {
          const bucket = Math.round(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
          bucketMap.set(bucket, { views: a.views, likes: a.likes, comentarios: a.comentarios });
          continue;
        }

        // Intervalo meio-aberto [a, b) para não contar o bucket em 'b' duas vezes
        // (aqui e como firstBucket do próximo par) quando cai exatamente na grade.
        const firstBucket = Math.ceil(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
        const span = b.minutes - a.minutes;
        if (span <= 0) continue;

        for (let bucket = firstBucket; bucket < b.minutes; bucket += BUCKET_MINUTES) {
          const t = (bucket - a.minutes) / span;
          bucketMap.set(bucket, {
            views: a.views + (b.views - a.views) * t,
            likes: a.likes + (b.likes - a.likes) * t,
            comentarios: a.comentarios + (b.comentarios - a.comentarios) * t,
          });
        }
      }

      const publishMs = postPublishMs.get(postId)!;
      const realLifeBucket = Math.floor((nowMs - publishMs) / 60000 / BUCKET_MINUTES) * BUCKET_MINUTES;

      let lastBucket = 0;
      let lastValue = bucketMap.get(0)!;
      for (const [bucket, value] of bucketMap) {
        if (bucket > lastBucket) {
          lastBucket = bucket;
          lastValue = value;
        }
      }
      for (let bucket = lastBucket + BUCKET_MINUTES; bucket <= realLifeBucket; bucket += BUCKET_MINUTES) {
        bucketMap.set(bucket, lastValue);
      }

      perPostBuckets.set(postId, bucketMap);
    }

    let maxBucket = 0;
    for (const bucketMap of perPostBuckets.values()) {
      for (const bucket of bucketMap.keys()) {
        if (bucket > maxBucket) maxBucket = bucket;
      }
    }

    // 3) Esperado = MÉDIA SIMPLES dos posts anteriores em cada bucket. No post 2,
    //    é a média de 1 amostra (só o post 1); no post 3, a média de 2 (post 1 e
    //    2); no post N, a média das N-1 anteriores — cada uma no valor que ela
    //    tinha naquele mesmo instante relativo (minutos desde a publicação dela).
    //    Um post só entra na média de um bucket se tiver valor ali; não força
    //    zero nem inventa dado.
    const benchmark: Array<{ minutesBucket: number; avgViews: number; avgLikes: number; avgComentarios: number; sampleCount: number }> = [];

    for (let bucket = 0; bucket <= maxBucket; bucket += BUCKET_MINUTES) {
      let sumViews = 0;
      let sumLikes = 0;
      let sumComentarios = 0;
      let n = 0;

      for (const bucketMap of perPostBuckets.values()) {
        const v = bucketMap.get(bucket);
        if (!v) continue;
        sumViews += v.views;
        sumLikes += v.likes;
        sumComentarios += v.comentarios;
        n += 1;
      }

      if (n === 0) continue;

      benchmark.push({
        minutesBucket: bucket,
        avgViews: Math.floor(sumViews / n),
        avgLikes: Math.floor(sumLikes / n),
        avgComentarios: Math.floor(sumComentarios / n),
        sampleCount: n,
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
