import { NextRequest, NextResponse } from 'next/server';
import {
  can,
  findAdminUserById,
  isAdminRole,
  resetAdminPassword,
  setAdminUserActive,
  updateAdminUserRole,
} from '@org/db';
import { getCurrentAdmin } from '@/lib/session';

/**
 * PATCH /api/admin/users/[id]
 *
 * Change role, activate/deactivate, or reset a password (admin only).
 * Self-protections enforced server-side: cannot deactivate yourself here
 * (use sign-out); the UI hides self-service role changes too.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const target = findAdminUserById(id);
  if (!target) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  let body: { role?: string; isActive?: boolean; newPassword?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (target.id === admin.id && body.isActive === false) {
    return NextResponse.json(
      { message: 'You cannot deactivate your own account.' },
      { status: 400 }
    );
  }

  try {
    if (body.role !== undefined) {
      if (!isAdminRole(body.role)) {
        return NextResponse.json(
          { message: 'Role must be admin, operator or viewer.' },
          { status: 400 }
        );
      }
      updateAdminUserRole(target.id, body.role, admin);
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json(
          { message: 'isActive must be a boolean.' },
          { status: 400 }
        );
      }
      setAdminUserActive(target.id, body.isActive, admin);
    }

    if (body.newPassword !== undefined) {
      resetAdminPassword(target.id, String(body.newPassword), admin);
    }
  } catch (err) {
    const message = String((err as Error)?.message ?? 'UNKNOWN');
    if (message.startsWith('Password must')) {
      return NextResponse.json({ message }, { status: 400 });
    }
    console.error('[admin/users] patch failed:', message);
    return NextResponse.json({ message: 'Could not update user' }, { status: 500 });
  }

  return NextResponse.json({
    status: 'success',
    message: 'User updated',
    data: { user: findAdminUserById(target.id) },
  });
}
