import { notFound } from 'next/navigation';
import { getPaymentByMerchantReference } from '@org/db';
import PaymentClient from './_checkout-client';

/**
 * Hosted checkout page owned by the gateway.
 * The customer selects a payment method, submits, and the page awaits the
 * provider webhook (source of truth) before redirecting to success/cancel.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = getPaymentByMerchantReference(id);
  if (!payment) return notFound();

  const simulate =
    process.env.GATEWAY_SIMULATE_PROVIDERS === 'true';

  return (
    <PaymentClient
      payment={{
        merchantReference: payment.merchantReference,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        providerReference: payment.providerReference,
        customerName: payment.customerName,
      }}
      simulate={simulate}
    />
  );
}
