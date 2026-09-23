import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { contarConteudoPeriodo } from '@/lib/contagemConteudo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: Quantidade de Reels, Posts e Stories publicados por uma conta no período (?username=&data_inicio=&data_fim=)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username')?.trim().toLowerCase().replace(/^@+/, '');
    const data_inicio = searchParams.get('data_inicio') || '';
    const data_fim = searchParams.get('data_fim') || '';
    const dataValida = /^\d{4}-\d{2}-\d{2}$/;
    if (!username || !dataValida.test(data_inicio) || !dataValida.test(data_fim)) {
      return NextResponse.json({ success: false, error: 'username, data_inicio e data_fim (YYYY-MM-DD) são obrigatórios' }, { status: 400 });
    }

    const db = await getDb();
    const data = await contarConteudoPeriodo(db, username, data_inicio, data_fim);

    return NextResponse.json({ success: true, data }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error: any) {
    console.error('[API /api/analise/conteudo GET] Erro:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
