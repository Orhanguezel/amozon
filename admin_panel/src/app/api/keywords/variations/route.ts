import { NextResponse } from 'next/server';

import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const keyword = String(body.keyword || '').trim();
  const count = Number(body.count || 5);
  if (!keyword) return NextResponse.json({ error: 'keyword_required' }, { status: 400 });

  return backendJson('/api/keywords/variations', {
    method: 'POST',
    body: JSON.stringify({ keyword, count }),
  });
}
