import { NextRequest } from 'next/server';
import { vpsGet, vpsPost, vpsDelete, proxyResponse } from '@/lib/vps-proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const vpsRes = await vpsGet('/api/controle');
  return proxyResponse(vpsRes);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const vpsRes = await vpsPost('/api/controle', body);
  return proxyResponse(vpsRes);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const vpsRes = await vpsDelete('/api/controle', body);
  return proxyResponse(vpsRes);
}