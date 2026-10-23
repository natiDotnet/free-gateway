import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentByMerchantReference,
  updatePaymentStatus,
  createPaymentEvent,
} from '@org/db';
import { notifyPaymentStatusChange, withGatewayLog } from '@/lib/gateway';

/**
 * POST /api/payments/[reference]/cancel
 *
 * Marks a pending payment as cancelled and records an audit event. Reuses the
 * same logical order reference so retries are safe.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  return withGatewayLog(request, 'payments/cancel', async (meta) => {
    const { reference } = await params;
    meta.merchantReference = reference;
    return handleCancel(reference);
  });
}

async function handleCancel(reference: string): Promise<NextResponse> {
  const payment = await getPaymentByMerchantReference(reference);
  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  const nextStatus =
    payment.status === 'pending' || payment.status === 'auth_needed'
      ? 'cancelled'
      : payment.status;

  if (nextStatus !== payment.status) {
    await updatePaymentStatus(payment.id, nextStatus);
    await notifyPaymentStatusChange(payment.id, `payment.${nextStatus}`, payment.status);
  }

  await createPaymentEvent({
    paymentId: payment.id,
    eventType: `payment.${nextStatus}`,
    provider: payment.provider,
    reference: payment.providerReference,
    payload: { cancelled_by: 'checkout', at: new Date().toISOString() },
  });

  return NextResponse.json({
    status: 'success',
    message: `Payment is ${nextStatus}`,
    data: {
      reference: payment.merchantReference,
      status: nextStatus,
    },
  });
}
