import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function paginaResultado(titulo: string, mensagem: string, ok: boolean) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body{font-family:-apple-system,system-ui,sans-serif;background:#0D1117;color:#F3F4F6;
        display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;
        text-align:center;padding:24px}
      .box{max-width:420px}
      h1{font-size:20px;color:${ok ? '#4ADE80' : '#F87171'};margin-bottom:12px}
      p{color:#8B949E;font-size:14px;line-height:1.6}
    </style></head>
    <body><div class="box"><h1>${ok ? '✅' : '❌'} ${titulo}</h1><p>${mensagem}</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: ok ? 200 : 400 }
  );
}

// Callback do login direto do Instagram: troca o code por token, resolve a
// identidade da conta e salva em automacao_config — só a linha dessa conta,
// sem propagar pra nenhuma outra (ver bug do salvamento global no /api/automacao/config).
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = (searchParams.get('state') || '').trim();
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_description') || searchParams.get('error_reason');

  if (error) {
    return paginaResultado('Autorização recusada', errorReason || error, false);
  }
  if (!code) {
    return paginaResultado('Erro', 'Código de autorização não recebido.', false);
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI
    ?? 'http://localhost:3000/api/auth/instagram-login/callback';

  try {
    // 1. Troca o code por um token de curta duração (1h)
    const form = new URLSearchParams();
    form.set('client_id', appId);
    form.set('client_secret', appSecret);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', redirectUri);
    form.set('code', code);

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[instagram-login/callback] Falha ao trocar code por token:', tokenData);
      return paginaResultado('Falha ao autorizar', tokenData.error_message || 'Não foi possível obter o token de acesso.', false);
    }

    const shortLivedToken: string = tokenData.access_token;
    const igUserIdCurto: string | number = tokenData.user_id;

    // 2. Troca por token de longa duração (~60 dias)
    let longLivedToken = shortLivedToken;
    try {
      const exUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
      const exRes = await fetch(exUrl);
      const exData = await exRes.json();
      if (exData.access_token) longLivedToken = exData.access_token;
    } catch (exErr) {
      console.warn('[instagram-login/callback] Falha ao estender token, seguindo com o de curta duração:', exErr);
    }

    // 3. Confirma identidade real da conta autorizada
    let igUsername = state;
    let igUserId = String(igUserIdCurto || '');
    try {
      const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${longLivedToken}`);
      const meData = await meRes.json();
      if (meData.username) igUsername = meData.username;
      if (meData.user_id) igUserId = String(meData.user_id);
    } catch (meErr) {
      console.warn('[instagram-login/callback] Falha ao confirmar identidade via graph.instagram.com/me:', meErr);
    }

    if (!igUserId) {
      return paginaResultado('Erro', 'Não foi possível identificar a conta autorizada.', false);
    }

    // 4. Salva — só essa linha, upsert por id = meta_account_id
    const db = await getDb();
    await db.run(
      `INSERT INTO automacao_config (id, meta_account_id, username, app_id, app_secret, access_token, public_base_url, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, '', datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         meta_account_id = excluded.meta_account_id,
         username = excluded.username,
         access_token = excluded.access_token,
         atualizado_em = datetime('now')`,
      [igUserId, igUserId, igUsername, appId, appSecret, longLivedToken]
    );

    return paginaResultado(
      'Conta conectada!',
      `@${igUsername} agora está conectada ao SocialTracker. Pode fechar esta página.`,
      true
    );
  } catch (err: any) {
    console.error('[instagram-login/callback] Erro inesperado:', err);
    return paginaResultado('Erro inesperado', err.message || 'Falha desconhecida ao processar a autorização.', false);
  }
}
