import { NextRequest, NextResponse } from 'next/server';
import {
  createPayment,
  getPaymentByMerchantReference,
  updatePaymentDetails,
  type CreatePaymentInput,
} from '@org/db';

const CURRENCIES = ['USD', 'ETB', 'UGX', 'DJF'];

/**
 * POST /api/payments/init
 *
 * Chapa-style hosted payment initialization.
 * Body:
 *   { amount, currency, customer?: {name, email, phone},
 *     merchant_reference?, meta?, return_url?, cancel_url?, notification_url? }
 *
 * Stores the payment (status=pending) and returns a checkout_url the customer
 * is redirected to.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      amount,
      currency,
      customer,
      merchant_reference,
      meta,
      return_url,
      cancel_url,
      notification_url,
    } = body ?? {};

    // Required fields (Chapa-style)
    if (!amount || !currency) {
      return NextResponse.json(
        { message: 'amount and currency are required' },
        { status: 400 }
      );
    }

    if (!CURRENCIES.includes(currency)) {
      return NextResponse.json(
        { message: `Unsupported currency: ${currency}` },
        { status: 400 }
      );
    }

    const reference =
      merchant_reference ?? `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Idempotency: avoid creating duplicate orders for the same reference.
    const existing = await getPaymentByMerchantReference(reference);
    if (existing && existing.status !== 'pending') {
      return NextResponse.json(
        {
          message: 'A payment for this reference already exists',
          data: {
            checkout_url: existing.checkoutUrl,
            reference: existing.merchantReference,
            status: existing.status,
          },
        },
        { status: 409 }
      );
    }

    const input: CreatePaymentInput = {
      merchantReference: reference,
      amount: Number(amount),
      currency,
      customer: customer
        ? {
            name: customer.first_name ?? customer.name,
            email: customer.email,
            phone: customer.phone_number ?? customer.phone,
          }
        : undefined,
      meta,
      returnUrl: return_url,
      cancelUrl: cancel_url,
      notificationUrl: notification_url,
      provider: 'chapa',
    };

    if (existing) {
      const updated = await updatePaymentDetails(existing.id, {
        amount: input.amount,
        currency: input.currency,
        customerName: input.customer?.name ?? null,
        customerEmail: input.customer?.email ?? null,
        customerPhone: input.customer?.phone ?? null,
        meta: input.meta ?? null,
        returnUrl: input.returnUrl ?? null,
        cancelUrl: input.cancelUrl ?? null,
        notificationUrl: input.notificationUrl ?? null,
      });
      if (!updated) {
        return NextResponse.json(
          { message: 'A payment for this reference has already started processing' },
          { status: 409 }
        );
      }
    } else {
      await createPayment(input);
    }

    const payment = await getPaymentByMerchantReference(reference);
    if (!payment) throw new Error('Payment could not be loaded after initialization');
    const checkoutUrl = `${request.nextUrl.origin}/payment/${reference}`;

    return NextResponse.json({
      status: 'success',
      message: 'Payment initialized',
      data: {
        checkout_url: checkoutUrl,
        reference: payment.merchantReference,
        amount: payment.amount,
        currency: payment.currency,
        created_at: payment.createdAt,
      },
    });
  } catch (err) {
    console.error('Payment init error:', err);
    return NextResponse.json(
      {
        message: err instanceof Error ? err.message : 'Initialization failed',
      },
      { status: 500 }
    );
  }
}
