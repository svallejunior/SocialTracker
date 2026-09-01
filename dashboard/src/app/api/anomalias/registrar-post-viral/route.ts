import { NextRequest, NextResponse } from 'next/server';
import { formatToBrazilDateTime } from '@/lib/timezone';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Extrai o shortcode de uma URL do Instagram. */
function extractShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Converte shortcode base64url → ID numérico. */
function shortcodeToId(shortcode: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = BigInt(0);
  for (const char of shortcode) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    id = id * BigInt(64) + BigInt(idx);
  }
  return id.toString();
}

/** Detecta formato pela URL */
function detectFormat(url: string): string {
  if (url.includes('/reel/') || url.includes('/tv/')) return 'Reels';
  return 'Imagem';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, post_url, data_coleta } = body;

    if (!username || !post_url) {
      return NextResponse.json(
        { success: false, error: 'username e post_url são obrigatórios' },
        { status: 400 }
      );
    }

    const shortcode = extractShortcode(post_url.trim());
    if (!shortcode) {
      return NextResponse.json(
        { success: false, error: 'URL inválida. Use o link completo do post (ex: https://www.instagram.com/p/ABC123/ ou /reel/ABC123/)' },
        { status: 400 }
      );
    }

    const postId = shortcodeToId(shortcode);
    const formato = detectFormat(post_url);

    // Data estimada: data_coleta - 24h como melhor estimativa
    let dataPostagem: string;
    if (data_coleta) {
      const dt = new Date(data_coleta.replace(' ', 'T'));
      if (!isNaN(dt.getTime())) {
        dt.setHours(dt.getHours() - 24);
        dataPostagem = formatToBrazilDateTime(dt);
      } else {
        dataPostagem = formatToBrazilDateTime(new Date(Date.now() - 24 * 3600 * 1000));
      }
    } else {
      dataPostagem = formatToBrazilDateTime(new Date(Date.now() - 24 * 3600 * 1000));
    }

    const agora = formatToBrazilDateTime(new Date());
    const url = `https://www.instagram.com/p/${shortcode}/`;
    const usernameClean = username.trim().replace(/^@/, '').toLowerCase();

    const db = await getDb();

    // Garante que a tabela existe
    await db.run(`
      CREATE TABLE IF NOT EXISTS posts_historico (
        post_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        data_postagem DATETIME NOT NULL,
        formato TEXT NOT NULL,
        legenda TEXT,
        likes INTEGER DEFAULT 0,
        comentarios INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        taxa_engajamento REAL,
        data_atualizacao DATETIME NOT NULL,
        shortcode TEXT
      )
    `);

    // Verifica se já existe pelo shortcode ou post_id
    const existing = await db.get(
      'SELECT post_id, data_postagem, formato, shortcode FROM posts_historico WHERE post_id = ? OR shortcode = ?',
      [postId, shortcode]
    );

    if (existing) {
      const horasAntesColeta = (() => {
        if (!data_coleta) return null;
        const dtColeta = new Date(data_coleta.replace(' ', 'T'));
        const dtPost = new Date((existing.data_postagem || dataPostagem).replace(' ', 'T'));
        if (isNaN(dtColeta.getTime()) || isNaN(dtPost.getTime())) return null;
        return Math.round((dtColeta.getTime() - dtPost.getTime()) / 3600000 * 10) / 10;
      })();

      const post = {
        post_id: existing.post_id,
        shortcode,
        url,
        data_postagem: existing.data_postagem,
        formato: existing.formato || formato,
        legenda: '',
        likes: 0,
        comentarios: 0,
        views: 0,
        score_tracao: 0,
        horas_antes_coleta: horasAntesColeta,
        ja_existia: true,
        data_estimada: false
      };
      return NextResponse.json({ success: true, post, shortcode, ja_existia: true });
    }

    // Insere o post
    await db.run(
      `INSERT INTO posts_historico
        (post_id, username, data_postagem, formato, legenda, likes, comentarios, views, taxa_engajamento, data_atualizacao, shortcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, usernameClean, dataPostagem, formato, '', 0, 0, 0, 0.0, agora, shortcode]
    );

    const horasAntesColeta = (() => {
      if (!data_coleta) return null;
      const dtColeta = new Date(data_coleta.replace(' ', 'T'));
      const dtPost = new Date(dataPostagem.replace(' ', 'T'));
      if (isNaN(dtColeta.getTime()) || isNaN(dtPost.getTime())) return null;
      return Math.round((dtColeta.getTime() - dtPost.getTime()) / 3600000 * 10) / 10;
    })();

    const post = {
      post_id: postId,
      shortcode,
      url,
      data_postagem: dataPostagem,
      formato,
      legenda: '',
      likes: 0,
      comentarios: 0,
      views: 0,
      score_tracao: 0,
      horas_antes_coleta: horasAntesColeta,
      ja_existia: false,
      data_estimada: true // sinaliza que a data é estimada (data_coleta - 24h)
    };

    return NextResponse.json({ success: true, post, shortcode, ja_existia: false });
  } catch (error: any) {
    console.error('[API registrar-post-viral] Erro:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
