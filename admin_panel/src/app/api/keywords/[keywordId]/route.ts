import { NextResponse } from 'next/server';

import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


type RouteContext = {
  params: Promise<{ keywordId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { keywordId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const keyword = String(body.keyword || '').trim();
  const marketplace = String(body.marketplace || 'com').trim() || 'com';

  if (!keyword) {
    return NextResponse.json({ error: 'keyword_required' }, { status: 400 });
  }

  return backendJson(`/api/keywords/${keywordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ keyword, marketplace }),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { keywordId } = await context.params;
  return backendJson(`/api/keywords/${keywordId}`, { method: 'DELETE' });
}
