import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentByMerchantReference,
  updatePaymentStatus,
  createPaymentEvent,
} from '@org/db';
import { notifyPaymentStatusChange, withGatewayLog } from '@/lib/gateway';

/**
 * POST /api/payments/[reference]/submit
 *
 * Called by the gateway's hosted checkout page when the customer submits a
 * payment method (e.g. Telebirr phone, card details).
 *
 * Marks the payment as awaiting the provider (auth_needed) and records an
 * audit event containing only non-sensitive method details.
 *
 * Demo mode (GATEWAY_SIMULATE_PROVIDERS=true): the gateway also dispatches a
 * simulated provider webhook shortly after so the hosted checkout page can be
 * demoed end-to-end without a real provider. Webhooks remain the source of
 * truth either way.
 */

const SIMULATE =
  process.env.GATEWAY_SIMULATE_PROVIDERS === 'true';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  return withGatewayLog(request, 'payments/submit', async (meta) => {
    const { reference } = await params;
    meta.merchantReference = reference;
    return handleSubmit(request, reference);
  });
}

async function handleSubmit(
  request: NextRequest,
  reference: string
): Promise<NextResponse> {
  const payment = await getPaymentByMerchantReference(reference);
  if (!payment) {
    return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
  }

  if (payment.status !== 'pending') {
    return NextResponse.json(
      { message: `Payment is ${payment.status} and cannot be submitted` },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const method: string | undefined = body.method;
  if (!method) {
    return NextResponse.json(
      { message: 'method is required (telebirr | chapa | card)' },
      { status: 400 }
    );
  }

  // Validate Telebirr phone (international format).
  if (method === 'telebirr') {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!/^\+\d{10,15}$/.test(phone)) {
      return NextResponse.json(
        {
          message:
            'Telebirr requires an international phone number, e.g. +251960724272',
        },
        { status: 400 }
      );
    }
  }

  // Never store raw card data — mask it.
  const masked: Record<string, unknown> = {};
  if (method === 'telebirr') {
    masked.phone = body.phone.slice(0, 9) + '****';
  }
  if (method === 'card') {
    masked.last4 = body.last4;
  }

  const provider = method === 'telebirr' ? 'telebirr' : 'chapa';

  await createPaymentEvent({
    paymentId: payment.id,
    eventType: 'payment.submitted',
    provider,
    reference: payment.merchantReference,
    payload: {
      method,
      masked,
      submitted_at: new Date().toISOString(),
    },
  });

  // Awaiting the provider's asynchronous confirmation via webhook.
  await updatePaymentStatus(payment.id, 'auth_needed');

  // Outbound merchant notification (notification_url), recorded with attempt.
  await notifyPaymentStatusChange(payment.id, 'payment.auth_needed', 'pending');

  if (SIMULATE) {
    scheduleSimulatedWebhook(request, payment, provider);
  }

  return NextResponse.json({
    status: 'submitted',
    message: 'Payment submitted — awaiting provider confirmation',
    data: {
      reference: payment.merchantReference,
      method,
      provider,
      paymentStatus: 'auth_needed',
    },
  });
}

function scheduleSimulatedWebhook(
  request: NextRequest,
  payment: { merchantReference: string; amount: number; currency: string },
  provider: string
) {
  const delay = Number(process.env.GATEWAY_SIMULATE_DELAY_MS ?? 2000);
  const origin = request.nextUrl.origin;
  const reference = payment.merchantReference;

  const payload =
    provider === 'telebirr'
      ? {
          event_type: 'payment.success',
          data: {
            reference,
            status: 'success',
            amount: String(payment.amount),
            currency: payment.currency,
          },
        }
      : {
          event: 'payment.success',
          data: {
            reference,
            chapa_reference: `SIM-${Date.now()}`,
            amount: payment.amount,
            currency: payment.currency,
            status: 'success',
          },
        };

  setTimeout(() => {
    fetch(`${origin}/api/webhooks/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) =>
      console.error('[simulate] failed to dispatch webhook:', err)
    );
  }, delay);
}
