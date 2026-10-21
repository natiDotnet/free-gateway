'use client';

import { useEffect, useState } from 'react';

interface FormValues {
  amount: string;
  currency: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  merchantReference: string;
}

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'ETB', label: 'Ethiopian Birr (ETB)' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { code: 'DJF', label: 'Djiboutian Franc (DJF)' },
] as const;

export default function Home() {
  const [values, setValues] = useState<FormValues>({
    amount: '500',
    currency: 'USD',
    firstName: 'Abebe',
    lastName: 'Bikila',
    email: 'abebebikila@example.com',
    phoneNumber: '+251960724272',
    merchantReference: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const handleChange = (
    key: keyof FormValues,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setValues({ ...values, [key]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/payments/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: values.amount,
          currency: values.currency,
          customer: {
            first_name: values.firstName,
            name: `${values.firstName} ${values.lastName}`,
            email: values.email,
            phone_number: values.phoneNumber || undefined,
            phone: values.phoneNumber || undefined,
          },
          merchant_reference: values.merchantReference,
          meta: {
            order_id: values.merchantReference,
            notes: 'Gateway-hosted payment',
          },
          return_url: `${window.location.origin}/success`,
          cancel_url: `${window.location.origin}/cancel`,
          notification_url: `${window.location.origin}/api/webhooks/chapa`,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.message || 'Failed to initialize payment');
      }

      setCheckoutUrl(body.data?.checkout_url ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Redirect customer to hosted checkout once initialized.
  useEffect(() => {
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  }, [checkoutUrl]);

  return (
    <div className="container">
      <header>
        <h1>Payment Gateway — Checkout</h1>
        <p>
          Initialize a payment (Chapa-style payload) and redirect the customer
          to the hosted checkout page.
        </p>
      </header>

      {checkoutUrl && (
        <section className="card">
          <h2>Payment initialized</h2>
          <p><strong>Reference:</strong> {values.merchantReference}</p>
          <p><strong>Amount:</strong> {values.amount} {values.currency}</p>
          <p>
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="button">
              Open hosted checkout
            </a>
          </p>
          <p className="hint">
            You will be redirected automatically. The hosted checkout page is
            served by this gateway at <code>{'/payment/{reference}'}</code>.
          </p>
        </section>
      )}

      <form onSubmit={handleSubmit} className="card">
        <h2>Collect payment details</h2>
        {error && <p className="error">{error}</p>}
        <div className="grid">
          <div className="field">
            <label>Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={values.amount}
              onChange={(e) => handleChange('amount', e)}
            />
          </div>
          <div className="field">
            <label>Currency</label>
            <select
              required
              value={values.currency}
              onChange={(e) => handleChange('currency', e)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Merchant reference</label>
            <input
              required
              value={values.merchantReference}
              onChange={(e) => handleChange('merchantReference', e)}
              placeholder="e.g. ORD-99887"
            />
            <p className="hint">Must be unique per order/attempt.</p>
          </div>
        </div>
        <h3>Customer information</h3>
        <div className="grid">
          <div className="field">
            <label>First name</label>
            <input
              required
              value={values.firstName}
              onChange={(e) => handleChange('firstName', e)}
            />
          </div>
          <div className="field">
            <label>Last name</label>
            <input
              required
              value={values.lastName}
              onChange={(e) => handleChange('lastName', e)}
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={values.email}
              onChange={(e) => handleChange('email', e)}
            />
          </div>
          <div className="field">
            <label>Phone (international format)</label>
            <input
              type="tel"
              value={values.phoneNumber}
              onChange={(e) => handleChange('phoneNumber', e)}
              placeholder="+251960724272"
            />
            <p className="hint">
              Required for high-risk businesses and some payment methods.
            </p>
          </div>
        </div>
        <button type="submit" disabled={loading} className="button">
          {loading ? 'Initializing payment…' : 'Initialize payment'}
        </button>
      </form>

      <section className="card">
        <h2>Flow</h2>
        <ol>
          <li>Submit amount, currency &amp; customer details.</li>
          <li>
            Gateway stores the payment (<code>status = pending</code>) and
            returns a <code>checkout_url</code>.
          </li>
          <li>Customer is redirected to <code>{'/payment/{reference}'}</code>.</li>
          <li>Provider webhook updates status (source of truth).</li>
          <li>
            <strong>Verify server-side</strong> at{' '}
            <code>{'/api/payments/{reference}/verify'}</code> before delivering
            value.
          </li>
        </ol>
      </section>
    </div>
  );
}
