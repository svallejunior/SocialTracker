import type { Database } from 'sqlite';

export interface ContagemConteudo {
  reels: number;
  posts: number;
  stories: number;
}

// Conta Reels, Posts (Imagem/Carrossel) e Stories publicados por uma conta num período (datas inclusivas, YYYY-MM-DD).
// Une posts_historico (ingestão Meta) com automacao_publicacoes (publicações do agendador/manuais),
// deduplicando pelo ID da mídia. Stories anteriores a 21/09/2026 só existem em automacao_publicacoes —
// lá os que expiraram ficaram com status DELETADO, mas foram publicados (têm meta_media_id), então contam.
export async function contarConteudoPeriodo(
  db: Database,
  username: string,
  dataInicio: string,
  dataFim: string
): Promise<ContagemConteudo> {
  const rows = await db.all<{ tipo: string; qtd: number }[]>(`
    WITH midias AS (
      SELECT post_id AS media_id,
        CASE
          WHEN formato = 'Stories' OR media_product_type = 'STORY' THEN 'stories'
          WHEN formato = 'Reels' OR media_product_type = 'REELS' THEN 'reels'
          ELSE 'posts'
        END AS tipo
      FROM posts_historico
      WHERE LOWER(username) = ?
        AND date(data_postagem) BETWEEN ? AND ?
        AND COALESCE(is_deleted, 0) = 0
        AND formato IN ('Imagem', 'Carrossel', 'Reels', 'Stories')
      UNION
      SELECT meta_media_id AS media_id,
        CASE tipo_postagem WHEN 'STORIES' THEN 'stories' WHEN 'REELS' THEN 'reels' ELSE 'posts' END AS tipo
      FROM automacao_publicacoes
      WHERE LOWER(username) = ?
        AND data_local BETWEEN ? AND ?
        AND COALESCE(meta_media_id, '') <> ''
        AND (status = 'PUBLICADO' OR (tipo_postagem = 'STORIES' AND status = 'DELETADO'))
    )
    SELECT tipo, COUNT(DISTINCT media_id) AS qtd FROM midias GROUP BY tipo
  `, [username, dataInicio, dataFim, username, dataInicio, dataFim]);

  const res: ContagemConteudo = { reels: 0, posts: 0, stories: 0 };
  for (const r of rows) {
    if (r.tipo === 'reels' || r.tipo === 'posts' || r.tipo === 'stories') res[r.tipo] = Number(r.qtd) || 0;
  }
  return res;
}
