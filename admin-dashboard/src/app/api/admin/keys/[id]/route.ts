import { NextRequest, NextResponse } from 'next/server';
import { can, rotateApiKey, revokeApiKey, type AdminUser } from '@org/db';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/keys/[id] — rotate or revoke an API key (admin only).
 *
 * Body: { action: "rotate" | "revoke" }
 *
 * - rotate: revokes the key and issues a linked replacement; the replacement
 *   secret is returned once (data.secret).
 * - revoke: permanently revokes the key.
 *
 * The operations only "succeed" after the database has confirmed them — the
 * UI shows the one-time secret from this response, never from state reuse.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin: AdminUser | null = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'keys.manage')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires admin)' },
      { status: 403 }
    );
  }

  const { id } = await params;
  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    if (body.action === 'rotate') {
      const rotated = await rotateApiKey(id, admin);
      if (!rotated) {
        return NextResponse.json({ message: 'API key not found' }, { status: 404 });
      }
      return NextResponse.json({
        status: 'success',
        message: 'API key rotated',
        data: { key: rotated.key, secret: rotated.secret },
      });
    }

    if (body.action === 'revoke') {
      const revoked = await revokeApiKey(id, admin);
      if (!revoked) {
        return NextResponse.json({ message: 'API key not found' }, { status: 404 });
      }
      return NextResponse.json({
        status: 'success',
        message: 'API key revoked',
        data: { key: revoked },
      });
    }

    return NextResponse.json(
      { message: 'Unknown action (expected "rotate" or "revoke")' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[admin/keys] action failed:', (err as Error).message);
    return NextResponse.json({ message: 'API key operation failed' }, { status: 500 });
  }
}
