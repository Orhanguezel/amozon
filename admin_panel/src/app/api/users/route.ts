import { NextResponse } from 'next/server';

import { createAdminUser, listAdminUsers, type AdminUserRole } from '@/lib/admin-users';
import { getSession } from '@/lib/auth';
export const dynamic = 'force-dynamic';


async function requireSession() {
  if (await getSession()) return null;
  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ users: await listAdminUsers() });
}

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const role = typeof body.role === 'string' ? body.role as AdminUserRole : undefined;
    const user = await createAdminUser({
      username: String(body.username ?? ''),
      fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
      role,
      password: String(body.password ?? ''),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kullanıcı oluşturulamadı.' }, { status: 400 });
  }
}
