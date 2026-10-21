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
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        {canVerify && (
          <button
            onClick={() => send('verify')}
            disabled={busy !== null}
            className="inline-flex items-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-55"
          >
            {busy === 'verify' ? 'Verifying…' : 'Verify now'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => send('cancel')}
            disabled={busy !== null}
            className="inline-flex items-center rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:pointer-events-none disabled:opacity-55"
          >
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel payment'}
          </button>
        )}
      </div>
    </div>
  );
}
