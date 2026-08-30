import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'st_auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir arquivos estáticos, rotas internas do Next.js e endpoints de autenticação
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/img') ||
    pathname === '/login'
  ) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get(COOKIE_NAME);
  const isAuthenticated = Boolean(
    authCookie && (
      authCookie.value.includes('2802') ||
      authCookie.value.includes('1707') ||
      authCookie.value === 'authenticated'
    )
  );

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Detecção automática de dispositivo móvel (User-Agent)
  const userAgent = request.headers.get('user-agent') || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  // Se estiver acessando a raiz '/' a partir de um celular, direciona automaticamente para /mobile
  if (isMobile && pathname === '/') {
    return NextResponse.redirect(new URL('/mobile', request.url));
  }

  // Se estiver acessando '/mobile' a partir de um computador (desktop), direciona automaticamente para a versão completa '/'
  if (!isMobile && pathname === '/mobile') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
