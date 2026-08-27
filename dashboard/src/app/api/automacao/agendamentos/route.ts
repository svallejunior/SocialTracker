import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveDbPath() {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) return process.env.DB_PATH;
  const parentDb = path.resolve(process.cwd(), '..', 'instagram_tracker.db');
  if (fs.existsSync(parentDb)) return parentDb;
  const cwdDb = path.resolve(process.cwd(), 'instagram_tracker.db');
  if (fs.existsSync(cwdDb)) return cwdDb;
  return parentDb;
}

// Status aceitos para um agendamento. PUBLICANDO é escrito apenas pelo publicador
// (reivindicação atômica) e ENCERRADO encerra as ocorrências futuras de uma rotina
// preservando o histórico já publicado.
const STATUS_VALIDOS = ['AGENDADO', 'PAUSADO', 'PUBLICADO', 'PUBLICANDO', 'ERRO', 'ENCERRADO'];

async function getDb() {
  const db = await open({ filename: resolveDbPath(), driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_agendamentos (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      meta_account_id TEXT NOT NULL,
      tipo_postagem TEXT NOT NULL,
      arquivos TEXT DEFAULT '[]',
      ordem_arquivos TEXT DEFAULT 'ORDEM_SELECAO',
      tipo_agendamento TEXT DEFAULT 'DATA_ESPECIFICA',
      data_especifica TEXT DEFAULT '',
      duracao_recorrencia TEXT DEFAULT 'SEMPRE',
      data_inicio TEXT DEFAULT '',
      data_fim TEXT DEFAULT '',
      dias_selecionados TEXT DEFAULT '[]',
      modo_hora TEXT DEFAULT 'FIXA',
      hora_fixa TEXT DEFAULT '18:00',
      hora_janela_inicio TEXT DEFAULT '18:00',
      hora_janela_fim TEXT DEFAULT '21:00',
      variacao_minutos INTEGER DEFAULT 15,
      recorrencia TEXT DEFAULT 'UNICA',
      legenda TEXT DEFAULT '',
      status TEXT DEFAULT 'AGENDADO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN tipo_agendamento TEXT DEFAULT 'DATA_ESPECIFICA'`); } catch(e){}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN data_especifica TEXT DEFAULT ''`); } catch(e){}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN duracao_recorrencia TEXT DEFAULT 'SEMPRE'`); } catch(e){}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN data_inicio TEXT DEFAULT ''`); } catch(e){}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN data_fim TEXT DEFAULT ''`); } catch(e){}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN ultima_execucao DATETIME`); } catch(e){}

  // Histórico de publicações — definição canônica em publicador_instagram.py
  // (init_db_schema), replicada aqui para o dashboard funcionar antes do primeiro
  // ciclo do publicador. Datas desta tabela são em hora LOCAL.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_publicacoes (
      id TEXT PRIMARY KEY,
      agendamento_id TEXT,
      username TEXT NOT NULL,
      meta_account_id TEXT DEFAULT '',
      tipo_postagem TEXT NOT NULL,
      data_local TEXT NOT NULL,
      hora_local TEXT NOT NULL,
      publicado_em DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLICADO',
      meta_media_id TEXT DEFAULT '',
      erro_detalhe TEXT DEFAULT '',
      arquivos TEXT DEFAULT '[]',
      legenda TEXT DEFAULT '',
      origem TEXT DEFAULT 'AGENDADOR'
    );
  `);

  return db;
}

// GET: Lista todos os agendamentos (ou filtra por username)
export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    let agendamentos;
    if (username) {
      agendamentos = await db.all(
        `SELECT * FROM automacao_agendamentos WHERE LOWER(username) = LOWER(?) ORDER BY criado_em DESC`,
        [username]
      );
    } else {
      agendamentos = await db.all(
        `SELECT * FROM automacao_agendamentos ORDER BY criado_em DESC`
      );
    }

    const parsed = agendamentos.map((item: any) => ({
      ...item,
      tipo_agendamento: item.tipo_agendamento || (item.recorrencia === 'UNICA' ? 'DATA_ESPECIFICA' : 'RECORRENTE'),
      data_especifica: item.data_especifica || '',
      duracao_recorrencia: item.duracao_recorrencia || 'SEMPRE',
      data_inicio: item.data_inicio || '',
      data_fim: item.data_fim || '',
      arquivos: (() => {
        try { return JSON.parse(item.arquivos || '[]'); } catch { return []; }
      })(),
      dias_selecionados: (() => {
        try { return JSON.parse(item.dias_selecionados || '[]'); } catch { return []; }
      })()
    }));

    // Histórico real de publicações: é o que o calendário usa para as datas passadas
    // (a previsão por dia da semana só vale para hoje/futuro).
    let publicacoes: any[] = [];
    try {
      const rows = username
        ? await db.all(
            `SELECT * FROM automacao_publicacoes
              WHERE LOWER(username) = LOWER(?) AND data_local >= date('now', 'localtime', '-180 days')
              ORDER BY data_local DESC, hora_local DESC`,
            [username]
          )
        : await db.all(
            `SELECT * FROM automacao_publicacoes
              WHERE data_local >= date('now', 'localtime', '-180 days')
              ORDER BY data_local DESC, hora_local DESC`
          );
      publicacoes = rows.map((p: any) => ({
        ...p,
        arquivos: (() => {
          try { return JSON.parse(p.arquivos || '[]'); } catch { return []; }
        })()
      }));
    } catch (histErr) {
      console.warn('Histórico de publicações indisponível:', histErr);
    }

    return NextResponse.json({ success: true, agendamentos: parsed, publicacoes });
  } catch (error: any) {
    console.error('Erro ao buscar agendamentos:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Cria um novo agendamento
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const id = body.id || randomUUID();
    const username = (body.username || '').toLowerCase().trim();
    const meta_account_id = body.meta_account_id || '';
    const tipo_postagem = (body.tipo_postagem || 'FEED').toUpperCase(); // FEED, REELS, STORIES
    const arquivos = JSON.stringify(body.arquivos || []);
    const ordem_arquivos = body.ordem_arquivos || 'ORDEM_SELECAO'; // ALEATORIA, ALFANUMERICA, ORDEM_SELECAO
    const tipo_agendamento = body.tipo_agendamento || (body.recorrencia === 'UNICA' ? 'DATA_ESPECIFICA' : 'RECORRENTE');
    const data_especifica = body.data_especifica || '';
    const duracao_recorrencia = body.duracao_recorrencia || 'SEMPRE';
    const data_inicio = body.data_inicio || '';
    const data_fim = body.data_fim || '';
    const dias_selecionados = JSON.stringify(body.dias_selecionados || []);
    const modo_hora = body.modo_hora || 'FIXA'; // FIXA, ALEATORIA, VARIAR_MINUTOS
    const hora_fixa = body.hora_fixa || '18:00';
    const hora_janela_inicio = body.hora_janela_inicio || '18:00';
    const hora_janela_fim = body.hora_janela_fim || '21:00';
    const variacao_minutos = Number(body.variacao_minutos) || 15;
    const recorrencia = body.recorrencia || (tipo_agendamento === 'DATA_ESPECIFICA' ? 'UNICA' : 'SEMANAL');
    const legenda = body.legenda || '';
    const status = String(body.status || 'AGENDADO').toUpperCase();

    if (!STATUS_VALIDOS.includes(status)) {
      return NextResponse.json({ success: false, error: `Status inválido: ${status}` }, { status: 400 });
    }

    if (!username) {
      return NextResponse.json({ success: false, error: 'Username é obrigatório' }, { status: 400 });
    }

    await db.run(`
      INSERT INTO automacao_agendamentos (
        id, username, meta_account_id, tipo_postagem, arquivos, ordem_arquivos,
        tipo_agendamento, data_especifica, duracao_recorrencia, data_inicio, data_fim,
        dias_selecionados, modo_hora, hora_fixa, hora_janela_inicio, hora_janela_fim,
        variacao_minutos, recorrencia, legenda, status, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      id, username, meta_account_id, tipo_postagem, arquivos, ordem_arquivos,
      tipo_agendamento, data_especifica, duracao_recorrencia, data_inicio, data_fim,
      dias_selecionados, modo_hora, hora_fixa, hora_janela_inicio, hora_janela_fim,
      variacao_minutos, recorrencia, legenda, status
    ]);

    return NextResponse.json({ success: true, id, message: 'Agendamento criado com sucesso' });
  } catch (error: any) {
    console.error('Erro ao criar agendamento:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: Atualiza um agendamento existente
export async function PUT(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const { id } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório para atualização' }, { status: 400 });
    }

    const atual = await db.get(`SELECT * FROM automacao_agendamentos WHERE id = ?`, [id]);
    if (!atual) {
      return NextResponse.json({ success: false, error: 'Agendamento não encontrado' }, { status: 404 });
    }

    const pick = (valor: any, atualValor: any, fallback: any) =>
      valor !== undefined && valor !== null ? valor : (atualValor ?? fallback);

    // Cada campo cai para o valor atual quando o corpo não o envia — permite PUTs
    // parciais (ex.: apenas { id, status: 'ENCERRADO' }) sem zerar a rotina.
    const username = String(pick(body.username, atual.username, '')).toLowerCase().trim();
    const meta_account_id = pick(body.meta_account_id, atual.meta_account_id, '');
    const tipo_postagem = String(pick(body.tipo_postagem, atual.tipo_postagem, 'FEED')).toUpperCase();
    const arquivos = body.arquivos !== undefined ? JSON.stringify(body.arquivos || []) : (atual.arquivos || '[]');
    const ordem_arquivos = pick(body.ordem_arquivos, atual.ordem_arquivos, 'ORDEM_SELECAO');
    const tipo_agendamento = pick(
      body.tipo_agendamento,
      atual.tipo_agendamento,
      body.recorrencia === 'UNICA' ? 'DATA_ESPECIFICA' : 'RECORRENTE'
    );
    const data_especifica = pick(body.data_especifica, atual.data_especifica, '');
    const duracao_recorrencia = pick(body.duracao_recorrencia, atual.duracao_recorrencia, 'SEMPRE');
    const data_inicio = pick(body.data_inicio, atual.data_inicio, '');
    const data_fim = pick(body.data_fim, atual.data_fim, '');
    const dias_selecionados = body.dias_selecionados !== undefined
      ? JSON.stringify(body.dias_selecionados || [])
      : (atual.dias_selecionados || '[]');
    const modo_hora = pick(body.modo_hora, atual.modo_hora, 'FIXA');
    const hora_fixa = pick(body.hora_fixa, atual.hora_fixa, '18:00');
    const hora_janela_inicio = pick(body.hora_janela_inicio, atual.hora_janela_inicio, '18:00');
    const hora_janela_fim = pick(body.hora_janela_fim, atual.hora_janela_fim, '21:00');
    const variacao_minutos = Number(pick(body.variacao_minutos, atual.variacao_minutos, 15)) || 15;
    const recorrencia = pick(
      body.recorrencia,
      atual.recorrencia,
      tipo_agendamento === 'DATA_ESPECIFICA' ? 'UNICA' : 'SEMANAL'
    );
    const legenda = pick(body.legenda, atual.legenda, '');

    // O status NUNCA volta para 'AGENDADO' por omissão: isso ressuscitava rotinas
    // encerradas e datas específicas já publicadas a cada edição do formulário.
    let status = atual.status || 'AGENDADO';
    if (body.status !== undefined && body.status !== null && body.status !== '') {
      const solicitado = String(body.status).toUpperCase();
      if (!STATUS_VALIDOS.includes(solicitado)) {
        return NextResponse.json(
          { success: false, error: `Status inválido: ${solicitado}` },
          { status: 400 }
        );
      }
      status = solicitado;
    }

    await db.run(`
      UPDATE automacao_agendamentos SET
        username = ?,
        meta_account_id = ?,
        tipo_postagem = ?,
        arquivos = ?,
        ordem_arquivos = ?,
        tipo_agendamento = ?,
        data_especifica = ?,
        duracao_recorrencia = ?,
        data_inicio = ?,
        data_fim = ?,
        dias_selecionados = ?,
        modo_hora = ?,
        hora_fixa = ?,
        hora_janela_inicio = ?,
        hora_janela_fim = ?,
        variacao_minutos = ?,
        recorrencia = ?,
        legenda = ?,
        status = ?,
        atualizado_em = datetime('now')
      WHERE id = ?
    `, [
      username, meta_account_id, tipo_postagem, arquivos, ordem_arquivos,
      tipo_agendamento, data_especifica, duracao_recorrencia, data_inicio, data_fim,
      dias_selecionados, modo_hora, hora_fixa, hora_janela_inicio, hora_janela_fim,
      variacao_minutos, recorrencia, legenda, status, id
    ]);

    return NextResponse.json({ success: true, message: 'Agendamento atualizado com sucesso' });
  } catch (error: any) {
    console.error('Erro ao atualizar agendamento:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: Exclui um agendamento
export async function DELETE(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID do agendamento é obrigatório' }, { status: 400 });
    }

    await db.run(`DELETE FROM automacao_agendamentos WHERE id = ?`, [id]);

    return NextResponse.json({ success: true, message: 'Agendamento excluído com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir agendamento:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
