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

    // Trava de Segurança: Exige pelo menos 1 post histórico na amostra e 2 snapshots no total;
    // caso contrário, a linha não é plotada.
    const totalSnapshotsRow = await db.get(`
      SELECT COUNT(s.id) as total_snaps, COUNT(DISTINCT p.post_id) as total_posts
      FROM posts_metricas_snapshots s
      JOIN posts_historico p ON s.post_id = p.post_id
      WHERE p.username = ?
        AND p.formato = ?
        AND p.post_id != ?
        AND p.data_postagem IS NOT NULL
        AND p.data_postagem != ''
        AND p.data_postagem < ?
    `, [post.username, post.formato, post.post_id, post.data_postagem]);

    const sampleSize = totalSnapshotsRow?.total_posts || 0;
    const totalSnapshots = totalSnapshotsRow?.total_snaps || 0;

    if (sampleSize < 1 || totalSnapshots < 2) {
      return NextResponse.json({ success: true, benchmark: [], sampleSize: 0 });
    }

    const MAX_MINUTES = MAX_DAYS * 24 * 60;

    type Point = { minutes: number; views: number; likes: number; comentarios: number };

    // 1) Reconstrói por post da amostra sua série de pontos reais (minutos desde a publicação)
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

    // Se nenhum post gerou pontos válidos
    if (seriesByPost.size === 0) {
      return NextResponse.json({ success: true, benchmark: [], sampleSize: 0 });
    }

    // 2) Interpolação Linear em passos de 15 min ancorados em T = 0 com 0 engajamento
    // Preenche cada post até o seu último snapshot real
    const rawBucketMapByPost = new Map<string, Map<number, { views: number; likes: number; comentarios: number }>>();
    let globalMaxBucket = 0;

    for (const [postId, rawPoints] of seriesByPost) {
      const points = [...rawPoints].sort((a, b) => a.minutes - b.minutes);
      // Garante ancoragem em T = 0 com 0 engajamento
      if (points[0].minutes > 0) {
        points.unshift({ minutes: 0, views: 0, likes: 0, comentarios: 0 });
      }

      const bMap = new Map<number, { views: number; likes: number; comentarios: number }>();
      bMap.set(0, { views: 0, likes: 0, comentarios: 0 });

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];

        if (!b) {
          const bucket = Math.round(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
          bMap.set(bucket, { views: a.views, likes: a.likes, comentarios: a.comentarios });
          if (bucket > globalMaxBucket) globalMaxBucket = bucket;
          continue;
        }

        const firstBucket = Math.ceil(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
        const span = b.minutes - a.minutes;
        if (span <= 0) continue;

        for (let bucket = firstBucket; bucket < b.minutes; bucket += BUCKET_MINUTES) {
          const t = (bucket - a.minutes) / span;
          bMap.set(bucket, {
            views: a.views + (b.views - a.views) * t,
            likes: a.likes + (b.likes - a.likes) * t,
            comentarios: a.comentarios + (b.comentarios - a.comentarios) * t,
          });
          if (bucket > globalMaxBucket) globalMaxBucket = bucket;
        }
      }

      rawBucketMapByPost.set(postId, bMap);
    }

    // 3) Manutenção de Amostra (Carry-Forward)
    // Quando um post da amostra chega ao seu último snapshot real, seu valor final é repetido
    // para todos os minutos futuros até globalMaxBucket.
    // Isso garante que N seja constante e que esse post contribua com crescimento +0 nos intervalos
    // em que já parou de ser monitorado.
    const fullPerPostBuckets = new Map<string, Map<number, { views: number; likes: number; comentarios: number }>>();

    for (const [postId, bMap] of rawBucketMapByPost) {
      const fullMap = new Map<number, { views: number; likes: number; comentarios: number }>();

      // Acha o maior bucket registrado e o valor correspondente desse post
      let lastKnownBucket = 0;
      let lastKnownValue = { views: 0, likes: 0, comentarios: 0 };
      for (const [b, val] of bMap) {
        if (b > lastKnownBucket) {
          lastKnownBucket = b;
          lastKnownValue = val;
        }
      }

      // Preenche todos os buckets de 0 até globalMaxBucket com o carry-forward garantido
      let runningVal = { views: 0, likes: 0, comentarios: 0 };
      for (let bucket = 0; bucket <= globalMaxBucket; bucket += BUCKET_MINUTES) {
        if (bMap.has(bucket)) {
          runningVal = bMap.get(bucket)!;
        } else if (bucket > lastKnownBucket) {
          runningVal = lastKnownValue; // carry-forward
        }
        fullMap.set(bucket, { ...runningVal });
      }

      fullPerPostBuckets.set(postId, fullMap);
    }

    // 4) Agregação por Incrementos Acumulados
    // Em cada intervalo de 15 min de vida:
    // - Calcula quanto cada post da amostra cresceu naquele intervalo (Δpost).
    // - Tira a média desses crescimentos (Δmédio).
    // - Soma esse ganho médio ao valor acumulado no minuto anterior.
    // Resultado: A linha reflete realisticamente a velocidade média esperada e matematicamente nunca cai.
    const benchmark: Array<{
      minutesBucket: number;
      avgViews: number;
      avgLikes: number;
      avgComentarios: number;
      sampleCount: number;
    }> = [];

    const totalPostsInSample = fullPerPostBuckets.size;
    let accViews = 0;
    let accLikes = 0;
    let accComentarios = 0;

    // Bucket 0 (T = 0) é ancorado em 0
    benchmark.push({
      minutesBucket: 0,
      avgViews: 0,
      avgLikes: 0,
      avgComentarios: 0,
      sampleCount: totalPostsInSample,
    });

    for (let bucket = BUCKET_MINUTES; bucket <= globalMaxBucket; bucket += BUCKET_MINUTES) {
      const prevBucket = bucket - BUCKET_MINUTES;
      let sumDeltaViews = 0;
      let sumDeltaLikes = 0;
      let sumDeltaComentarios = 0;

      for (const fullMap of fullPerPostBuckets.values()) {
        const curr = fullMap.get(bucket) || { views: 0, likes: 0, comentarios: 0 };
        const prev = fullMap.get(prevBucket) || { views: 0, likes: 0, comentarios: 0 };

        // Crescimento naquele intervalo de 15 min (garantido >= 0)
        sumDeltaViews += Math.max(0, curr.views - prev.views);
        sumDeltaLikes += Math.max(0, curr.likes - prev.likes);
        sumDeltaComentarios += Math.max(0, curr.comentarios - prev.comentarios);
      }

      // Ganho médio da amostra no intervalo
      const avgDeltaViews = sumDeltaViews / totalPostsInSample;
      const avgDeltaLikes = sumDeltaLikes / totalPostsInSample;
      const avgDeltaComentarios = sumDeltaComentarios / totalPostsInSample;

      // Soma ao valor acumulado
      accViews += avgDeltaViews;
      accLikes += avgDeltaLikes;
      accComentarios += avgDeltaComentarios;

      benchmark.push({
        minutesBucket: bucket,
        avgViews: Math.round(accViews),
        avgLikes: Math.round(accLikes),
        avgComentarios: Math.round(accComentarios),
        sampleCount: totalPostsInSample,
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
