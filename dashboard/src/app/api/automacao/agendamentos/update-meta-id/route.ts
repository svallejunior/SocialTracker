import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

// POST: Atualiza o meta_account_id de todos os agendamentos de um perfil
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const username = (body.username || '').trim().toLowerCase();
    const meta_account_id = (body.meta_account_id || '').trim();

    if (!username || !meta_account_id) {
      return NextResponse.json(
        { success: false, error: 'username e meta_account_id são obrigatórios' },
        { status: 400 }
      );
    }

    const result = await db.run(
      `UPDATE automacao_agendamentos
       SET meta_account_id = ?, atualizado_em = datetime('now')
       WHERE LOWER(username) = LOWER(?)`,
      [meta_account_id, username]
    );

    // Garante que a pasta de mídia local para o novo ID existe
    try {
      const automacaoDir = path.resolve(process.cwd(), '..', 'automacao', meta_account_id);
      if (!fs.existsSync(automacaoDir)) {
        fs.mkdirSync(automacaoDir, { recursive: true });
        console.log(`[update-meta-id] Pasta criada: ${automacaoDir}`);
      }
    } catch (dirErr) {
      console.warn('[update-meta-id] Não foi possível criar pasta:', dirErr);
    }

    return NextResponse.json({
      success: true,
      updated: result.changes,
      message: `Meta Account ID atualizado em ${result.changes} agendamento(s) de @${username}`
    });
  } catch (error: any) {
    console.error('Erro ao atualizar meta_account_id dos agendamentos:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
