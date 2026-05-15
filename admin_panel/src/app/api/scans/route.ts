import { NextResponse } from 'next/server';

import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET() {
  return backendJson('/api/scans');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const keyword = String(body.keyword || '').trim();
  const marketplace = String(body.marketplace || 'com').trim() || 'com';

  if (!keyword) {
    return NextResponse.json({ error: 'keyword_required' }, { status: 400 });
  }

  return backendJson('/api/scans', {
    method: 'POST',
    body: JSON.stringify({ keyword, marketplace, auto_add: Boolean(body.auto_add) }),
  });
}
