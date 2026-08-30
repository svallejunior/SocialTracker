import { NextRequest, NextResponse } from 'next/server';

const VALID_PINS = ['2802', '1707'];
const COOKIE_NAME = 'st_auth';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const cleanPin = String(pin || '').trim();

    if (!VALID_PINS.includes(cleanPin)) {
      return NextResponse.json({ success: false, error: 'Senha incorreta' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    // Cookie válido por 1 ano para conveniência no celular e desktop
    response.cookies.set(COOKIE_NAME, 'authenticated_' + cleanPin, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  const isAuthenticated = Boolean(
    cookie && (cookie.value.includes('2802') || cookie.value.includes('1707') || cookie.value === 'authenticated')
  );

  return NextResponse.json({ authenticated: isAuthenticated });
}
