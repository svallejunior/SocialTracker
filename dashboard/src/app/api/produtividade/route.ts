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

function limparChecks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(c => String(c ?? '').trim()).filter(Boolean).slice(0, 30);
}

// ─────────────────────────────────────────────
// GET: vínculos modelo→senha, cards-modelo (biblioteca) e cards das colunas
// com seus checks e o status de conclusão de uma data (a cliente manda a data
// local em data_ref; o padrão é hoje em UTC). Traz tudo de uma vez para a aba
// alternar entre 2802/1707 sem round-trip extra.
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataRef = searchParams.get('data_ref') || hoje();
    const db = await getDb();

    const vinculos = await db.all(`SELECT username, senha FROM produtividade_perfil_senha`);

    const templatesRaw = await db.all(
      `SELECT id, titulo, checks_json FROM produtividade_templates WHERE ativa = 1 ORDER BY id ASC`
    );
    const templates = (templatesRaw || []).map((t: any) => {
      let checks: string[] = [];
      try { checks = limparChecks(JSON.parse(t.checks_json)); } catch { /* json inválido */ }
      return { id: t.id, titulo: t.titulo, checks };
    });

    const cardsRaw = await db.all(
      `SELECT id, username, titulo FROM produtividade_cards WHERE ativa = 1 ORDER BY id ASC`
    );
    const checksRaw = await db.all(
      `SELECT k.id, k.card_id, k.texto,
              CASE WHEN o.check_id IS NULL THEN 0 ELSE 1 END as concluida
       FROM produtividade_checks k
       JOIN produtividade_cards c ON c.id = k.card_id AND c.ativa = 1
       LEFT JOIN produtividade_check_conclusoes o ON o.check_id = k.id AND o.data_ref = ?
       ORDER BY k.ordem ASC, k.id ASC`,
      [dataRef]
    );
    const checksPorCard: Record<number, any[]> = {};
    (checksRaw || []).forEach((k: any) => {
      (checksPorCard[k.card_id] ||= []).push({ id: k.id, texto: k.texto, concluida: Number(k.concluida) === 1 });
    });
    const cards = (cardsRaw || []).map((c: any) => ({ ...c, checks: checksPorCard[c.id] || [] }));

    return NextResponse.json({
      success: true,
      data_ref: dataRef,
      vinculos: vinculos || [],
      templates,
      cards
    });
  } catch (err: unknown) {
    console.error('[API Produtividade GET] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST: vincular/desvincular modelo, gerir cards-modelo, aplicar/mover/remover
// cards nas colunas e marcar/desmarcar checks do dia
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

    if (action === 'salvar_template') {
      const titulo = String(body.titulo || '').trim();
      const checks = limparChecks(body.checks);
      if (!titulo) {
        return NextResponse.json({ success: false, error: 'titulo é obrigatório' }, { status: 400 });
      }
      if (checks.length === 0) checks.push(titulo);
      const id = Number(body.id) || 0;
      if (id) {
        await db.run(
          `UPDATE produtividade_templates SET titulo = ?, checks_json = ? WHERE id = ?`,
          [titulo, JSON.stringify(checks), id]
        );
        return NextResponse.json({ success: true, template: { id, titulo, checks } });
      }
      const res = await db.run(
        `INSERT INTO produtividade_templates (titulo, checks_json) VALUES (?, ?)`,
        [titulo, JSON.stringify(checks)]
      );
      return NextResponse.json({ success: true, template: { id: res.lastID, titulo, checks } });
    }

    if (action === 'excluir_template') {
      const id = Number(body.id);
      if (!id) return NextResponse.json({ success: false, error: 'id é obrigatório' }, { status: 400 });
      await db.run(`UPDATE produtividade_templates SET ativa = 0 WHERE id = ?`, [id]);
      return NextResponse.json({ success: true });
    }

    // Arrastar um card-modelo para a coluna de uma modelo: copia título + checks.
    if (action === 'aplicar_template') {
      const username = String(body.username || '').trim();
      const templateId = Number(body.template_id);
      if (!username || !templateId) {
        return NextResponse.json({ success: false, error: 'username e template_id são obrigatórios' }, { status: 400 });
      }
      const t = await db.get(
        `SELECT titulo, checks_json FROM produtividade_templates WHERE id = ? AND ativa = 1`,
        [templateId]
      );
      if (!t) return NextResponse.json({ success: false, error: 'card-modelo não encontrado' }, { status: 404 });
      let checks: string[] = [];
      try { checks = limparChecks(JSON.parse(t.checks_json)); } catch { /* json inválido */ }
      if (checks.length === 0) checks = [t.titulo];

      const card = await db.run(
        `INSERT INTO produtividade_cards (username, titulo) VALUES (?, ?)`,
        [username, t.titulo]
      );
      const novosChecks: { id: number; texto: string; concluida: boolean }[] = [];
      for (let i = 0; i < checks.length; i++) {
        const r = await db.run(
          `INSERT INTO produtividade_checks (card_id, texto, ordem) VALUES (?, ?, ?)`,
          [card.lastID, checks[i], i]
        );
        novosChecks.push({ id: r.lastID as number, texto: checks[i], concluida: false });
      }
      return NextResponse.json({
        success: true,
        card: { id: card.lastID, username, titulo: t.titulo, checks: novosChecks }
      });
    }

    if (action === 'mover_card') {
      const cardId = Number(body.card_id);
      const username = String(body.username || '').trim();
      if (!cardId || !username) {
        return NextResponse.json({ success: false, error: 'card_id e username são obrigatórios' }, { status: 400 });
      }
      await db.run(`UPDATE produtividade_cards SET username = ? WHERE id = ?`, [username, cardId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'excluir_card') {
      const cardId = Number(body.card_id);
      if (!cardId) return NextResponse.json({ success: false, error: 'card_id é obrigatório' }, { status: 400 });
      await db.run(`UPDATE produtividade_cards SET ativa = 0 WHERE id = ?`, [cardId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'concluir_check') {
      const checkId = Number(body.check_id);
      const dataRef = body.data_ref || hoje();
      if (!checkId) return NextResponse.json({ success: false, error: 'check_id é obrigatório' }, { status: 400 });
      await db.run(
        `INSERT OR IGNORE INTO produtividade_check_conclusoes (check_id, data_ref) VALUES (?, ?)`,
        [checkId, dataRef]
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'desmarcar_check') {
      const checkId = Number(body.check_id);
      const dataRef = body.data_ref || hoje();
      if (!checkId) return NextResponse.json({ success: false, error: 'check_id é obrigatório' }, { status: 400 });
      await db.run(
        `DELETE FROM produtividade_check_conclusoes WHERE check_id = ? AND data_ref = ?`,
        [checkId, dataRef]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'action inválida' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[API Produtividade POST] Erro:', err);
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 });
  }
}
