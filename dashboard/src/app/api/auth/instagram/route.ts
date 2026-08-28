import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const appId     = process.env.META_APP_ID!;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI
    ?? 'http://localhost:3000/api/auth/instagram/callback';

  // Permissões mínimas para obter o ID do usuário
  const scopes = 'instagram_basic,pages_show_list';

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  url.searchParams.set('client_id',     appId);
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('scope',         scopes);
  url.searchParams.set('response_type', 'code');

  return NextResponse.redirect(url.toString());
}
