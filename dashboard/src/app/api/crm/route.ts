import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTelegramDb, resolveTelegramDbPath } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface TelegramLeadRow {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  stage: string;
  purchased: number;
  instagram_handle: string | null;
  notes: string | null;
}

// Cadastra um lead do Telegram no CRM se ele ainda não existir (por telegram_id ou username),
// usado tanto pela importação em massa quanto pelo botão "→ CRM" de um lead específico.
async function importarLeadTelegram(
  db: Awaited<ReturnType<typeof getDb>>,
  lead: TelegramLeadRow
): Promise<number | null> {
  const idTg = String(lead.chat_id);
  const userTg = lead.username ? lead.username.replace(/^@+/, '') : '';
  const userIg = lead.instagram_handle ? lead.instagram_handle.replace(/^@+/, '') : '';
  const nome = lead.first_name || (userTg ? `@${userTg}` : `Lead #${idTg}`);

  const existe = await db.get(
    `SELECT id FROM crm_clientes WHERE telegram_id = ? OR (telegram_username != '' AND telegram_username = ?)`,
    [idTg, userTg]
  );
  if (existe) return null;

  const status = lead.purchased === 1 ? 'cliente' : (lead.stage === 'fechamento' ? 'negociacao' : 'lead');
  const res = await db.run(
    `INSERT INTO crm_clientes (nome, telegram_id, telegram_username, instagram_username, status, origem, observacoes)
     VALUES (?, ?, ?, ?, ?, 'Telegram', ?)`,
    [nome, idTg, userTg, userIg, status, lead.notes || '']
  );
  return res.lastID ?? null;
}

// Cria o lançamento "recebido" vinculado a uma transação do CRM. A descrição leva
// o nome do cliente para ficar identificável no extrato.
async function registrarLancamentoCrm(
  db: Awaited<ReturnType<typeof getDb>>,
  transacaoId: number,
  username: string,
  valor: number,
  data: string,
  descricao: string | undefined,
  clienteId: number
) {
  const cliente = await db.get(`SELECT nome FROM crm_clientes WHERE id = ?`, [clienteId]);
  const partes = [String(descricao || '').trim(), cliente?.nome ? String(cliente.nome).trim() : ''].filter(Boolean);
  const desc = `CRM: ${partes.join(' - ') || 'venda'}`;
  await db.run(
    `INSERT INTO lancamentos
       (username, tipo, valor_brl, valor_original, moeda, taxa_conversao,
        data_lancamento, descricao, rateado, grupo_rateio, crm_transacao_id)
     VALUES (?, 'recebido', ?, ?, 'BRL', 1, ?, ?, 0, NULL, ?)`,
    [username, valor, valor, data, desc, transacaoId]
  );
}

// ─────────────────────────────────────────────
// GET: Lista de clientes com filtros e KPIs ou detalhes de um cliente
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'clientes';
    const db = await getDb();

    if (action === 'cliente') {
      const id = searchParams.get('id');
      if (!id) {
        return NextResponse.json({ success: false, error: 'ID do cliente é obrigatório' }, { status: 400 });
      }

      const cliente = await db.get(`SELECT * FROM crm_clientes WHERE id = ?`, [id]);
      if (!cliente) {
        return NextResponse.json({ success: false, error: 'Cliente não encontrado' }, { status: 404 });
      }

      const transacoes = await db.all(
        `SELECT * FROM crm_transacoes WHERE cliente_id = ? ORDER BY data_transacao DESC, id DESC`,
        [id]
      );

      return NextResponse.json({
        success: true,
        cliente: {
          ...cliente,
          tags: cliente.tags ? (typeof cliente.tags === 'string' ? JSON.parse(cliente.tags || '[]') : cliente.tags) : []
        },
        transacoes: transacoes || []
      });
    }

    // Listagem com busca, filtros e métricas
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const modelo = searchParams.get('modelo')?.trim() || '';
    const origem = searchParams.get('origem')?.trim() || '';
    const sortBy = searchParams.get('sortBy') || 'valor_gasto';
    const sortOrder = searchParams.get('sortOrder')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      const term = `%${search}%`;
      conditions.push(`(
        nome LIKE ? OR 
        celular LIKE ? OR 
        email LIKE ? OR 
        telegram_username LIKE ? OR 
        telegram_id LIKE ? OR 
        instagram_username LIKE ? OR 
        observacoes LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term);
    }

    if (status && status !== 'todos') {
      conditions.push(`status = ?`);
      params.push(status);
    }

    if (modelo && modelo !== 'todos') {
      conditions.push(`perfil_modelo = ?`);
      params.push(modelo);
    }

    if (origem && origem !== 'todos') {
      conditions.push(`origem = ?`);
      params.push(origem);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sanitiza campo de ordenação
    const allowedSortCols: Record<string, string> = {
      valor_gasto: 'valor_gasto',
      nome: 'nome COLLATE NOCASE',
      ultimo_contato: 'datetime(ultimo_contato)',
      criado_em: 'datetime(criado_em)',
      status: 'status'
    };
    const orderColumn = allowedSortCols[sortBy] || 'valor_gasto';

    const clientes = await db.all(
      `SELECT * FROM crm_clientes ${whereClause} ORDER BY ${orderColumn} ${sortOrder}`,
      params
    );

    // Métricas gerais consolidadas
    const metricas = await db.get(`
      SELECT
        COUNT(*) as total_clientes,
        COALESCE(SUM(valor_gasto), 0) as total_faturado,
        COALESCE(AVG(CASE WHEN valor_gasto > 0 THEN valor_gasto END), 0) as ticket_medio,
        SUM(CASE WHEN status = 'vip' THEN 1 ELSE 0 END) as total_vips,
        SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as total_leads,
        SUM(CASE WHEN status = 'negociacao' THEN 1 ELSE 0 END) as total_negociacao,
        SUM(CASE WHEN status = 'cliente' THEN 1 ELSE 0 END) as total_ativos,
        SUM(CASE WHEN status = 'inativo' THEN 1 ELSE 0 END) as total_inativos
      FROM crm_clientes
    `);

    const clientesFormatados = (clientes || []).map((c) => {
      let parsedTags = [];
      try {
        parsedTags = c.tags ? (typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags) : [];
      } catch {
        parsedTags = [];
      }
      return {
        ...c,
        tags: parsedTags
      };
    });

    return NextResponse.json({
      success: true,
      clientes: clientesFormatados,
      metricas: {
        total_clientes: metricas?.total_clientes || 0,
        total_faturado: Number(metricas?.total_faturado || 0),
        ticket_medio: Number(metricas?.ticket_medio || 0),
        total_vips: metricas?.total_vips || 0,
        total_leads: metricas?.total_leads || 0,
        total_negociacao: metricas?.total_negociacao || 0,
        total_ativos: metricas?.total_ativos || 0,
        total_inativos: metricas?.total_inativos || 0
      }
    });
  } catch (err: unknown) {
    console.error('[API CRM GET] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST: Criar novo cliente, nova transação ou importar contatos
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json().catch(() => ({}));
    const db = await getDb();

    // 1. Criar transação / compra avulsa
    if (action === 'transacao' || body.action === 'transacao') {
      const { cliente_id, valor, descricao, data_transacao, metodo_pagamento, perfil_modelo } = body;
      if (!cliente_id || valor === undefined) {
        return NextResponse.json({ success: false, error: 'cliente_id e valor são obrigatórios' }, { status: 400 });
      }

      const valNum = Number(valor) || 0;
      const dataTx = data_transacao || new Date().toISOString().slice(0, 10);

      const res = await db.run(
        `INSERT INTO crm_transacoes (cliente_id, valor, descricao, data_transacao, metodo_pagamento, perfil_modelo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cliente_id, valNum, descricao || '', dataTx, metodo_pagamento || 'PIX', perfil_modelo || '']
      );

      // Espelha a venda como receita no extrato de lançamentos (aba Análise) da modelo
      const usernameModelo = String(perfil_modelo || '').trim().replace(/^@+/, '');
      if (usernameModelo && valNum > 0 && res.lastID) {
        await registrarLancamentoCrm(db, res.lastID, usernameModelo, valNum, dataTx, descricao, cliente_id);
      }

      // Recalcula valor_gasto total do cliente somando todas as transações
      const totalRow = await db.get(
        `SELECT COALESCE(SUM(valor), 0) as total FROM crm_transacoes WHERE cliente_id = ?`,
        [cliente_id]
      );
      const novoTotal = Number(totalRow?.total || 0);

      await db.run(
        `UPDATE crm_clientes 
         SET valor_gasto = ?, ultimo_contato = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [novoTotal, cliente_id]
      );

      return NextResponse.json({
        success: true,
        transacao_id: res.lastID,
        novo_valor_gasto: novoTotal
      });
    }

    // 2. Importação opcional do banco Telegram (todos os leads de uma vez)
    if (action === 'importar_telegram' || body.action === 'importar_telegram') {
      if (!resolveTelegramDbPath()) {
        return NextResponse.json({ success: false, error: 'Banco do Telegram não configurado' }, { status: 400 });
      }
      const tgDb = await getTelegramDb();
      const tgLeads = await tgDb.all(`
        SELECT chat_id, username, first_name, stage, purchased, instagram_handle, notes, created_at
        FROM leads
      `);

      let importados = 0;
      for (const lead of tgLeads || []) {
        const foiImportado = await importarLeadTelegram(db, lead);
        if (foiImportado) importados++;
      }

      return NextResponse.json({ success: true, importados });
    }

    // 2b. Importação de UM lead específico do Telegram (botão "→ CRM" na Central de Telegram)
    if (action === 'importar_lead_telegram' || body.action === 'importar_lead_telegram') {
      const chatId = body.chat_id;
      if (!chatId) {
        return NextResponse.json({ success: false, error: 'chat_id é obrigatório' }, { status: 400 });
      }
      if (!resolveTelegramDbPath()) {
        return NextResponse.json({ success: false, error: 'Banco do Telegram não configurado' }, { status: 400 });
      }
      const tgDb = await getTelegramDb();
      const lead = await tgDb.get(
        `SELECT chat_id, username, first_name, stage, purchased, instagram_handle, notes FROM leads WHERE chat_id = ?`,
        [chatId]
      );
      if (!lead) {
        return NextResponse.json({ success: false, error: 'Lead não encontrado no Telegram' }, { status: 404 });
      }

      const idTg = String(lead.chat_id);
      const userTg = lead.username ? lead.username.replace(/^@+/, '') : '';
      const existe = await db.get(
        `SELECT id FROM crm_clientes WHERE telegram_id = ? OR (telegram_username != '' AND telegram_username = ?)`,
        [idTg, userTg]
      );
      if (existe) {
        return NextResponse.json({ success: false, error: 'Esse lead já está cadastrado no CRM', ja_existe: true, id: existe.id }, { status: 409 });
      }

      const novoId = await importarLeadTelegram(db, lead);
      return NextResponse.json({ success: true, id: novoId });
    }

    // 3. Cadastro padrão de cliente
    const {
      nome,
      celular,
      email,
      telegram_id,
      telegram_username,
      instagram_username,
      valor_gasto,
      status,
      origem,
      perfil_modelo,
      tags,
      observacoes
    } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json({ success: false, error: 'Nome do cliente é obrigatório' }, { status: 400 });
    }

    const cleanCelular = celular ? celular.trim() : '';
    const cleanEmail = email ? email.trim() : '';
    const cleanTgId = telegram_id ? String(telegram_id).trim() : '';
    const cleanTgUser = telegram_username ? telegram_username.trim().replace(/^@+/, '') : '';
    const cleanIgUser = instagram_username ? instagram_username.trim().replace(/^@+/, '') : '';
    const valGasto = Number(valor_gasto) || 0.0;
    const clientStatus = status || 'lead';
    const clientOrigem = origem || 'Instagram';
    const clientModelo = perfil_modelo || '';
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
    const notes = observacoes || '';

    const res = await db.run(
      `INSERT INTO crm_clientes (
        nome, celular, email, telegram_id, telegram_username, instagram_username,
        valor_gasto, status, origem, perfil_modelo, tags, observacoes, ultimo_contato, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        nome.trim(),
        cleanCelular,
        cleanEmail,
        cleanTgId,
        cleanTgUser,
        cleanIgUser,
        valGasto,
        clientStatus,
        clientOrigem,
        clientModelo,
        tagsJson,
        notes
      ]
    );

    const novoClienteId = res.lastID;

    // Se informou valor_gasto inicial > 0, grava uma transação de registro inicial
    if (valGasto > 0 && novoClienteId) {
      await db.run(
        `INSERT INTO crm_transacoes (cliente_id, valor, descricao, metodo_pagamento, perfil_modelo)
         VALUES (?, ?, 'Registro Inicial / Saldo Histórico', 'Outro', ?)`,
        [novoClienteId, valGasto, clientModelo]
      );
    }

    return NextResponse.json({
      success: true,
      id: novoClienteId,
      message: 'Cliente cadastrado com sucesso'
    });
  } catch (err: unknown) {
    console.error('[API CRM POST] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PUT: Atualização cadastral de cliente ou status
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID do cliente é obrigatório' }, { status: 400 });
    }

    const db = await getDb();
    const clienteExistente = await db.get(`SELECT * FROM crm_clientes WHERE id = ?`, [id]);
    if (!clienteExistente) {
      return NextResponse.json({ success: false, error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Se for atualização rápida de status
    if (body.action === 'status') {
      await db.run(
        `UPDATE crm_clientes SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
        [body.status, id]
      );
      return NextResponse.json({ success: true, message: 'Status atualizado com sucesso' });
    }

    // Campos podem vir como null (ex.: leads importados do Telegram sem celular/email)
    const texto = (v: unknown) => (v == null ? '' : String(v).trim());

    const nome = body.nome !== undefined ? texto(body.nome) : clienteExistente.nome;
    if (!nome) {
      return NextResponse.json({ success: false, error: 'Nome do cliente é obrigatório' }, { status: 400 });
    }
    const celular = body.celular !== undefined ? texto(body.celular) : clienteExistente.celular;
    const email = body.email !== undefined ? texto(body.email) : clienteExistente.email;
    const telegram_id = body.telegram_id !== undefined ? texto(body.telegram_id) : clienteExistente.telegram_id;
    const telegram_username = body.telegram_username !== undefined ? texto(body.telegram_username).replace(/^@+/, '') : clienteExistente.telegram_username;
    const instagram_username = body.instagram_username !== undefined ? texto(body.instagram_username).replace(/^@+/, '') : clienteExistente.instagram_username;
    const valor_gasto = body.valor_gasto !== undefined ? Number(body.valor_gasto) : clienteExistente.valor_gasto;
    const status = body.status !== undefined ? body.status : clienteExistente.status;
    const origem = body.origem !== undefined ? body.origem : clienteExistente.origem;
    const perfil_modelo = body.perfil_modelo !== undefined ? body.perfil_modelo : clienteExistente.perfil_modelo;
    const observacoes = body.observacoes !== undefined ? body.observacoes : clienteExistente.observacoes;
    const tags = body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : clienteExistente.tags;

    await db.run(
      `UPDATE crm_clientes SET
        nome = ?,
        celular = ?,
        email = ?,
        telegram_id = ?,
        telegram_username = ?,
        instagram_username = ?,
        valor_gasto = ?,
        status = ?,
        origem = ?,
        perfil_modelo = ?,
        tags = ?,
        observacoes = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        nome,
        celular,
        email,
        telegram_id,
        telegram_username,
        instagram_username,
        valor_gasto,
        status,
        origem,
        perfil_modelo,
        tags,
        observacoes,
        id
      ]
    );

    // Troca de modelo do cliente: as vendas que estavam na modelo antiga (e seus
    // lançamentos no extrato) passam para a nova modelo.
    const modeloAntigo = String(clienteExistente.perfil_modelo || '');
    const modeloNovo = String(perfil_modelo || '').trim().replace(/^@+/, '');
    if (modeloNovo && modeloNovo !== modeloAntigo) {
      const vendas = await db.all(
        `SELECT id FROM crm_transacoes WHERE cliente_id = ? AND COALESCE(perfil_modelo, '') IN (?, '')`,
        [id, modeloAntigo]
      );
      const idsVendas = vendas.map((v: { id: number }) => v.id);
      if (idsVendas.length > 0) {
        const marcadores = idsVendas.map(() => '?').join(',');
        await db.run(`UPDATE crm_transacoes SET perfil_modelo = ? WHERE id IN (${marcadores})`, [modeloNovo, ...idsVendas]);
        await db.run(`UPDATE lancamentos SET username = ? WHERE crm_transacao_id IN (${marcadores})`, [modeloNovo, ...idsVendas]);
      }
    }

    return NextResponse.json({ success: true, message: 'Cliente atualizado com sucesso' });
  } catch (err: unknown) {
    console.error('[API CRM PUT] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE: Exclusão de cliente ou transação
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const transacaoId = searchParams.get('transacao_id');
    const db = await getDb();

    // 1. Exclusão de transação específica
    if (transacaoId) {
      const tx = await db.get(`SELECT cliente_id FROM crm_transacoes WHERE id = ?`, [transacaoId]);
      if (!tx) {
        return NextResponse.json({ success: false, error: 'Transação não encontrada' }, { status: 404 });
      }

      await db.run(`DELETE FROM crm_transacoes WHERE id = ?`, [transacaoId]);
      await db.run(`DELETE FROM lancamentos WHERE crm_transacao_id = ?`, [transacaoId]);

      // Recalcula valor gasto
      const totalRow = await db.get(
        `SELECT COALESCE(SUM(valor), 0) as total FROM crm_transacoes WHERE cliente_id = ?`,
        [tx.cliente_id]
      );
      const novoTotal = Number(totalRow?.total || 0);

      await db.run(
        `UPDATE crm_clientes SET valor_gasto = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
        [novoTotal, tx.cliente_id]
      );

      return NextResponse.json({ success: true, novo_valor_gasto: novoTotal });
    }

    // 2. Exclusão de cliente
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID do cliente é obrigatório' }, { status: 400 });
    }

    await db.run(
      `DELETE FROM lancamentos WHERE crm_transacao_id IN (SELECT id FROM crm_transacoes WHERE cliente_id = ?)`,
      [id]
    );
    await db.run(`DELETE FROM crm_transacoes WHERE cliente_id = ?`, [id]);
    await db.run(`DELETE FROM crm_clientes WHERE id = ?`, [id]);

    return NextResponse.json({ success: true, message: 'Cliente e transações removidos com sucesso' });
  } catch (err: unknown) {
    console.error('[API CRM DELETE] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}
