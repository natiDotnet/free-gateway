'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OPEN_STATUSES } from '@/lib/ui';

interface Props {
  reference: string;
  status: string;
  canVerify: boolean;
  canCancel: boolean;
}

export default function PaymentActions({
  reference,
  status,
  canVerify,
  canCancel,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'verify' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canVerify && !canCancel) return null;
  if (!OPEN_STATUSES.includes(status)) return null;

  async function send(action: 'verify' | 'cancel') {
    if (
      action === 'cancel' &&
      !window.confirm(
        `Cancel payment ${reference}? It cannot be reinstated afterwards.`
      )
    ) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/payments/${encodeURIComponent(reference)}/${action}`,
        { method: 'POST', headers: { 'x-requested-with': 'fetch' } }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? `${action} failed (${response.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      {error && (
        <div className="rounded-lg border border-badge-failed bg-badge-failed px-3 py-2 text-xs text-badge-failed-foreground">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        {canVerify && (
          <button
            onClick={() => send('verify')}
            disabled={busy !== null}
            className="btn btn-primary"
          >
            {busy === 'verify' ? 'Verifying…' : 'Verify now'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => send('cancel')}
            disabled={busy !== null}
            className="btn btn-danger"
          >
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel payment'}
          </button>
        )}
      </div>
    </div>
  );
}