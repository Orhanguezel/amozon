import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function POST(_request: Request, { params }: { params: Promise<{ thesisId: string }> }) {
  const { thesisId } = await params;
  return backendJson(`/api/theses/${thesisId}/close`, { method: 'POST' });
}
