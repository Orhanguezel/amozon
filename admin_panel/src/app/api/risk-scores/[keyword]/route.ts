import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


type RouteContext = {
  params: Promise<{ keyword: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { keyword } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  return backendJson(`/api/risk-scores/${encodeURIComponent(keyword)}${query ? `?${query}` : ''}`);
}
