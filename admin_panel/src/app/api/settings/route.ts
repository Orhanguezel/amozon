import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET() {
  return backendJson('/api/settings');
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  return backendJson('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
