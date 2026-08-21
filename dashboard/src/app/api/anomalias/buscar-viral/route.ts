import { NextRequest } from 'next/server';
import { vpsPost, proxyResponse } from '@/lib/vps-proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const vpsRes = await vpsPost('/api/anomalias/buscar-viral', body);
  return proxyResponse(vpsRes);
}
