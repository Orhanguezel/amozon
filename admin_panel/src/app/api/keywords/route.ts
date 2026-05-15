import { NextResponse } from 'next/server';

import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  return backendJson(`/api/keywords${query ? `?${query}` : ''}`);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const keyword = String(body.keyword || '').trim();
  const marketplace = String(body.marketplace || 'com').trim() || 'com';

  if (!keyword) {
    return NextResponse.json({ error: 'keyword_required' }, { status: 400 });
  }

  return backendJson('/api/keywords', {
    method: 'POST',
    body: JSON.stringify({ keyword, marketplace }),
  });
}
