import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function resolveDbPath() {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) return process.env.DB_PATH;
  const parentDb = path.resolve(process.cwd(), '..', 'instagram_tracker.db');
  if (fs.existsSync(parentDb)) return parentDb;
  const cwdDb = path.resolve(process.cwd(), 'instagram_tracker.db');
  if (fs.existsSync(cwdDb)) return cwdDb;
  return parentDb;
}

async function getDb() {
  const db = await open({
    filename: resolveDbPath(),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS instagram_comentarios (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      modelo_username TEXT NOT NULL,
      autor_username TEXT,
      autor_id TEXT,
      texto TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      like_count INTEGER DEFAULT 0,
      curtido INTEGER DEFAULT 0,
      respondido INTEGER DEFAULT 0,
      resposta_texto TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    const cols = await db.all("PRAGMA table_info(instagram_comentarios)");
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has("like_count")) {
      await db.exec(`ALTER TABLE instagram_comentarios ADD COLUMN like_count INTEGER DEFAULT 0`);
    }
    if (!colNames.has("resposta_texto")) {
      await db.exec(`ALTER TABLE instagram_comentarios ADD COLUMN resposta_texto TEXT`);
    }
    if (!colNames.has("autor_id")) {
      await db.exec(`ALTER TABLE instagram_comentarios ADD COLUMN autor_id TEXT`);
    }
  } catch (err) {
    console.error("Migration error in instagram_comentarios:", err);
  }

  return db;
}

async function getMetaCredentials(db: any, username: string) {
  const cleanU = username.trim().toLowerCase().replace('@', '');

  const row = await db.get(
    `SELECT * FROM automacao_config WHERE LOWER(username) = LOWER(?) AND id != 'default_config' LIMIT 1`,
    [cleanU]
  );

  const defaultRow = await db.get(
    `SELECT * FROM automacao_config WHERE id = 'default_config' LIMIT 1`
  );

  const envKey = `META_TOKEN_${cleanU.toUpperCase().replace(/\./g, '_')}`;
  const envToken = process.env[envKey] || process.env.META_ACCESS_TOKEN || '';

  const meta_account_id = row?.meta_account_id || row?.id || '';
  const access_token = row?.access_token || envToken || defaultRow?.access_token || '';

  return {
    meta_account_id: (meta_account_id || '').trim(),
    access_token: (access_token || '').trim(),
    username: cleanU
  };
}

// ─────────────────────────────────────────────
// GET: Busca publicações e comentários de uma modelo
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = (searchParams.get('username') || '').trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ success: false, error: 'Username é obrigatório' }, { status: 400 });
    }

    const db = await getDb();
    const creds = await getMetaCredentials(db, username);

    if (!creds.meta_account_id || !creds.access_token) {
      await db.close();
      return NextResponse.json({
        success: false,
        error: `Conta @${username} não possui META ID ou Access Token configurado.`
      }, { status: 400 });
    }

    // Consulta a Meta Graph API para buscar as postagens e comentários recentes
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,comments{id,text,from,timestamp,like_count,user_likes,replies{id,text,from,timestamp}}';
    const url = `${GRAPH_API_BASE}/${creds.meta_account_id}/media?fields=${fields}&limit=12&access_token=${creds.access_token}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      await db.close();
      return NextResponse.json({
        success: false,
        error: `Erro Meta API (${data.error?.code || res.status}): ${data.error?.message || 'Falha ao buscar mídias'}`
      }, { status: 500 });
    }

    const posts = data.data || [];
    let comentariosSalvos = 0;

    // Processa os posts e comentários, salvando no SQLite
    const postsTratados = [];

    // Busca status prévios do SQLite para não sobrescrever comentários marcados como dispensados/respondidos manualmente
    const dbComments = await db.all(
      `SELECT id, curtido, respondido, resposta_texto FROM instagram_comentarios WHERE LOWER(modelo_username) = ?`,
      [creds.username]
    ).catch(() => []);
    const dbMap = new Map(dbComments.map((c: any) => [c.id, c]));

    for (const p of posts) {
      const mediaId = p.id;
      const commentsData = p.comments?.data || [];
      const commentsTratados = [];

      for (const com of commentsData) {
        if (!com.id) continue;

        const autorUsername = com.from?.username || 'usuario_instagram';
        const autorId = com.from?.id || '';
        const texto = com.text || '';
        const timestamp = com.timestamp || new Date().toISOString();
        const likeCount = com.like_count || 0;
        const curtidoPorMim = com.user_likes ? 1 : 0;
        const replies = com.replies?.data || [];
        const temRespostaMinha = replies.some((r: any) => r.from?.id === creds.meta_account_id || r.from?.username?.toLowerCase() === creds.username);
        const respostaTexto = temRespostaMinha ? replies[0]?.text : null;

        const prevDbRecord = dbMap.get(com.id);
        const isRespondidoEfetivo = prevDbRecord ? Boolean(prevDbRecord.respondido) : temRespostaMinha;
        const respostaTextoEfetivo = prevDbRecord?.resposta_texto || respostaTexto;
        const isCurtidoEfetivo = prevDbRecord ? Boolean(prevDbRecord.curtido) : Boolean(curtidoPorMim);

        // Salva/atualiza no SQLite
        await db.run(`
          INSERT INTO instagram_comentarios (
            id, media_id, modelo_username, autor_username, autor_id, texto, timestamp, like_count, curtido, respondido, resposta_texto
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            like_count = excluded.like_count,
            curtido = CASE WHEN instagram_comentarios.curtido = 1 THEN 1 ELSE excluded.curtido END,
            respondido = CASE WHEN instagram_comentarios.respondido = 1 THEN 1 ELSE excluded.respondido END,
            resposta_texto = COALESCE(instagram_comentarios.resposta_texto, excluded.resposta_texto)
        `, [
          com.id,
          mediaId,
          creds.username,
          autorUsername,
          autorId,
          texto,
          timestamp,
          likeCount,
          isCurtidoEfetivo ? 1 : 0,
          isRespondidoEfetivo ? 1 : 0,
          respostaTextoEfetivo
        ]);

        comentariosSalvos++;

        commentsTratados.push({
          id: com.id,
          media_id: mediaId,
          autor_username: autorUsername,
          autor_id: autorId,
          texto: texto,
          timestamp: timestamp,
          like_count: likeCount,
          curtido: isCurtidoEfetivo ? 1 : 0,
          respondido: isRespondidoEfetivo ? 1 : 0,
          resposta_texto: respostaTextoEfetivo,
          replies: replies
        });
      }

      postsTratados.push({
        id: p.id,
        caption: p.caption || '',
        media_type: p.media_type,
        media_url: p.media_url || null,
        thumbnail_url: p.thumbnail_url || p.media_url || null,
        permalink: p.permalink || `https://instagram.com/p/${p.id}`,
        timestamp: p.timestamp,
        like_count: p.like_count || 0,
        comments_count: p.comments_count || commentsTratados.length,
        comments: commentsTratados
      });
    }

    await db.close();

    return NextResponse.json({
      success: true,
      posts: postsTratados,
      total_posts: postsTratados.length,
      comentarios_sincronizados: comentariosSalvos
    });
  } catch (error: any) {
    console.error("Erro no GET /api/comentarios:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST: Curtir, Descurtir ou Responder Comentário
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, comment_id, modelo_username, message, media_id } = body;

    if (!comment_id || !modelo_username || !action) {
      return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
    }

    const cleanModelo = modelo_username.trim().toLowerCase().replace('@', '');
    const db = await getDb();
    const creds = await getMetaCredentials(db, cleanModelo);

    if (!creds.access_token) {
      await db.close();
      return NextResponse.json({ success: false, error: `Nenhum token encontrado para @${cleanModelo}` }, { status: 400 });
    }

    // ─── 1. CURTIR COMENTÁRIO (STATUS OPERACIONAL NO BANCO LOCAL) ───
    if (action === 'like') {
      await db.run(
        `UPDATE instagram_comentarios SET curtido = 1, like_count = like_count + 1 WHERE id = ?`,
        [comment_id]
      );

      await db.close();
      return NextResponse.json({ success: true, message: 'Comentário marcado como curtido!', curtido: true });
    }

    // ─── 2. DESCURTIR COMENTÁRIO ───
    if (action === 'unlike') {
      await db.run(
        `UPDATE instagram_comentarios SET curtido = 0, like_count = MAX(0, like_count - 1) WHERE id = ?`,
        [comment_id]
      );

      await db.close();
      return NextResponse.json({ success: true, message: 'Marcação de curtida removida!', curtido: false });
    }

    // ─── 3. RESPONDER COMENTÁRIO ───
    if (action === 'reply') {
      if (!message || String(message).trim().length === 0) {
        await db.close();
        return NextResponse.json({ success: false, error: 'O texto da resposta é obrigatório' }, { status: 400 });
      }

      const cleanMessage = String(message).trim();
      const urlReply = `${GRAPH_API_BASE}/${comment_id}/replies`;

      const resMeta = await fetch(urlReply, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanMessage,
          access_token: creds.access_token
        })
      });
      const dataMeta = await resMeta.json();

      if (!resMeta.ok || dataMeta.error) {
        await db.close();
        return NextResponse.json({
          success: false,
          error: `Erro Meta API ao responder: ${dataMeta.error?.message || 'Falha no envio da resposta'}`
        }, { status: 500 });
      }

      // Atualiza o comentário pai como respondido e salva a resposta
      await db.run(`
        UPDATE instagram_comentarios 
        SET respondido = 1, resposta_texto = ?
        WHERE id = ?
      `, [cleanMessage, comment_id]);

      await db.close();
      return NextResponse.json({
        success: true,
        message: 'Resposta enviada com sucesso!',
        reply_id: dataMeta.id,
        resposta_texto: cleanMessage
      });
    }

    // ─── 4. OCULTAR COMENTÁRIO (MODERAÇÃO) ───
    if (action === 'hide') {
      const urlHide = `${GRAPH_API_BASE}/${comment_id}?hide=true&access_token=${creds.access_token}`;
      await fetch(urlHide, { method: 'POST' });
      await db.close();
      return NextResponse.json({ success: true, message: 'Comentário ocultado' });
    }

    // ─── 5. DISPENSAR COMENTÁRIO (NÃO QUERO RESPONDER / BAIXAR PENDÊNCIA) ───
    if (action === 'dismiss' || action === 'ignore') {
      await db.run(`
        UPDATE instagram_comentarios 
        SET respondido = 1, resposta_texto = COALESCE(resposta_texto, '[Dispensado]')
        WHERE id = ?
      `, [comment_id]);

      await db.close();
      return NextResponse.json({
        success: true,
        message: 'Comentário dispensado com sucesso! Pendência baixada.',
        respondido: true,
        resposta_texto: '[Dispensado]'
      });
    }

    // ─── 6. DISPENSAR TODOS OS COMENTÁRIOS DE UM POST ───
    if (action === 'dismiss_post') {
      if (!media_id) {
        await db.close();
        return NextResponse.json({ success: false, error: 'media_id é obrigatório para dispensar o post' }, { status: 400 });
      }

      await db.run(`
        UPDATE instagram_comentarios 
        SET respondido = 1, resposta_texto = COALESCE(resposta_texto, '[Dispensado]')
        WHERE media_id = ?
      `, [media_id]);

      await db.close();
      return NextResponse.json({
        success: true,
        message: 'Todos os comentários desta publicação foram dispensados!',
        respondido: true
      });
    }

    // ─── 7. REABRIR PENDÊNCIA (DESFAZER DISPENSAR) ───
    if (action === 'undismiss' || action === 'unignore') {
      await db.run(`
        UPDATE instagram_comentarios 
        SET respondido = 0, resposta_texto = NULL
        WHERE id = ?
      `, [comment_id]);

      await db.close();
      return NextResponse.json({
        success: true,
        message: 'Pendência reaberta com sucesso!',
        respondido: false
      });
    }

    await db.close();
    return NextResponse.json({ success: false, error: 'Ação não suportada' }, { status: 400 });
  } catch (error: any) {
    console.error("Erro no POST /api/comentarios:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
