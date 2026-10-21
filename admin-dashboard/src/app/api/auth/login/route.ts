import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminSession,
  recordAudit,
  verifyAdminCredentials,
} from '@org/db';
import { getClientIp, SESSION_COOKIE } from '@/lib/session';

/**
 * POST /api/auth/login
 *
 * Verifies credentials, creates a database-backed session and sets an
 * HttpOnly cookie. In-memory throttle: 5 failed attempts per (ip, email)
 * pair → 10 min lockout.
 */
const MAX_FAILURES = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

const failures = new Map<string, { fails: number; lockedUntil: number }>();

function checkThrottle(key: string): number {
  const entry = failures.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  return 0;
}

function recordFailure(key: string): void {
  if (failures.size > 1000) failures.clear();
  const entry = failures.get(key) ?? { fails: 0, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.fails = 0;
  }
  failures.set(key, entry);
}

function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/payments';
  if (!value.startsWith('/') || value.startsWith('//')) return '/payments';
  if (value.startsWith('/login')) return '/payments';
  return value;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  let body: { email?: string; password?: string; next?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  const throttleKey = `${ip}|${email.toLowerCase()}`;
  const retryAfter = checkThrottle(throttleKey);
  if (retryAfter > 0) {
    return NextResponse.json(
      {
        message: `Too many failed attempts. Try again in ${Math.ceil(
          retryAfter / 60
        )} minute(s).`,
        data: { retryAfterSeconds: retryAfter },
      },
      { status: 429 }
    );
  }

  const admin = verifyAdminCredentials(email, String(body.password ?? ''));
  if (!admin) {
    recordFailure(throttleKey);
    recordAudit({
      action: 'auth.login.failed',
      target: email || '(empty email)',
      ip,
    });
    return NextResponse.json(
      { message: 'Invalid email or password.' },
      { status: 401 }
    );
  }

  failures.delete(throttleKey);

  const { token, expiresAt } = createAdminSession(admin.id);
  recordAudit({ action: 'auth.login', actor: admin, ip });

  const response = NextResponse.json({
    status: 'success',
    message: 'Signed in',
    data: {
      redirectTo: safeNext(body.next),
      user: { email: admin.email, name: admin.name, role: admin.role },
    },
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.COOKIE_SECURE === 'true',
    expires: new Date(expiresAt),
  });
  return response;
}
