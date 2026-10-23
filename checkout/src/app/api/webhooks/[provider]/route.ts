import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentByMerchantReference,
  getPaymentByProviderReference,
  findOpenPaymentByAmount,
  updatePaymentStatus,
  updatePaymentProvider,
  createPaymentEvent,
  type Payment,
  type PaymentStatus,
} from '@org/db';
import { notifyPaymentStatusChange, withGatewayLog, type GatewayRequestMeta } from '@/lib/gateway';

/**
 * POST /api/webhooks/[provider]
 *
 * Receives webhooks from payment providers (Telebirr, Chapa, ...).
 *
 * Supported payload shapes:
 *
 * 1. Chapa-style
 *    { event: "payment.success", data: { reference, chapa_reference, ... } }
 *
 * 2. Generic { status, reference | transaction_id, ... }
 *
 * 3. Telebirr SMS notify (SMS forwarder) — flat payload, no merchant ref:
 *    {
 *      createdAt, provider: "telebirr", from: "127",
 *      amount: "5.00", sender_name, sender_phone (masked),
 *      datetime, transaction_number: "DJJ928K0V3",
 *      balance: "ETB 5.00.",
 *      text: "Dear TAMRAT \nYou have received ETB 5.00 from ...",
 *      sentStamp, receivedStamp, sim
 *    }
 *    Reconciliation: idempotent by `transaction_number`; falls back to the
 *    merchant reference found in the SMS text, then to open ETB payments
 *    matching the amount (prefers `auth_needed`).
 *
 * Webhooks are the source of truth for status changes — redirects alone are
 * never trusted. Always ack with 200 to prevent provider retries.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  return withGatewayLog(request, 'webhooks', async (meta) => {
    const { provider } = await ctx.params;
    return handleProviderWebhook(request, provider, meta);
  });
}

async function handleProviderWebhook(
  request: NextRequest,
  provider: string,
  meta: GatewayRequestMeta
): Promise<NextResponse> {
  void request;

  let body: any;
  try {
    body = await request.json();
  } catch {
    // Non-JSON webhook (e.g. form-encoded). Acknowledge anyway.
    return NextResponse.json({ message: 'Event received' }, { status: 200 });
  }

  // Trust the payload's provider field when present (SMS forwarders set it).
  const providerName = String(body?.provider ?? provider ?? 'unknown').toLowerCase();

  // ----- Telebirr SMS-parsed notify (no merchant ref, flat payload) -----
  if (providerName === 'telebirr' && (body.transaction_number || body.text)) {
    return handleTelebirrSmsNotify(providerName, body, meta);
  }

  // ------------------------------------------------------------------
  // Normalize provider-specific payloads into a common shape.
  // ------------------------------------------------------------------
  let eventType: string | undefined;
  let reference: string | undefined; // merchant_reference or provider reference
  let status: PaymentStatus | undefined;
  let providerReference: string | undefined;

  const data = body.data ?? body;

  // ----- Chapa-style: { event: "payment.success", data: {...} } -----
  if (body.event && body.data) {
    eventType = body.event;
    reference = body.data.reference ?? body.data.merchant_reference;
    providerReference = body.data.chapa_reference ?? body.data.reference;
    status = mapChapaEvent(body.event);
  }
  // ----- Generic: top-level status + reference -----
  else if (data.status && (data.reference || data.transaction_id)) {
    reference = data.reference ?? data.transaction_id;
    providerReference = data.reference;
    status = mapStatus(data.status);
    eventType = `payment.${status}`;
  }
  // ----- Generic fallback: trx_ref / order_id -----
  else if (data.trx_ref || data.order_id) {
    reference = data.trx_ref ?? data.order_id;
    status = mapStatus(data.status ?? data.result);
    eventType = `payment.${status}`;
  }

  if (!reference && !providerReference) {
    console.log(`[webhook:${providerName}] unknown payload shape`, body);
    return NextResponse.json({ message: 'Event received' }, { status: 200 });
  }

  // Find payment: prefer provider_reference, then merchant_reference.
  let payment = providerReference
    ? await getPaymentByProviderReference(providerReference)
    : undefined;
  payment ??= reference ? await getPaymentByMerchantReference(reference) : undefined;

  if (!payment) {
    meta.errorCode = meta.errorCode ?? 'not_found';
    console.log(`[webhook:${providerName}] payment not found`, {
      reference,
      providerReference,
    });
    return NextResponse.json({ message: 'Event received' }, { status: 200 });
  }
  meta.merchantReference = payment.merchantReference;

  const nextStatus = status ?? payment.status;

  // Idempotency: only record a new event when status actually changes.
  if (nextStatus !== payment.status) {
    await updatePaymentStatus(payment.id, nextStatus, {
      providerReference,
    });
    // Record which provider actually settled this payment.
    if (providerName !== payment.provider) {
      await updatePaymentProvider(payment.id, providerName);
    }
    // Outbound merchant notification (notification_url), recorded with attempt.
    await notifyPaymentStatusChange(
      payment.id,
      eventType ?? `payment.${nextStatus}`,
      payment.status
    );
  }

  await createPaymentEvent({
    paymentId: payment.id,
    eventType: eventType ?? `payment.${nextStatus}`,
    provider: providerName,
    reference: providerReference ?? reference,
    payload: body,
  });

  console.log(`[webhook:${providerName}] updated`, {
    merchantReference: payment.merchantReference,
    provider: providerName,
    previousStatus: payment.status,
    nextStatus,
  });

  return NextResponse.json({ message: 'Event received' }, { status: 200 });
}

/* ==================================================================== */
/* Telebirr SMS-parsed notifications                                    */
/* ==================================================================== */

/**
 * Handle the real Telebirr SMS notification forwarded by the SMS gateway.
 * The SMS has no merchant_reference, so we reconcile in this order:
 *
 *   1. Idempotency — `transaction_number` already settled → duplicate, ack.
 *   2. `transaction_number` already linked to a payment.
 *   3. Merchant reference found in the SMS text (e.g. the payer wrote ORD-123).
 *   4. Amount match among open ETB payments (auth_needed preferred, then
 *      pending) — the gateway's hosted checkout tells the customer the exact
 *      amount required for the selected Telebirr payment.
 */
async function handleTelebirrSmsNotify(
  providerName: string,
  body: any,
  meta: GatewayRequestMeta
): Promise<NextResponse> {
  const text = typeof body.text === 'string' ? body.text : '';
  const transactionNumber =
    typeof body.transaction_number === 'string'
      ? body.transaction_number.trim()
      : null;

  // Optional integrity guard: accept only SMS addressed to our account.
  const accountName = process.env.TELEBIRR_ACCOUNT_NAME;
  if (accountName && !text.toLowerCase().includes(accountName.toLowerCase())) {
    console.log(`[webhook:${providerName}] SMS not addressed to configured account, ignoring`, {
      expected: accountName,
      transaction_number: transactionNumber,
    });
    return NextResponse.json({ message: 'Event received' }, { status: 200 });
  }

  const amount = parseAmountValue(
    body.amount ?? text.match(/ETB\s*([\d,]+(?:\.\d+)?)?/)?.[1]
  );
  const smsStatus = detectSmsStatus(text);

  // 1) Idempotency — this transaction number already settled a payment.
  const existingByTxn = transactionNumber
    ? await getPaymentByProviderReference(transactionNumber)
    : undefined;
  if (existingByTxn?.status === 'success') {
    console.log(`[webhook:${providerName}] duplicate SMS notify ignored`, {
      transaction_number: transactionNumber,
      merchantReference: existingByTxn.merchantReference,
    });
    return NextResponse.json({ message: 'Event received' }, { status: 200 });
  }

  // 2)–4) Reconcile.
  const extractedRef = extractMerchantReference(text);
  let payment = existingByTxn;
  payment ??= extractedRef
    ? await getPaymentByMerchantReference(extractedRef)
    : undefined;
  payment ??= amount != null ? await findOpenTelebirrPaymentByAmount(amount) : undefined;

  if (!payment) {
    meta.errorCode = meta.errorCode ?? 'not_found';
    console.log(`[webhook:${providerName}] could not reconcile SMS notify — recorded nowhere`, {
      transaction_number: transactionNumber,
      amount,
      extractedRef,
    });
    return NextResponse.json({ message: 'Event received' }, { status: 200 });
  }
  meta.merchantReference = payment.merchantReference;

  const nextStatus = smsStatus ?? payment.status;

  if (nextStatus !== payment.status) {
    await updatePaymentStatus(payment.id, nextStatus, {
      providerReference: transactionNumber ?? payment.providerReference ?? undefined,
    });
    // Record which provider actually settled this payment.
    if (providerName !== payment.provider) {
      await updatePaymentProvider(payment.id, providerName);
    }
    // Outbound merchant notification (notification_url), recorded with attempt.
    await notifyPaymentStatusChange(
      payment.id,
      smsStatus ? `payment.${smsStatus}` : `payment.${payment.status}`,
      payment.status
    );
  }

  await createPaymentEvent({
    paymentId: payment.id,
    eventType: smsStatus
      ? `payment.${smsStatus}`
      : `payment.${payment.status}`,
    provider: providerName,
    reference: transactionNumber,
    payload: body,
  });

  console.log(`[webhook:${providerName}] updated from SMS notify`, {
    merchantReference: payment.merchantReference,
    provider: providerName,
    transaction_number: transactionNumber,
    amount,
    previousStatus: payment.status,
    nextStatus,
    reconciledBy: existingByTxn
      ? 'transaction_number'
      : extractedRef
        ? 'text-reference'
        : 'amount-match',
  });

  return NextResponse.json({ message: 'Event received' }, { status: 200 });
}

/**
 * Find an open (awaiting or not-yet-paid) ETB payment whose amount matches.
 * Prefers `auth_needed` (customer already chose Telebirr on hosted checkout);
 * falls back to `pending`.
 */
function findOpenTelebirrPaymentByAmount(amount: number): Promise<Payment | undefined> {
  return findOpenPaymentByAmount('ETB', amount);
}

/**
 * Pull a merchant reference out of the SMS text. Supports the gateway's own
 * default reference format (ORD-…) plus a generic `Ref: …` / `Order #…` line
 * the payer may have added to the Telebirr transaction.
 */
function extractMerchantReference(text: string): string | null {
  const ord = text.match(/\b(ORD[-_][A-Za-z0-9-]+)\b/i);
  if (ord) return ord[1];
  const ref = text.match(
    /\b(?:ref(?:erence)?.{0,6}|order.{0,6}| trx.{0,6})[:#-]?\s*([A-Za-z0-9_-]{4,})\b/i
  );
  if (ref) return ref[1];
  return null;
}

/** Map a Telebirr SMS sentence onto a PaymentStatus. */
function detectSmsStatus(text: string): PaymentStatus | undefined {
  if (/you have received|payment received/i.test(text)) return 'success';
  if (/\b(failed|declined|reversed|rejected)\b/i.test(text)) return 'failed';
  return undefined;
}

/** "5.00" | "ETB 5.00." | "1,250.50" → 5 | 5 | 1250.5 */
function parseAmountValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function mapChapaEvent(event: string): PaymentStatus | undefined {
  const map: Record<string, PaymentStatus> = {
    'payment.success': 'success',
    'payment.failed': 'failed',
    'payment.cancelled': 'cancelled',
    'payment.incomplete': 'incomplete',
    'payment.auth_needed': 'auth_needed',
    'payment.blocked': 'blocked',
  };
  return map[event];
}

function mapStatus(value: any): PaymentStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.toLowerCase();
  if (v.includes('success') || v === 'paid' || v === 'completed') return 'success';
  if (v.includes('fail') || v === 'rejected') return 'failed';
  if (v.includes('cancel')) return 'cancelled';
  if (v.includes('incomplete') || v === 'pending') return 'pending';
  if (v.includes('auth') || v === 'awaiting') return 'auth_needed';
  if (v.includes('block')) return 'blocked';
  return undefined;
}
