import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Página de cadastro de pacotes do bot de Telegram (Flask, só escuta em 127.0.0.1 na VPS e não
// tem login próprio). Passar por aqui garante que só quem está logado no painel consegue abrir.
const UPSTREAM = process.env.TELEGRAM_WEBADMIN_URL || 'http://127.0.0.1:8765';
const PREFIX = '/telegram-pacotes';
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

async function proxy(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const search = new URL(request.url).search;
  const target = `${UPSTREAM}/${path.map(encodeURIComponent).join('/')}${search}`;

  const headers: Record<string, string> = { 'X-Forwarded-Prefix': PREFIX };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      redirect: 'manual',
      cache: 'no-store'
    });

    const body = REDIRECT_STATUSES.includes(upstream.status) ? null : await upstream.arrayBuffer();
    const response = new NextResponse(body, { status: upstream.status });
    const upstreamType = upstream.headers.get('content-type');
    const location = upstream.headers.get('location');
    if (upstreamType) response.headers.set('content-type', upstreamType);
    if (location) response.headers.set('location', location);
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Painel de pacotes indisponível (o processo telegram-sales-bot-admin está rodando?).' },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
