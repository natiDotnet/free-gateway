import { NextRequest, NextResponse } from 'next/server';
import { can, createAdminUser, listAdminUsers, type AdminUser } from '@org/db';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users — list staff (admin only).
 * POST /api/admin/users — create staff (admin only).
 */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'users.manage')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires admin)' },
      { status: 403 }
    );
  }
  return NextResponse.json({ status: 'success', data: { users: listAdminUsers() } });
}

function errorResponse(err: unknown): NextResponse {
  const message = String((err as Error)?.message ?? 'VALIDATION');
  const errorMap: Record<string, string> = {
    'VALIDATION-email': 'Enter a valid email address.',
    'VALIDATION-name': 'Provide a name of 1–80 characters.',
    NOT_FOUND: 'User not found.',
  };
  if (errorMap[message] || message.startsWith('VALIDATION-') || message.startsWith('Password must')) {
    return NextResponse.json(
      { message: errorMap[message] ?? message },
      { status: 400 }
    );
  }
  if (message.includes('UNIQUE')) {
    return NextResponse.json(
      { message: 'A user with this email already exists.' },
      { status: 409 }
    );
  }
  console.error('[admin/users] create failed:', message);
  return NextResponse.json({ message: 'Could not create user' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const admin: AdminUser | null = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'users.manage')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires admin)' },
      { status: 403 }
    );
  }

  let body: { email?: string; name?: string; role?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const user = createAdminUser(
      {
        email: String(body.email ?? ''),
        name: String(body.name ?? ''),
        role: (body.role ?? 'viewer') as 'admin' | 'operator' | 'viewer',
        password: String(body.password ?? ''),
      },
      admin
    );
    return NextResponse.json({
      status: 'success',
      message: 'User created',
      data: { user },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
