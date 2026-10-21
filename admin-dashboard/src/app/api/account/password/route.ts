import { NextRequest, NextResponse } from 'next/server';
import { changeOwnPassword } from '@org/db';
import { getCurrentAdmin, SESSION_COOKIE } from '@/lib/session';

/**
 * POST /api/account/password — change own password (requires the current
 * password). All other sessions of this user are revoked; the current one
 * stays alive.
 */
export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const keepToken = request.cookies.get(SESSION_COOKIE)?.value;

  try {
    changeOwnPassword(
      admin.id,
      String(body.currentPassword ?? ''),
      String(body.newPassword ?? ''),
      keepToken
    );
  } catch (err) {
    const message = String((err as Error)?.message ?? 'UNKNOWN');
    if (message === 'WRONG_CURRENT_PASSWORD') {
      return NextResponse.json(
        { message: 'Current password is incorrect.' },
        { status: 400 }
      );
    }
    if (message.startsWith('Password must')) {
      return NextResponse.json({ message }, { status: 400 });
    }
    console.error('[account/password] failed:', message);
    return NextResponse.json(
      { message: 'Could not change password' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: 'success',
    message: 'Password updated — all other sessions were signed out.',
  });
}
