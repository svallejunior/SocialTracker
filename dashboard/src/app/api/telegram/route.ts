import { NextRequest, NextResponse } from 'next/server';
import { getTelegramDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface MensagemRow {
  id: number;
  role: string;
  content: string;
  created_at: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─────────────────────────────────────────────
// GET: lista leads do bot de Telegram OU o histórico de mensagens de um lead
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'leads';

    const db = await getTelegramDb();

    if (action === 'leads') {
      const leads = await db.all(`
        SELECT
          chat_id, username, first_name, stage, message_count, purchased,
          instagram_handle, auto_enabled, notes, created_at, last_active_at
        FROM leads
        ORDER BY last_active_at DESC
        LIMIT 200
      `);

      return NextResponse.json({ success: true, leads: leads || [] });
    }

    if (action === 'mensagens') {
      const chatId = searchParams.get('chat_id');
      if (!chatId) {
        return NextResponse.json({ success: false, error: 'chat_id é obrigatório' }, { status: 400 });
      }

      const rows = await db.all<MensagemRow[]>(
        `SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC`,
        [chatId]
      );

      // Normaliza pro mesmo formato usado pelo chat do Instagram (direcao/texto/timestamp),
      // pra reaproveitar a mesma lógica visual de bolhas de mensagem.
      const mensagens = (rows || []).map((r) => ({
        id: `tg_${r.id}`,
        direcao: r.role === 'user' ? 'recebida' : 'enviada',
        texto: r.content,
        timestamp: new Date(r.created_at * 1000).toISOString()
      }));

      return NextResponse.json({ success: true, mensagens });
    }

    return NextResponse.json({ success: false, error: 'Ação inválida' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Erro no GET /api/telegram:', error);
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST: envia mensagem manual (fila outbox), liga/desliga IA por lead,
// vincula @ do Instagram, ou marca compra confirmada
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, chat_id } = body;

    if (!chat_id) {
      return NextResponse.json({ success: false, error: 'chat_id é obrigatório' }, { status: 400 });
    }

    const db = await getTelegramDb();

    if (action === 'send_message') {
      const texto = String(body.texto || '').trim();
      if (!texto) {
        return NextResponse.json({ success: false, error: 'Texto da mensagem é obrigatório' }, { status: 400 });
      }
      // Só enfileira: o processo Python do bot (com a sessão do Telegram logada) verifica
      // essa tabela periodicamente e envia de verdade. Ver bot/handlers/outbox.py.
      await db.run(
        `INSERT INTO outbox (chat_id, texto, created_at) VALUES (?, ?, ?)`,
        [chat_id, texto, Date.now() / 1000]
      );
      return NextResponse.json({ success: true, message: 'Mensagem enfileirada — o bot envia em alguns segundos.' });
    }

    if (action === 'set_auto') {
      const enabled = Boolean(body.enabled);
      await db.run(`UPDATE leads SET auto_enabled = ? WHERE chat_id = ?`, [enabled ? 1 : 0, chat_id]);
      return NextResponse.json({ success: true, message: enabled ? 'IA ligada pra esse lead' : 'IA desligada pra esse lead' });
    }

    if (action === 'link_instagram') {
      const handle = String(body.handle || '').trim().replace(/^@/, '') || null;
      await db.run(`UPDATE leads SET instagram_handle = ? WHERE chat_id = ?`, [handle, chat_id]);
      return NextResponse.json({ success: true, message: 'Instagram vinculado' });
    }

    if (action === 'marcar_compra') {
      await db.run(`UPDATE leads SET purchased = 1 WHERE chat_id = ?`, [chat_id]);
      return NextResponse.json({ success: true, message: 'Compra registrada — lead passa a pós-venda' });
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Erro no POST /api/telegram:', error);
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
}
