/**
 * vps-proxy.ts — Helper para proxiar chamadas da Vercel → VPS
 *
 * Variáveis de ambiente necessárias:
 *   VPS_API_URL = http://SEU_IP_VPS:5000   (sem barra no final)
 *   VPS_API_KEY = sua_chave_secreta         (opcional mas recomendado)
 */

const VPS_API_URL = (process.env.VPS_API_URL || '').replace(/\/$/, '');
const VPS_API_KEY = process.env.VPS_API_KEY || '';

if (!VPS_API_URL && process.env.NODE_ENV === 'production') {
  console.error('[vps-proxy] ⚠️  VPS_API_URL não configurada! Defina em .env.local ou nas variáveis da Vercel.');
}

export function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  if (VPS_API_KEY) {
    headers['Authorization'] = `Bearer ${VPS_API_KEY}`;
  }
  return headers;
}

export async function vpsGet(path: string, searchParams?: URLSearchParams): Promise<Response> {
  const qs = searchParams?.toString();
  const url = `${VPS_API_URL}${path}${qs ? '?' + qs : ''}`;
  return fetch(url, {
    headers: buildHeaders(),
    // next.js fetch no servidor: sem cache
    cache: 'no-store',
  });
}

export async function vpsPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${VPS_API_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function vpsPut(path: string, body: unknown): Promise<Response> {
  return fetch(`${VPS_API_URL}${path}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function vpsDelete(path: string, body?: unknown): Promise<Response> {
  return fetch(`${VPS_API_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
}

/** Retorna a resposta da VPS como NextResponse, repassando status HTTP */
export async function proxyResponse(vpsRes: Response) {
  const { NextResponse } = await import('next/server');
  const data = await vpsRes.json().catch(() => ({ success: false, error: 'Resposta inválida da VPS' }));
  return NextResponse.json(data, { status: vpsRes.status });
}
