import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { formatToBrazilDateTime } from '@/lib/timezone';
import { getDb as getDbBase } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function getDb() {
  const db = await getDbBase();

  // Garante tabela e colunas necessárias
  await db.exec(`
    CREATE TABLE IF NOT EXISTS instagram_mensagens (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      modelo_username TEXT NOT NULL,
      remetente_username TEXT NOT NULL,
      remetente_id TEXT DEFAULT '',
      direcao TEXT DEFAULT 'recebida',
      texto TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      lida INTEGER DEFAULT 0,
      respondida INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    const cols = await db.all("PRAGMA table_info(instagram_mensagens)");
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has("direcao")) {
      await db.exec(`ALTER TABLE instagram_mensagens ADD COLUMN direcao TEXT DEFAULT 'recebida'`);
    }
    if (!colNames.has("remetente_id")) {
      await db.exec(`ALTER TABLE instagram_mensagens ADD COLUMN remetente_id TEXT DEFAULT ''`);
    }
  } catch (err) {
    console.error("Migration error in instagram_mensagens:", err);
  }

  return db;
}

// ─────────────────────────────────────────────
// Obtém credenciais da Meta para um determinado username
// ─────────────────────────────────────────────
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
// Sincroniza conversas e mensagens diretas da Meta Graph API de forma resiliente
// ─────────────────────────────────────────────
async function sincronizarMensagensMeta(db: any, username: string) {
  const creds = await getMetaCredentials(db, username);

  if (!creds.meta_account_id) {
    return {
      success: false,
      error: `Perfil @${username} não possui META ID configurado.`
    };
  }

  if (!creds.access_token) {
    return {
      success: false,
      error: `Perfil @${username} possui META ID (${creds.meta_account_id}), mas nenhum Access Token foi configurado.`
    };
  }

  const errosColeta: string[] = [];
  let conversations: any[] = [];
  let tokenUtilizado = creds.access_token;

  // 1. Tenta buscar páginas conectadas em /me/accounts para obter Page Tokens específicos
  let pageTokens: Array<{ page_id: string; page_name: string; page_token: string }> = [];
  try {
    const resPages = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${creds.access_token}`);
    const dataPages = await resPages.json();
    if (dataPages.data && Array.isArray(dataPages.data)) {
      pageTokens = dataPages.data.map((p: any) => ({
        page_id: p.id,
        page_name: p.name,
        page_token: p.access_token
      }));
    }
  } catch (e: any) {
    // Continua com o token principal
  }

  // 2. Estratégia A: Chamada direta no meta_account_id com platform=instagram
  try {
    const urlA = `${GRAPH_API_BASE}/${creds.meta_account_id}/conversations?platform=instagram&fields=id,updated_time,participants,messages{id,message,from,to,created_time}&access_token=${creds.access_token}`;
    const resA = await fetch(urlA);
    const dataA = await resA.json();

    if (resA.ok && dataA.data && Array.isArray(dataA.data)) {
      conversations = dataA.data;
    } else if (dataA.error) {
      errosColeta.push(`Endpoint Instagram (${creds.meta_account_id}): ${dataA.error.message}`);
    }
  } catch (e: any) {
    errosColeta.push(`Erro de conexão A: ${e.message}`);
  }

  // 3. Estratégia B: Se A falhou, tenta através das Páginas do Facebook vinculadas
  if (conversations.length === 0 && pageTokens.length > 0) {
    for (const pt of pageTokens) {
      try {
        const urlB = `${GRAPH_API_BASE}/${pt.page_id}/conversations?platform=instagram&fields=id,updated_time,participants,messages{id,message,from,to,created_time}&access_token=${pt.page_token}`;
        const resB = await fetch(urlB);
        const dataB = await resB.json();

        if (resB.ok && dataB.data && Array.isArray(dataB.data)) {
          conversations = dataB.data;
          tokenUtilizado = pt.page_token;
          break;
        } else if (dataB.error) {
          errosColeta.push(`Página "${pt.page_name}" (${pt.page_id}): ${dataB.error.message}`);
        }
      } catch (e: any) {
        errosColeta.push(`Erro página ${pt.page_name}: ${e.message}`);
      }
    }
  }

  // 4. Se não obteve conversas e houve erros de capability
  if (conversations.length === 0) {
    const isCapabilityError = errosColeta.some(e => e.includes('capability') || e.includes('não está vinculada') || e.includes('(#3)'));
    let msgExplicativa = errosColeta[0] || 'Nenhuma conversa retornada pela Meta API.';

    if (isCapabilityError) {
      msgExplicativa = `A Meta API exige vinculação entre o Instagram e a Página do Facebook:
1. No Instagram da modelo: vá em Configurações > Mensagens > Acesso a mensagens e confirme "Permitir acesso a mensagens".
2. No Meta Business Suite: acesse Configurações da Página do Facebook (${username}) e certifique-se de que a conta do Instagram está vinculada como Conta Profissional.`;
    }

    return {
      success: false,
      conversas_count: 0,
      mensagens_sincronizadas: 0,
      erros_detalhados: errosColeta,
      error: msgExplicativa
    };
  }

  // 5. Processamento 1 a 1 de cada conversa e mensagem
  let msgsSalvas = 0;
  let errosIndividuais = 0;

  for (const conv of conversations) {
    try {
      const convId = conv.id;
      const participants = conv.participants?.data || [];
      const outroParticipante = participants.find((p: any) => p.id !== creds.meta_account_id) || participants[0];
      const remetenteUsername = outroParticipante?.username || outroParticipante?.name || `user_${outroParticipante?.id || 'anon'}`;
      const remetenteId = outroParticipante?.id || '';

      const messagesList = conv.messages?.data || [];
      for (const m of messagesList) {
        try {
          if (!m.id || !m.message) continue;

          const isDaPropriaModelo = m.from?.id === creds.meta_account_id;
          const direcao = isDaPropriaModelo ? 'enviada' : 'recebida';
          const timestamp = formatToBrazilDateTime(m.created_time);

          await db.run(`
            INSERT OR REPLACE INTO instagram_mensagens (
              id, conversation_id, modelo_username, remetente_username, remetente_id, direcao, texto, timestamp, lida, respondida
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            m.id,
            convId,
            creds.username,
            remetenteUsername,
            remetenteId,
            direcao,
            m.message,
            timestamp,
            isDaPropriaModelo ? 1 : 0,
            isDaPropriaModelo ? 1 : 0
          ]);

          msgsSalvas++;
        } catch (errMsg) {
          errosIndividuais++;
        }
      }
    } catch (errConv) {
      errosIndividuais++;
    }
  }

  return {
    success: true,
    conversas_count: conversations.length,
    mensagens_sincronizadas: msgsSalvas,
    erros_individuais: errosIndividuais,
    erros_detalhados: errosColeta
  };
}

// ─────────────────────────────────────────────
// GET: Lista conversas OU histórico de mensagens
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'conversas';
    const username = (searchParams.get('username') || '').trim().toLowerCase();
    const remetente = (searchParams.get('remetente') || '').trim().toLowerCase();
    const autoSync = searchParams.get('sync') === '1';

    if (!username) {
      return NextResponse.json({ success: false, error: 'Username da modelo é obrigatório' }, { status: 400 });
    }

    const db = await getDb();
    const creds = await getMetaCredentials(db, username);

    // Se o usuário solicitou sincronização ou se a ação for 'sync_meta'
    let syncResult = null;
    if (action === 'sync_meta' || autoSync) {
      syncResult = await sincronizarMensagensMeta(db, username);
    }

    if (action === 'conversas' || action === 'sync_meta') {
      const conversas = await db.all(`
        WITH RankedMsgs AS (
          SELECT 
            id,
            conversation_id,
            modelo_username,
            remetente_username,
            remetente_id,
            direcao,
            texto,
            timestamp,
            lida,
            respondida,
            ROW_NUMBER() OVER (
              PARTITION BY LOWER(remetente_username) 
              ORDER BY datetime(timestamp) DESC, id DESC
            ) as rn
          FROM instagram_mensagens
          WHERE LOWER(modelo_username) = ?
        ),
        Counts AS (
          SELECT 
            LOWER(remetente_username) as remetente_lower,
            COUNT(*) as total_mensagens,
            SUM(CASE WHEN direcao = 'recebida' AND COALESCE(respondida, 0) = 0 THEN 1 ELSE 0 END) as pendentes_count,
            SUM(CASE WHEN direcao = 'recebida' AND COALESCE(lida, 0) = 0 THEN 1 ELSE 0 END) as nao_lidas_count
          FROM instagram_mensagens
          WHERE LOWER(modelo_username) = ?
          GROUP BY LOWER(remetente_username)
        )
        SELECT 
          r.conversation_id,
          r.remetente_username,
          r.remetente_id,
          r.texto as ultima_mensagem,
          r.direcao as ultima_direcao,
          r.timestamp as ultimo_timestamp,
          c.total_mensagens,
          c.pendentes_count,
          c.nao_lidas_count
        FROM RankedMsgs r
        JOIN Counts c ON LOWER(r.remetente_username) = c.remetente_lower
        WHERE r.rn = 1
        ORDER BY c.pendentes_count DESC, datetime(r.timestamp) DESC
      `, [username, username]);

      return NextResponse.json({
        success: true,
        meta_account_id: creds.meta_account_id,
        tem_meta_id: Boolean(creds.meta_account_id),
        tem_token: Boolean(creds.access_token),
        sync_result: syncResult,
        conversas: conversas || []
      });
    }

    if (action === 'mensagens') {
      if (!remetente) {
        return NextResponse.json({ success: false, error: 'Remetente é obrigatório para carregar o chat' }, { status: 400 });
      }

      const mensagens = await db.all(`
        SELECT 
          id,
          conversation_id,
          modelo_username,
          remetente_username,
          remetente_id,
          direcao,
          texto,
          timestamp,
          lida,
          respondida
        FROM instagram_mensagens
        WHERE LOWER(modelo_username) = ? AND LOWER(remetente_username) = ?
        ORDER BY datetime(timestamp) ASC, id ASC
      `, [username, remetente]);

      return NextResponse.json({
        success: true,
        meta_account_id: creds.meta_account_id,
        tem_meta_id: Boolean(creds.meta_account_id),
        mensagens: mensagens || []
      });
    }

    return NextResponse.json({ success: false, error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error("Erro no GET /api/respostas:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST: Envia mensagem ou marca como lida
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action = 'send_message', modelo_username, remetente_username, remetente_id, texto } = body;

    if (!modelo_username || !remetente_username) {
      return NextResponse.json({ success: false, error: 'Modelo e remetente são obrigatórios' }, { status: 400 });
    }

    const cleanModelo = modelo_username.trim().toLowerCase();
    const cleanRemetente = remetente_username.trim().toLowerCase();
    const db = await getDb();
    const creds = await getMetaCredentials(db, cleanModelo);

    if (action === 'send_message') {
      if (!texto || String(texto).trim().length === 0) {
        return NextResponse.json({ success: false, error: 'Texto da mensagem é obrigatório' }, { status: 400 });
      }

      const msgId = `msg_out_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const convId = `conv_${cleanModelo}_${cleanRemetente}`;
      const cleanTexto = String(texto).trim();

      // 1. Tenta enviar pela Meta API se houver remetente_id e credenciais
      let metaSendSuccess = false;
      let metaError = null;

      if (creds.access_token && remetente_id) {
        try {
          const sendUrl = `${GRAPH_API_BASE}/me/messages`;
          const metaRes = await fetch(sendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${creds.access_token}`
            },
            body: JSON.stringify({
              recipient: { id: remetente_id },
              message: { text: cleanTexto }
            })
          });
          const metaData = await metaRes.json();
          if (metaRes.ok && metaData.message_id) {
            metaSendSuccess = true;
          } else {
            metaError = metaData.error?.message || `HTTP ${metaRes.status}`;
          }
        } catch (e: any) {
          metaError = e.message;
        }
      }

      // 2. Insere a mensagem enviada no SQLite
      const agoraStr = formatToBrazilDateTime(new Date());
      await db.run(`
        INSERT INTO instagram_mensagens (
          id, conversation_id, modelo_username, remetente_username, remetente_id, direcao, texto, timestamp, lida, respondida
        ) VALUES (?, ?, ?, ?, ?, 'enviada', ?, ?, 1, 1)
      `, [msgId, convId, cleanModelo, cleanRemetente, remetente_id || '', cleanTexto, agoraStr]);

      // 3. Marca todas as mensagens recebidas anteriores daquele fã como respondidas e lidas
      await db.run(`
        UPDATE instagram_mensagens
        SET respondida = 1, lida = 1
        WHERE LOWER(modelo_username) = ? AND LOWER(remetente_username) = ? AND direcao = 'recebida'
      `, [cleanModelo, cleanRemetente]);

      return NextResponse.json({
        success: true,
        message: 'Mensagem enviada com sucesso',
        meta_sent: metaSendSuccess,
        meta_error: metaError,
        nova_mensagem: {
          id: msgId,
          conversation_id: convId,
          modelo_username: cleanModelo,
          remetente_username: cleanRemetente,
          direcao: 'enviada',
          texto: cleanTexto,
          timestamp: agoraStr,
          lida: 1,
          respondida: 1
        }
      });
    }

    if (action === 'mark_read') {
      await db.run(`
        UPDATE instagram_mensagens
        SET lida = 1, respondida = 1
        WHERE LOWER(modelo_username) = ? AND LOWER(remetente_username) = ? AND direcao = 'recebida'
      `, [cleanModelo, cleanRemetente]);

      return NextResponse.json({ success: true, message: 'Conversa marcada como lida e respondida' });
    }

    // ─── Dispensar conversa (Não quero responder / Baixar pendência de DM) ───
    if (action === 'mark_ignore' || action === 'dismiss') {
      await db.run(`
        UPDATE instagram_mensagens
        SET lida = 1, respondida = 1
        WHERE LOWER(modelo_username) = ? AND LOWER(remetente_username) = ? AND direcao = 'recebida'
      `, [cleanModelo, cleanRemetente]);

      return NextResponse.json({ success: true, message: 'Conversa dispensada. Pendência baixada sem enviar resposta.' });
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (error: any) {
    console.error("Erro no POST /api/respostas:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
