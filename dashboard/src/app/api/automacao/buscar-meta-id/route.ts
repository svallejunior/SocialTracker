import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Busca o Meta Account ID (Instagram Business Account) de QUALQUER perfil público
// Business/Creator pelo @username, via Business Discovery API — usa o token de uma
// conta já conectada como "consulta" (a conta-alvo não precisa logar em nada).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUsername = (searchParams.get('username') || '').trim().replace('@', '').toLowerCase();

    if (!targetUsername) {
      return NextResponse.json({ success: false, error: 'Username é obrigatório' }, { status: 400 });
    }

    const db = await getDb();

    // Qualquer conta já conectada (com token válido) serve de base de consulta —
    // a Business Discovery API permite consultar dados públicos de QUALQUER conta
    // Business/Creator do Instagram usando o token de uma conta já autorizada.
    const queryRow = await db.get(
      `SELECT meta_account_id, access_token FROM automacao_config
       WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
         AND access_token IS NOT NULL AND access_token != ''
       ORDER BY (id = 'default_config') DESC, atualizado_em DESC
       LIMIT 1`
    );

    if (!queryRow) {
      return NextResponse.json({
        success: false,
        error: 'Nenhuma conta com Meta ID + Access Token configurados para usar como base de consulta.'
      }, { status: 400 });
    }

    const fields = `business_discovery.username(${encodeURIComponent(targetUsername)}){id,username,followers_count,media_count,profile_picture_url}`;
    const url = `${GRAPH_API_BASE}/${queryRow.meta_account_id}?fields=${fields}&access_token=${queryRow.access_token}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error || !data.business_discovery) {
      return NextResponse.json({
        success: false,
        error: `Não encontrado: @${targetUsername} (${data.error?.message || 'perfil inexistente ou não é conta Business/Creator'}).`
      }, { status: 404 });
    }

    const bd = data.business_discovery;
    return NextResponse.json({
      success: true,
      meta_account_id: bd.id,
      username: bd.username,
      followers_count: bd.followers_count ?? null,
      media_count: bd.media_count ?? null,
      profile_picture_url: bd.profile_picture_url || null
    });
  } catch (error: any) {
    console.error('Erro ao buscar Meta ID via Business Discovery:', error);
    return NextResponse.json({ success: false, error: error.message || 'Erro interno' }, { status: 500 });
  }
}
