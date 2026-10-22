import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentByMerchantReference,
  createPaymentEvent,
} from '@org/db';

/**
 * GET /api/payments/[reference]/verify
 *
 * Server-side verification. Returns the authoritative payment status stored
 * in the database (updated by webhooks). Only after status === 'success'
 * should value be delivered.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;

  const payment = await getPaymentByMerchantReference(reference);
  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: 'success',
    message: `Payment is ${payment.status}`,
    data: {
      reference: payment.merchantReference,
      providerReference: payment.providerReference,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      verified_at: new Date().toISOString(),
    },
  });
}

/**
 * POST /api/payments/[reference]/verify
 *
 * Admin-triggered verification: re-reads status and records an event.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;

  const payment = await getPaymentByMerchantReference(reference);
  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  const verified = payment.status === 'success';

  await createPaymentEvent({
    paymentId: payment.id,
    eventType: `payment.${payment.status}`,
    provider: payment.provider,
    reference: payment.providerReference,
    payload: { verified, checked_at: new Date().toISOString() },
  });

  return NextResponse.json({
    status: 'success',
    message: `Payment is ${payment.status}`,
    data: {
      reference: payment.merchantReference,
      status: payment.status,
      verified,
    },
  });
}
