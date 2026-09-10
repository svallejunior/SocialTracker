import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Início do login direto do Instagram (Instagram API with Instagram Login) — não
// exige que a criadora tenha uma conta do Facebook, ao contrário do fluxo antigo
// em /api/auth/instagram (Facebook Login for Business).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get('username') || '').trim().replace('@', '');

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI
    ?? 'http://localhost:3000/api/auth/instagram-login/callback';

  const scope = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
    'instagram_business_manage_insights'
  ].join(',');

  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  if (username) url.searchParams.set('state', username);

  return NextResponse.redirect(url.toString());
}
