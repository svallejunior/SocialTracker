import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const parentDb = path.resolve(process.cwd(), '..', 'instagram_tracker.db');
  if (fs.existsSync(parentDb)) return parentDb;
  const cwdDb = path.resolve(process.cwd(), 'instagram_tracker.db');
  if (fs.existsSync(cwdDb)) return cwdDb;
  return parentDb;
}

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

    return NextResponse.json({ success: true, agendamentos: parsed });
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
    const status = body.status || 'AGENDADO';

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

    const username = (body.username || '').toLowerCase().trim();
    const meta_account_id = body.meta_account_id || '';
    const tipo_postagem = (body.tipo_postagem || 'FEED').toUpperCase();
    const arquivos = JSON.stringify(body.arquivos || []);
    const ordem_arquivos = body.ordem_arquivos || 'ORDEM_SELECAO';
    const tipo_agendamento = body.tipo_agendamento || (body.recorrencia === 'UNICA' ? 'DATA_ESPECIFICA' : 'RECORRENTE');
    const data_especifica = body.data_especifica || '';
    const duracao_recorrencia = body.duracao_recorrencia || 'SEMPRE';
    const data_inicio = body.data_inicio || '';
    const data_fim = body.data_fim || '';
    const dias_selecionados = JSON.stringify(body.dias_selecionados || []);
    const modo_hora = body.modo_hora || 'FIXA';
    const hora_fixa = body.hora_fixa || '18:00';
    const hora_janela_inicio = body.hora_janela_inicio || '18:00';
    const hora_janela_fim = body.hora_janela_fim || '21:00';
    const variacao_minutos = Number(body.variacao_minutos) || 15;
    const recorrencia = body.recorrencia || (tipo_agendamento === 'DATA_ESPECIFICA' ? 'UNICA' : 'SEMANAL');
    const legenda = body.legenda || '';
    const status = body.status || 'AGENDADO';

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
