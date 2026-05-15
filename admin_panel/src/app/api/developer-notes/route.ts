import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  return backendJson(`/api/developer-notes${query ? `?${query}` : ''}`);
}

export async function POST(request: Request) {
  return backendJson('/api/developer-notes', {
    method: 'POST',
    body: JSON.stringify(await request.json()),
  });
}
