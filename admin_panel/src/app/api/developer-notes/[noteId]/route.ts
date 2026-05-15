import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function PATCH(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  return backendJson(`/api/developer-notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(await request.json()),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  return backendJson(`/api/developer-notes/${noteId}`, { method: 'DELETE' });
}
