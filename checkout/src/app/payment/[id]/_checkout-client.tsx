'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Method = 'telebirr' | 'chapa' | 'card';

interface PaymentClientProps {
  payment: {
    merchantReference: string;
    amount: number;
    currency: string;
    status: string;
    providerReference: string | null;
    customerName: string | null;
  };
  /** Demo mode: server auto-dispatches the provider webhook after submit. */
  simulate: boolean;
}

const METHODS: {
  id: Method;
  label: string;
  hint: string;
  provider: string;
}[] = [
  {
    id: 'telebirr',
    label: 'Telebirr',
    hint: 'Mobile money — confirm on your phone',
    provider: 'telebirr',
  },
  {
    id: 'chapa',
    label: 'Chapa',
    hint: 'Card / mobile wallet via Chapa',
    provider: 'chapa',
  },
  {
    id: 'card',
    label: 'Card',
    hint: 'Visa / Mastercard (demo)',
    provider: 'chapa',
  },
];

export default function PaymentClient({ payment, simulate }: PaymentClientProps) {
  const [method, setMethod] = useState<Method>('telebirr');
  const [phone, setPhone] = useState('+251');
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<'form' | 'awaiting'>(
    payment.status === 'pending' || payment.status === 'auth_needed'
      ? payment.status === 'auth_needed'
        ? 'awaiting'
        : 'form'
      : 'form'
  );
  const [liveStatus, setLiveStatus] = useState(payment.status);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  /* -------------------------------------------------------------- */
  /* Poll verify until the provider webhook flips the status         */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (phase !== 'awaiting') return;

    const stop = () => {
      if (interval) window.clearInterval(interval);
      interval = null;
    };

    const reference = encodeURIComponent(payment.merchantReference);
    const target = `/api/payments/${reference}/verify`;

    let interval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelRef.current) return stop();
      try {
        const res = await fetch(target, { cache: 'no-store' });
        const body = await res.json();
        const status: string | undefined = body?.data?.status;
        if (!status) return;
        setLiveStatus(status);
        if (status === 'success') {
          stop();
          window.location.href = `/success?reference=${reference}`;
        }
        if (status === 'failed' || status === 'cancelled') {
          stop();
          window.location.href = `/cancel?reference=${reference}`;
        }
        // Stop polling after 2 minutes; webhooks are the source of truth.
        if (Date.now() - startedAt > 120_000) {
          stop();
          setLiveStatus('timeout — polling stopped, refresh to retry');
        }
      } catch {
        /* transient network error — keep polling */
      }
    };

    poll();
    interval = setInterval(poll, 1500);
    return stop;
  }, [phase, payment.merchantReference]);

  /* -------------------------------------------------------------- */
  /* Handlers                                                        */
  /* -------------------------------------------------------------- */

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    let providerDetails: Record<string, unknown>;
    if (method === 'telebirr') {
      if (!/^\+\d{10,15}$/.test(phone.trim())) {
        setError('Telebirr requires an international phone number, e.g. +251960724272');
        setSubmitting(false);
        return;
      }
      providerDetails = { phone: phone.trim() };
    } else if (method === 'card') {
      const digits = card.replace(/\D/g, '');
      if (digits.length < 12) {
        setError('Enter a valid card number');
        setSubmitting(false);
        return;
      }
      providerDetails = { last4: digits.slice(-4), expiry };
    } else {
      providerDetails = {};
    }

    try {
      const res = await fetch(
        `/api/payments/${encodeURIComponent(payment.merchantReference)}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, ...providerDetails }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message || 'Could not submit payment');
      }

      setLiveStatus(body.data?.paymentStatus ?? 'auth_needed');
      setPhase('awaiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [method, phone, card, expiry, payment.merchantReference]);

  const handleCancel = useCallback(async () => {
    setSubmitting(true);
    try {
      cancelRef.current = true;
      await fetch(
        `/api/payments/${encodeURIComponent(payment.merchantReference)}/cancel`,
        { method: 'POST' }
      );
    } finally {
      window.location.href = `/cancel?reference=${encodeURIComponent(
        payment.merchantReference
      )}`;
    }
  }, [payment.merchantReference]);

  const reference = encodeURIComponent(payment.merchantReference);
  const selectedMethod = METHODS.find((m) => m.id === method);
  const busy = liveStatus === 'auth_needed' || phase === 'awaiting';

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  return (
    <div className="container">
      <div className="card">
        <div className="checkout-header">
          <div>
            <h1>Free Gateway — Hosted Checkout</h1>
            <p className="hint">
              Reference <code>{payment.merchantReference}</code>
              {payment.customerName ? ` · ${payment.customerName}` : ''}
            </p>
          </div>
          <div className="amount-box">
            <span className="amount">{payment.amount}</span>
            <span className="currency">{payment.currency}</span>
          </div>
        </div>

        {liveStatus === 'auth_needed' && (
          <div className="banner awaiting">
            <span className="spinner" />
            Awaiting <strong>{selectedMethod?.label ?? 'provider'}</strong>{' '}
            confirmation… the provider webhook is the source of truth.
          </div>
        )}
        {liveStatus === 'timeout — polling stopped, refresh to retry' && (
          <div className="banner waiting">
            Still awaiting the provider webhook. Refresh to check again.
          </div>
        )}
        {simulate && (
          <p className="hint">
            Demo mode: after submit, the gateway dispatches a simulated provider
            webhook automatically.
          </p>
        )}

        {liveStatus === 'success' ? (
          <>
            <p className="banner success">
              ✅ Payment verified — value has been delivered.
            </p>
            <a href={`/success?reference=${reference}`} className="button">
              Go to success page
            </a>
          </>
        ) : liveStatus === 'pending' || liveStatus === 'auth_needed' ? (
          <>
            <h2>Payment method</h2>
            <div className="method-grid">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`method ${method === m.id ? 'selected' : ''}`}
                  onClick={() => {
                    if (!busy) {
                      setMethod(m.id);
                      setError(null);
                    }
                  }}
                  disabled={busy}
                >
                  <span className="method-label">{m.label}</span>
                  <span className="method-hint">{m.hint}</span>
                </button>
              ))}
            </div>

            <div className="method-form">
              {method === 'telebirr' && (
                <div className="field">
                  <label>Telebirr phone (international format)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251960724272"
                    disabled={busy}
                  />
                </div>
              )}
              {method === 'card' && (
                <>
                  <div className="field">
                    <label>Card number</label>
                    <input
                      value={card}
                      onChange={(e) => setCard(e.target.value)}
                      placeholder="4242 4242 4242 4242"
                      disabled={busy}
                    />
                    <p className="hint">Demo only — only the last 4 digits are stored.</p>
                  </div>
                  <div className="field">
                    <label>Expiry (MM/YY)</label>
                    <input
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      placeholder="12/26"
                      disabled={busy}
                    />
                  </div>
                </>
              )}
              {method === 'chapa' && (
                <p className="hint">
                  Continue with Chapa — the provider confirmation arrives via
                  its webhook.
                </p>
              )}
            </div>

            {error && <p className="error">{error}</p>}

            <div className="checkout-actions">
              <button onClick={submit} disabled={submitting || busy} className="button">
                {submitting
                  ? 'Submitting…'
                  : `Pay ${payment.amount} ${payment.currency} with ${selectedMethod?.label ?? ''}`}
              </button>
              <button
                onClick={handleCancel}
                className="button secondary"
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
            <p className="hint">
              After submission the provider confirms asynchronously via
              webhook: <code>{'POST /api/webhooks/{provider}'}</code>
            </p>
          </>
        ) : (
          <>
            <p className="banner failed">
              ❌ Payment {liveStatus}. No value was delivered.
            </p>
            <a href="/" className="button">
              Back to merchant
            </a>
          </>
        )}
      </div>
    </div>
  );
}
