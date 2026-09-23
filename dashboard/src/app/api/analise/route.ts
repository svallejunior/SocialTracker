import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { contarConteudoPeriodo } from '@/lib/contagemConteudo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: Lista os registros de análise semanal (opcionalmente filtrados por username)
export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username')?.trim().toLowerCase().replace(/^@+/, '');

    let query = 'SELECT * FROM analise_perfil_semanal';
    const params: any[] = [];

    if (username) {
      query += ' WHERE LOWER(username) = ?';
      params.push(username);
    }

    query += ' ORDER BY data_inicio DESC, id DESC';

    const registrosBase = await db.all(query, params);

    // Reels/Posts/Stories de cada semana vêm do banco de publicações, não de digitação manual
    const registros = await Promise.all(registrosBase.map(async (r: any) => ({
      ...r,
      ...(await contarConteudoPeriodo(db, String(r.username || '').toLowerCase(), r.data_inicio, r.data_fim))
    })));

    return NextResponse.json({ success: true, data: registros }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error: any) {
    console.error('[API /api/analise GET] Erro:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Cria um novo registro de análise semanal
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const username = (body.username || '').trim().toLowerCase().replace(/^@+/, '');
    if (!username) {
      return NextResponse.json({ success: false, error: 'Username é obrigatório' }, { status: 400 });
    }

    const data_inicio = body.data_inicio || '';
    const data_fim = body.data_fim || '';
    if (!data_inicio || !data_fim) {
      return NextResponse.json({ success: false, error: 'Período (data de início e fim) é obrigatório' }, { status: 400 });
    }

    const dHoje = new Date();
    const hojeStr = `${dHoje.getFullYear()}-${String(dHoje.getMonth() + 1).padStart(2, '0')}-${String(dHoje.getDate()).padStart(2, '0')}`;
    if (data_fim > hojeStr) {
      return NextResponse.json({
        success: false,
        error: `O período selecionado termina em ${data_fim} e ainda não foi concluído. Só é permitido registrar após o término da semana.`
      }, { status: 400 });
    }
    const seguidores = Number(body.seguidores) || 0;
    const visualizacoes = Number(body.visualizacoes) || 0;
    const contas_alcancadas = Number(body.contas_alcancadas) || 0;
    const nao_seguidores_pct = Number(body.nao_seguidores_pct) || 0;
    const conteudo_principal = String(body.conteudo_principal || '').trim();
    const impressoes = Number(body.impressoes) || 0;
    const visitas_perfil = Number(body.visitas_perfil) || 0;
    const engajamento = Number(body.engajamento) || 0;
    const interacoes = Number(body.interacoes) || 0;

    const result = await db.run(`
      INSERT INTO analise_perfil_semanal (
        username, data_inicio, data_fim, seguidores, visualizacoes,
        contas_alcancadas, nao_seguidores_pct, conteudo_principal,
        impressoes, visitas_perfil, engajamento, interacoes,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      username, data_inicio, data_fim, seguidores, visualizacoes,
      contas_alcancadas, nao_seguidores_pct, conteudo_principal,
      impressoes, visitas_perfil, engajamento, interacoes
    ]);

    return NextResponse.json({ success: true, id: result.lastID });
  } catch (error: any) {
    console.error('[API /api/analise POST] Erro:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: Atualiza um registro existente
export async function PUT(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    const username = (body.username || '').trim().toLowerCase().replace(/^@+/, '');
    const data_inicio = body.data_inicio || '';
    const data_fim = body.data_fim || '';
    const seguidores = Number(body.seguidores) || 0;
    const visualizacoes = Number(body.visualizacoes) || 0;
    const contas_alcancadas = Number(body.contas_alcancadas) || 0;
    const nao_seguidores_pct = Number(body.nao_seguidores_pct) || 0;
    const conteudo_principal = String(body.conteudo_principal || '').trim();
    const impressoes = Number(body.impressoes) || 0;
    const visitas_perfil = Number(body.visitas_perfil) || 0;
    const engajamento = Number(body.engajamento) || 0;
    const interacoes = Number(body.interacoes) || 0;

    await db.run(`
      UPDATE analise_perfil_semanal SET
        username = COALESCE(NULLIF(?, ''), username),
        data_inicio = ?,
        data_fim = ?,
        seguidores = ?,
        visualizacoes = ?,
        contas_alcancadas = ?,
        nao_seguidores_pct = ?,
        conteudo_principal = ?,
        impressoes = ?,
        visitas_perfil = ?,
        engajamento = ?,
        interacoes = ?,
        atualizado_em = datetime('now')
      WHERE id = ?
    `, [
      username, data_inicio, data_fim, seguidores, visualizacoes,
      contas_alcancadas, nao_seguidores_pct, conteudo_principal,
      impressoes, visitas_perfil, engajamento, interacoes, id
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/analise PUT] Erro:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: Exclui um registro por ID
export async function DELETE(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');

    let id = idParam ? Number(idParam) : null;
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body?.id ? Number(body.id) : null;
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    await db.run('DELETE FROM analise_perfil_semanal WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/analise DELETE] Erro:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
