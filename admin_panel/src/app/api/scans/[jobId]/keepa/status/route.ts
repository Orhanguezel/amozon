import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return backendJson(`/api/scans/${jobId}/keepa/status`);
}
