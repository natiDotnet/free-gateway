import { NextRequest, NextResponse } from 'next/server';
import { destroyAdminSession, getAdminUserBySessionToken, recordAudit } from '@org/db';
import { getClientIp, SESSION_COOKIE } from '@/lib/session';

/**
 * POST /api/auth/logout — invalidates the session row and clears the cookie.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    const admin = getAdminUserBySessionToken(token);
    if (admin) {
      recordAudit({ action: 'auth.logout', actor: admin, ip: getClientIp(request) });
    }
    destroyAdminSession(token);
  }

  const response = NextResponse.json({ status: 'success', message: 'Signed out' });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
