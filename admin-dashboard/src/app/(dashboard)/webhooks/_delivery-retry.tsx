'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Retry button for an outbound webhook delivery. Calls the backend; shows
 * exactly what the backend reports — a failure response stays a failure
 * ("do not fake success").
 */
export default function DeliveryRetryButton({
  deliveryId,
  disabled,
}: {
  deliveryId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/deliveries/${deliveryId}/retry`, {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch' },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ ok: false, text: body?.message ?? `Retry failed (${response.status})` });
      } else {
        setMessage({ ok: Boolean(body?.status === 'success'), text: body?.message ?? 'Attempted' });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={retry}
        disabled={busy || disabled}
        className="whitespace-nowrap btn btn-primary btn-xs"
      >
        {busy ? 'Retrying…' : 'Retry'}
      </button>
      {message && (
        <span className={`max-w-64 text-right text-[10px] ${message.ok ? 'text-badge-success-foreground' : 'text-badge-failed-foreground'}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}