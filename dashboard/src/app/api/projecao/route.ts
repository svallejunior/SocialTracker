import { NextRequest } from 'next/server';
import { vpsGet, proxyResponse } from '@/lib/vps-proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const vpsRes = await vpsGet('/api/projecao', searchParams);
  return proxyResponse(vpsRes);
}
