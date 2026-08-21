import { NextRequest } from 'next/server';
import { vpsGet, vpsPut, proxyResponse } from '@/lib/vps-proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const vpsRes = await vpsGet('/api/anomalias', searchParams);
  return proxyResponse(vpsRes);
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const vpsRes = await vpsPut('/api/anomalias', body);
  return proxyResponse(vpsRes);
}
