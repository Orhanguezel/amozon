import { NextResponse } from 'next/server';

import { deleteAdminUser, updateAdminUser, type AdminUserRole } from '@/lib/admin-users';
import { getSession } from '@/lib/auth';
export const dynamic = 'force-dynamic';


type Params = {
  params: Promise<{ userId: string }>;
};

async function requireSession() {
  if (await getSession()) return null;
  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}

export async function PATCH(request: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { userId } = await params;
  try {
    const body = await request.json();
    const role = typeof body.role === 'string' ? body.role as AdminUserRole : undefined;
    const user = await updateAdminUser(userId, {
      username: typeof body.username === 'string' ? body.username : undefined,
      fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
      role,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      password: typeof body.password === 'string' ? body.password : undefined,
    });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kullanıcı güncellenemedi.' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { userId } = await params;
  try {
    await deleteAdminUser(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kullanıcı silinemedi.' }, { status: 400 });
  }
}
