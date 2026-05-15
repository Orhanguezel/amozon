'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_COOKIE = 'amozon_admin_session';
const SESSION_VALUE = 'authenticated';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 saat

export async function login(formData: FormData) {
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'amozon2026';

  if (username.toLowerCase() === adminUsername && password === adminPassword) {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, SESSION_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      path: '/',
      sameSite: 'lax',
    });
    redirect('/');
  }

  return { error: 'Kullanıcı adı veya şifre hatalı.' };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}

export async function getSession() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}
