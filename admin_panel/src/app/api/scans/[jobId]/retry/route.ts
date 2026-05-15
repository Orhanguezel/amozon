import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return backendJson(`/api/scans/${jobId}/retry`, { method: 'POST' });
}
