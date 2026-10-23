import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy (formerly "middleware") — cheap edge gate only.
 *
 * Edge runtime cannot open the SQLite database, so this layer merely checks
 * that a session cookie is present and redirects/401s when it is not. The
 * real session validation (and permission checks) happen in the Node
 * runtime, inside layouts and route handlers.
 *
 * It also stamps security headers on every response.
 */
const SESSION_COOKIE = 'fg_admin_session';

function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/login') ||
    // Login-page brand assets (public, part of the login page).
    pathname.startsWith('/brand/')
  );
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token && !isPublic(pathname)) {
    if (pathname.startsWith('/api/')) {
      return withSecurityHeaders(
        NextResponse.json(
          { message: 'Authentication required' },
          { status: 401 }
        )
      );
    }
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search =
      pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return withSecurityHeaders(NextResponse.redirect(login));
  }

  // Stale or valid cookies both pass here — the login page and the
  // dashboard layout validate the session against the database, and
  // /login with an invalid cookie simply renders the form (no loop).
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  // Everything except Next.js internals and static assets.
  matcher: ['/((?!_next|favicon.ico).*)'],
};
