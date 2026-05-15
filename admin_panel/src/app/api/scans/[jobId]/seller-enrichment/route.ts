import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));
  return backendJson(`/api/scans/${jobId}/seller-enrichment`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
