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

interface OutboxRow {
  id: number;
  texto: string;
  created_at: number;
  sent_at: number | null;
  failed_at: number | null;
  last_error: string | null;
}

interface ImportRow {
  id: number;
  identifier: string;
  nome: string;
  created_at: number;
  done_at: number | null;
  resolved_chat_id: number | null;
  attempts: number;
  failed_at: number | null;
  last_error: string | null;
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
          instagram_handle, auto_enabled, notes, shark_stage, created_at, last_active_at
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
        timestamp: new Date(r.created_at * 1000).toISOString(),
        status: 'ok' as const
      }));

      // Mensagens manuais ainda pendentes ou que falharam de vez (ex: lead que nunca
      // conversou com a Luna) — sem isso, um envio que falha simplesmente some sem explicação.
      const outboxRows = await db.all<OutboxRow[]>(
        `SELECT id, texto, created_at, sent_at, failed_at, last_error FROM outbox
         WHERE chat_id = ? AND sent_at IS NULL ORDER BY id ASC`,
        [chatId]
      );
      const pendentes = (outboxRows || []).map((r) => ({
        id: `ob_${r.id}`,
        direcao: 'enviada' as const,
        texto: r.texto,
        timestamp: new Date(r.created_at * 1000).toISOString(),
        status: r.failed_at ? ('falhou' as const) : ('pendente' as const),
        erro: r.failed_at
          ? 'Não entregue — provavelmente esse lead nunca mandou mensagem pra Luna antes (Telegram exige contato prévio).'
          : undefined
      }));

      const todas = [...mensagens, ...pendentes].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      return NextResponse.json({ success: true, mensagens: todas });
    }

    if (action === 'imports') {
      // Últimas importações enfileiradas pelo dashboard, pra dar feedback visual (sucesso,
      // pendente ou falhou) em vez de a importação simplesmente sumir sem explicação.
      const rows = await db.all<ImportRow[]>(
        `SELECT id, identifier, nome, created_at, done_at, resolved_chat_id, attempts, failed_at, last_error
         FROM pending_imports ORDER BY id DESC LIMIT 20`
      );
      const imports = (rows || []).map((r) => ({
        id: r.id,
        identifier: r.identifier,
        nome: r.nome,
        status: r.done_at ? 'ok' : r.failed_at ? 'falhou' : 'pendente',
        resolved_chat_id: r.resolved_chat_id,
        last_error: r.last_error
      }));
      return NextResponse.json({ success: true, imports });
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

    const db = await getTelegramDb();

    if (action === 'import_lead') {
      const identifier = String(body.identifier || '').trim();
      const nome = String(body.nome || '').trim();
      if (!identifier || !nome) {
        return NextResponse.json({ success: false, error: 'Usuário/chat_id e nome são obrigatórios' }, { status: 400 });
      }
      // Só enfileira: o bot Python resolve o @usuário ou chat_id via Telethon e cadastra o
      // lead no CRM, sem mandar nenhuma mensagem. Ver bot/handlers/imports.py.
      await db.run(
        `INSERT INTO pending_imports (identifier, nome, created_at) VALUES (?, ?, ?)`,
        [identifier, nome, Date.now() / 1000]
      );
      return NextResponse.json({ success: true, message: 'Lead enfileirado para importação — confira o status em alguns segundos.' });
    }

    if (!chat_id) {
      return NextResponse.json({ success: false, error: 'chat_id é obrigatório' }, { status: 400 });
    }

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

    if (action === 'set_shark_stage') {
      const validStages = ['inicio', 'previas', 'pix', 'comprou'];
      const stage = String(body.stage || '');
      if (!validStages.includes(stage)) {
        return NextResponse.json({ success: false, error: 'Estágio inválido' }, { status: 400 });
      }
      // Puramente informativo (de onde o lead parou no funil da Shark) — não mexe no "stage"
      // interno da Luna. Mas "comprou" aqui reflete o mesmo fato de "Marcar comprado", então
      // sincroniza o campo purchased pra não ter duas fontes de verdade divergentes na lista.
      if (stage === 'comprou') {
        await db.run(`UPDATE leads SET shark_stage = ?, purchased = 1 WHERE chat_id = ?`, [stage, chat_id]);
      } else {
        await db.run(`UPDATE leads SET shark_stage = ? WHERE chat_id = ?`, [stage, chat_id]);
      }
      return NextResponse.json({ success: true, message: 'Estágio da Shark atualizado' });
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Erro no POST /api/telegram:', error);
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
}
