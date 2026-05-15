import { backendJson } from '@/lib/backend-api';
export const dynamic = 'force-dynamic';


export async function GET() {
  return backendJson('/api/keepa/usage');
}
