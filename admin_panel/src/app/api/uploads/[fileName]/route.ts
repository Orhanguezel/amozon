import { backendRaw } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET(_request: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await params;
  return backendRaw(`/api/uploads/${encodeURIComponent(fileName)}`);
}
