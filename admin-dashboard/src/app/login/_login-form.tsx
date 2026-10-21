'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch',
        },
        body: JSON.stringify({
          email,
          password,
          next: searchParams.get('next') ?? undefined,
        }),
      });

      const body = await response.json().catch(() => null);

      if (response.ok) {
        const redirectTo =
          typeof body?.data?.redirectTo === 'string'
            ? body.data.redirectTo
            : '/payments';
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      if (response.status === 429) {
        const retryAfter = body?.data?.retryAfterSeconds ?? 60;
        setError(
          `Too many failed attempts. Try again in ${Math.ceil(
            Number(retryAfter) / 60
          )} minute(s).`
        );
      } else {
        setError(body?.message ?? 'Sign in failed. Check your credentials.');
      }
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-900">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@freegateway.local"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Password</span>
        <div className="flex items-center gap-2">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-1 inline-flex w-full items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-55"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
