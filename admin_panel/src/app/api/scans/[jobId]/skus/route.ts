import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const url = new URL(request.url);
  return backendJson(`/api/scans/${jobId}/skus?${url.searchParams.toString()}`);
}
