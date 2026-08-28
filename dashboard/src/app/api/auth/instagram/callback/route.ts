import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error, description: searchParams.get('error_description') }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Código de autorização não recebido.' }, { status: 400 });
  }

  const appId       = process.env.META_APP_ID!;
  const appSecret   = process.env.META_APP_SECRET!;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI
    ?? 'http://localhost:3000/api/auth/instagram/callback';

  // 1. Trocar o code pelo access_token
  const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id',     appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri',  redirectUri);
  tokenUrl.searchParams.set('code',          code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error) {
    return NextResponse.json({ error: 'Falha ao trocar o código pelo token.', detail: tokenData }, { status: 500 });
  }

  const accessToken: string = tokenData.access_token;

  // 2. Buscar as Pages vinculadas à conta (para pegar o Instagram Business Account via Page)
  const pagesRes  = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
  const pagesData = await pagesRes.json();

  // 3. Para cada page, tentar obter o instagram_business_account
  const igAccounts: { page_id: string; page_name: string; ig_id: string | null }[] = [];

  if (pagesData.data && Array.isArray(pagesData.data)) {
    for (const page of pagesData.data) {
      const pageTokenRes  = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const pageTokenData = await pageTokenRes.json();
      igAccounts.push({
        page_id:   page.id,
        page_name: page.name,
        ig_id:     pageTokenData.instagram_business_account?.id ?? null,
      });
    }
  }

  // 4. Também buscar os dados básicos do perfil pessoal do usuário Meta
  const meRes  = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`);
  const meData = await meRes.json();

  return NextResponse.json({
    meta_user: meData,
    access_token: accessToken,
    instagram_business_accounts: igAccounts,
  });
}
