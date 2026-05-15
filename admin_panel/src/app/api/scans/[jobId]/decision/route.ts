import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  return backendJson(`/api/scans/${jobId}/decision${query ? `?${query}` : ''}`);
}
