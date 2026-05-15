import { backendRaw } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  return backendRaw('/api/uploads', {
    method: 'POST',
    body: await request.formData(),
  });
}
