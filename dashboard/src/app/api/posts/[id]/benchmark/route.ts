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
    //    (a partir de uma âncora em minutes=0, sempre 0 — fato garantido, ninguém
    //    viu o post antes dele existir, não é dado inventado) para preencher um
    //    valor em todo bucket de BUCKET_MINUTES coberto pelo intervalo [0, último
    //    snapshot]. Fora desse intervalo o post não contribui (não extrapola) —
    //    é assim que uma coleta esparsa (ex.: só a cada 24h) acaba "dividida
    //    linearmente" entre os buckets do meio.
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
          // Último ponto conhecido do post: fixa só o próprio bucket dele.
          const bucket = Math.round(a.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;
          bucketMap.set(bucket, { views: a.views, likes: a.likes, comentarios: a.comentarios });
          continue;
        }

        // Todo bucket entre os dois pontos reais 'a' e 'b' recebe o valor
        // interpolado linearmente na proporção do tempo decorrido. Intervalo
        // meio-aberto [a, b) para não contar o bucket em 'b' duas vezes (aqui e
        // como firstBucket do próximo par) quando ele cai exatamente na grade.
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

      perPostBuckets.set(postId, bucketMap);
    }

    let maxBucket = 0;
    for (const bucketMap of perPostBuckets.values()) {
      for (const bucket of bucketMap.keys()) {
        if (bucket > maxBucket) maxBucket = bucket;
      }
    }

    // 2b) Preenche cada post até maxBucket repetindo o último valor conhecido
    //     dele (carry-forward), em vez de deixá-lo "sair" da amostra depois do
    //     último snapshot. Sem isso, o divisor da média muda de bucket pra bucket
    //     conforme cada post entra/sai de cobertura, e isso sozinho já é o
    //     suficiente pra média cair mesmo sem nenhum view "sumir" de verdade. Com
    //     carry-forward, todo post contribui em todo bucket (crescimento zero no
    //     trecho sem coleta nova, nunca negativo), a amostra fica do mesmo tamanho
    //     do começo ao fim, e a linha esperada vai até onde o post mais coletado
    //     chegou — em vez de parar quando o primeiro post da amostra esgota dados.
    for (const bucketMap of perPostBuckets.values()) {
      let lastBucket = 0;
      let lastValue = bucketMap.get(0)!;
      for (const [bucket, value] of bucketMap) {
        if (bucket > lastBucket) {
          lastBucket = bucket;
          lastValue = value;
        }
      }
      for (let bucket = lastBucket + BUCKET_MINUTES; bucket <= maxBucket; bucket += BUCKET_MINUTES) {
        bucketMap.set(bucket, lastValue);
      }
    }

    // 3) Constrói a curva como soma cumulativa do CRESCIMENTO médio entre buckets
    //    consecutivos — não da média dos níveis absolutos direto (o que, mesmo com
    //    amostra fixa, dá o mesmo resultado, mas evita reprocessar todo o histórico
    //    de cada post a cada coluna). Em cada passo de BUCKET_MINUTES, calcula o
    //    delta de cada post (nunca negativo — visualização não some) e tira a média
    //    entre os N posts da amostra, que agora é constante em todo bucket graças
    //    ao carry-forward acima.
    const benchmark: Array<{ minutesBucket: number; avgViews: number; avgLikes: number; avgComentarios: number; sampleCount: number }> = [
      { minutesBucket: 0, avgViews: 0, avgLikes: 0, avgComentarios: 0, sampleCount: perPostBuckets.size },
    ];

    let cumViews = 0;
    let cumLikes = 0;
    let cumComentarios = 0;

    for (let bucket = BUCKET_MINUTES; bucket <= maxBucket; bucket += BUCKET_MINUTES) {
      const prevBucket = bucket - BUCKET_MINUTES;
      let sumDeltaViews = 0;
      let sumDeltaLikes = 0;
      let sumDeltaComentarios = 0;
      let n = 0;

      for (const bucketMap of perPostBuckets.values()) {
        const curr = bucketMap.get(bucket);
        const prev = bucketMap.get(prevBucket);
        if (!curr || !prev) continue;

        sumDeltaViews += Math.max(0, curr.views - prev.views);
        sumDeltaLikes += Math.max(0, curr.likes - prev.likes);
        sumDeltaComentarios += Math.max(0, curr.comentarios - prev.comentarios);
        n += 1;
      }

      if (n === 0) continue;

      cumViews += sumDeltaViews / n;
      cumLikes += sumDeltaLikes / n;
      cumComentarios += sumDeltaComentarios / n;

      benchmark.push({
        minutesBucket: bucket,
        avgViews: Math.floor(cumViews),
        avgLikes: Math.floor(cumLikes),
        avgComentarios: Math.floor(cumComentarios),
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
