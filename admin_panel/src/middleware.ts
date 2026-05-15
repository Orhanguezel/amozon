import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'amozon_admin_session';

export function middleware(request: NextRequest) {
  // request.nextUrl.pathname is basePath-stripped — /amozon/login → /login
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/login')) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    // nextUrl.clone() preserves basePath, so /login becomes /amozon/login in the redirect
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
