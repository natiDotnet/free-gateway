import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentByMerchantReference,
  updatePaymentStatus,
  createPaymentEvent,
} from '@org/db';

/**
 * POST /api/payments/[reference]/verify
 *
 * Admin-triggered server-side verification. Re-confirms the payment status
 * stored in the database and records an audit event.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;

  const payment = getPaymentByMerchantReference(reference);
  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  createPaymentEvent({
    paymentId: payment.id,
    eventType: `payment.${payment.status}`,
    provider: payment.provider,
    reference: payment.providerReference,
    payload: { admin_verified: true, checked_at: new Date().toISOString() },
  });

  // Re-save to bump updated_at (audit touch).
  updatePaymentStatus(payment.id, payment.status, {
    providerReference: payment.providerReference ?? undefined,
  });

  return NextResponse.json({
    status: 'success',
    message: `Payment is ${payment.status}`,
    data: {
      reference: payment.merchantReference,
      status: payment.status,
    },
  });
}
