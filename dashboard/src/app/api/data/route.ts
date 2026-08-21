import { NextRequest, NextResponse } from 'next/server';
import { vpsGet, vpsPost, vpsDelete, proxyResponse } from '@/lib/vps-proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const vpsRes = await vpsGet('/api/data');
  return proxyResponse(vpsRes);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const vpsRes = await vpsPost('/api/data', body);
  return proxyResponse(vpsRes);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const vpsRes = await vpsDelete(`/api/data?username=${searchParams.get('username') || ''}`);
  return proxyResponse(vpsRes);
}