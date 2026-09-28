import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// GET: vínculos modelo→senha + tarefas ativas com o status de conclusão
// de uma data (padrão hoje). Traz tudo de uma vez (independe da senha) para
// a aba poder alternar entre 2802/1707 sem round-trip extra.
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataRef = searchParams.get('data_ref') || hoje();
    const db = await getDb();

    const vinculos = await db.all(
      `SELECT username, senha FROM produtividade_perfil_senha`
    );

    const tarefas = await db.all(
      `SELECT
         t.id,
         t.username,
         t.texto,
         t.criado_em,
         CASE WHEN c.id IS NULL THEN 0 ELSE 1 END as concluida
       FROM produtividade_tarefas t
       LEFT JOIN produtividade_conclusoes c
         ON c.tarefa_id = t.id AND c.data_ref = ?
       WHERE t.ativa = 1
       ORDER BY t.criado_em ASC, t.id ASC`,
      [dataRef]
    );

    return NextResponse.json({
      success: true,
      data_ref: dataRef,
      vinculos: vinculos || [],
      tarefas: (tarefas || []).map((t: any) => ({ ...t, concluida: Number(t.concluida) === 1 }))
    });
  } catch (err: unknown) {
    console.error('[API Produtividade GET] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST: vincular/desvincular modelo a uma senha, criar tarefa, concluir/desmarcar
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const db = await getDb();

    if (action === 'vincular') {
      const username = String(body.username || '').trim();
      const senha = String(body.senha || '').trim();
      if (!username || !senha) {
        return NextResponse.json({ success: false, error: 'username e senha são obrigatórios' }, { status: 400 });
      }
      await db.run(
        `INSERT INTO produtividade_perfil_senha (username, senha)
         VALUES (?, ?)
         ON CONFLICT(username) DO UPDATE SET senha = excluded.senha, atualizado_em = CURRENT_TIMESTAMP`,
        [username, senha]
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'desvincular') {
      const username = String(body.username || '').trim();
      if (!username) {
        return NextResponse.json({ success: false, error: 'username é obrigatório' }, { status: 400 });
      }
      await db.run(`DELETE FROM produtividade_perfil_senha WHERE username = ?`, [username]);
      return NextResponse.json({ success: true });
    }

    if (action === 'criar_tarefa') {
      const username = String(body.username || '').trim();
      const texto = String(body.texto || '').trim();
      if (!username || !texto) {
        return NextResponse.json({ success: false, error: 'username e texto são obrigatórios' }, { status: 400 });
      }
      const res = await db.run(
        `INSERT INTO produtividade_tarefas (username, texto) VALUES (?, ?)`,
        [username, texto]
      );
      return NextResponse.json({
        success: true,
        tarefa: { id: res.lastID, username, texto, concluida: false }
      });
    }

    if (action === 'concluir') {
      const tarefaId = Number(body.tarefa_id);
      const dataRef = body.data_ref || hoje();
      if (!tarefaId) {
        return NextResponse.json({ success: false, error: 'tarefa_id é obrigatório' }, { status: 400 });
      }
      await db.run(
        `INSERT OR IGNORE INTO produtividade_conclusoes (tarefa_id, data_ref) VALUES (?, ?)`,
        [tarefaId, dataRef]
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'desmarcar') {
      const tarefaId = Number(body.tarefa_id);
      const dataRef = body.data_ref || hoje();
      if (!tarefaId) {
        return NextResponse.json({ success: false, error: 'tarefa_id é obrigatório' }, { status: 400 });
      }
      await db.run(
        `DELETE FROM produtividade_conclusoes WHERE tarefa_id = ? AND data_ref = ?`,
        [tarefaId, dataRef]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'action inválida' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[API Produtividade POST] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE: remove (soft delete) uma tarefa da lista ativa
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id é obrigatório' }, { status: 400 });
    }
    const db = await getDb();
    await db.run(`UPDATE produtividade_tarefas SET ativa = 0 WHERE id = ?`, [id]);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API Produtividade DELETE] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}
