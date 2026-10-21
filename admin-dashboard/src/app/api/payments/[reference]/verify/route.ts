import { NextRequest, NextResponse } from 'next/server';
import {
  can,
  createPaymentEvent,
  getPaymentByMerchantReference,
  getPaymentById,
  recordAudit,
  updatePaymentStatus,
} from '@org/db';
import { getClientIp, getCurrentAdmin } from '@/lib/session';

/**
 * POST /api/payments/[reference]/verify
 *
 * Admin-triggered server-side verification. Requires the
 * `payments.verify` permission (operator and above) and records both a
 * payment event and an audit entry.
 *
 * Responds with JSON to fetch() clients, or a redirect back to the
 * payments list for plain form posts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'payments.verify')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires operator or admin)' },
      { status: 403 }
    );
  }

  const { reference } = await params;
  const payment =
    getPaymentByMerchantReference(reference) ?? getPaymentById(reference);

  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  createPaymentEvent({
    paymentId: payment.id,
    eventType: `payment.${payment.status}`,
    provider: payment.provider,
    reference: payment.providerReference,
    payload: {
      admin_verified_by: admin.email,
      checked_at: new Date().toISOString(),
    },
  });

  // Re-save to bump updated_at (audit touch).
  updatePaymentStatus(payment.id, payment.status, {
    providerReference: payment.providerReference ?? undefined,
  });

  recordAudit({
    action: 'payment.verify',
    actor: admin,
    target: payment.merchantReference,
    detail: { status: payment.status },
    ip: getClientIp(request),
  });

  if (request.headers.get('x-requested-with') === 'fetch') {
    return NextResponse.json({
      status: 'success',
      message: `Payment is ${payment.status}`,
      data: { reference: payment.merchantReference, status: payment.status },
    });
  }

  return NextResponse.redirect(new URL('/payments?saved=verified', request.url), 303);
}
