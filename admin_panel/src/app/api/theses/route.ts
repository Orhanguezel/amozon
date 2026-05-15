import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  return backendJson(`/api/theses${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}
