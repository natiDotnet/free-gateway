import { NextRequest, NextResponse } from 'next/server';
import {
  can,
  createPaymentEvent,
  deliverPaymentNotification,
  getPaymentByMerchantReference,
  getPaymentById,
  recordAudit,
  updatePaymentStatus,
} from '@org/db';
import { getClientIp, getCurrentAdmin } from '@/lib/session';

/**
 * POST /api/payments/[reference]/cancel
 *
 * Admin-triggered cancellation of an open payment (pending, auth_needed or
 * incomplete). Requires the `payments.cancel` permission (operator and
 * above) and records both a payment event and an audit entry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'payments.cancel')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires operator or admin)' },
      { status: 403 }
    );
  }

  const { reference } = await params;
  const payment =
    (await getPaymentByMerchantReference(reference)) ??
    (await getPaymentById(reference));

  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  const openable =
    payment.status === 'pending' ||
    payment.status === 'auth_needed' ||
    payment.status === 'incomplete';

  if (!openable) {
    const message = `Payment is already ${payment.status} and cannot be cancelled`;
    if (request.headers.get('x-requested-with') === 'fetch') {
      return NextResponse.json({ message }, { status: 409 });
    }
    return NextResponse.redirect(
      new URL('/payments?error=not_cancellable', request.url),
      303
    );
  }

  await updatePaymentStatus(payment.id, 'cancelled', {
    providerReference: payment.providerReference ?? undefined,
  });

  // Fire the merchant's notification_url for the cancelled status (recorded
  // as a webhook delivery attempt). Best-effort — failures are not thrown.
  await deliverPaymentNotification(payment.id, 'payment.cancelled', payment.status, {
    timeoutMs: 4000,
  }).catch(() => undefined);

  await createPaymentEvent({
    paymentId: payment.id,
    eventType: 'payment.cancelled',
    provider: 'admin',
    reference: payment.providerReference,
    payload: {
      cancelled_by: admin.email,
      cancelled_at: new Date().toISOString(),
      previous_status: payment.status,
    },
  });

  await recordAudit({
    action: 'payment.cancel',
    actor: admin,
    target: payment.merchantReference,
    detail: { previousStatus: payment.status },
    ip: getClientIp(request),
  });

  if (request.headers.get('x-requested-with') === 'fetch') {
    return NextResponse.json({
      status: 'success',
      message: `Payment ${payment.merchantReference} cancelled`,
      data: { reference: payment.merchantReference, status: 'cancelled' },
    });
  }

  return NextResponse.redirect(new URL('/payments?saved=cancelled', request.url), 303);
}
