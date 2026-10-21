'use client';

import { useState } from 'react';

const input =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/60';

export default function PasswordChangeForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setOkMessage(null);

    if (next !== confirm) {
      setError('The new password and confirmation do not match.');
      return;
    }
    if (next.length < 10) {
      setError('Passwords are at least 10 characters.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch',
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          body?.message ??
            (response.status === 400
              ? 'Current password is incorrect.'
              : 'Password change failed.')
        );
        return;
      }
      setOkMessage('Password updated — all other sessions were signed out.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-900">
          {error}
        </div>
      )}
      {okMessage && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
          {okMessage}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">
          Current password
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">
          New password (min 10 chars)
        </span>
        <input
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">
          Confirm new password
        </span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={input}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-1 inline-flex w-fit items-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-55"
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
