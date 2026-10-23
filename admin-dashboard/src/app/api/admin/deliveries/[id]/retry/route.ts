import { NextRequest, NextResponse } from 'next/server';
import { can, retryWebhookDelivery, type AdminUser } from '@org/db';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/deliveries/[id]/retry — re-attempt an outbound webhook
 * delivery (operator/admin). Requires `webhooks.manage`. The backend caps
 * attempts at 5 per delivery and refuses to retry beyond that (MAX_ATTEMPTS).
 * Every retry is audit logged inside the db layer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin: AdminUser | null = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'webhooks.manage')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires operator or admin)' },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const result = await retryWebhookDelivery(id, admin);
    if (!result) {
      return NextResponse.json({ message: 'Delivery not found' }, { status: 404 });
    }
    const { delivery, outcome } = result;
    return NextResponse.json({
      status: outcome?.ok ? 'success' : 'failed',
      message: outcome?.ok
        ? `Delivery succeeded (${delivery.responseStatus})`
        : `Delivery failed (${outcome?.error ?? delivery.responseError ?? 'unknown'})`,
      data: { delivery },
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'MAX_ATTEMPTS') {
      return NextResponse.json(
        {
          message:
            'This delivery reached the maximum number of attempts (5). The receiving endpoint must be fixed before a new status change triggers another delivery.',
        },
        { status: 409 }
      );
    }
    if (message === 'NO_PAYMENT') {
      return NextResponse.json(
        { message: 'Delivery has no targetable notification URL or payment.' },
        { status: 409 }
      );
    }
    console.error('[admin/deliveries] retry failed:', message);
    return NextResponse.json({ message: 'Delivery retry failed' }, { status: 500 });
  }
}
