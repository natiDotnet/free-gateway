'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { API_KEYS_SUPPORTED_SCOPES } from '@/lib/api-keys-contract';

/**
 * Guided API-key creation with a one-time secret reveal.
 *
 * State rules:
 * - The plaintext secret lives in this component only, cleared on dialog
 *   close or navigation, and is never stored anywhere else.
 * - The "secret cannot be viewed again" acknowledgement is required before
 *   the dialog can be dismissed... with a warning if skipped.
 */

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  fingerprint: string;
  scopes: string[];
  status: string;
  createdByEmail: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  rotatedFromId: string | null;
}

interface Props {
  keys: ApiKeyRow[];
}

const input =
  'field';
export default function ApiKeyManager({ keys }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['payments.init']);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // One-time reveal state.
  const [reveal, setReveal] = useState<{ prefix: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function call(path: string, payload: Record<string, unknown>, successMessage: string) {
    setError(null);
    setOkMessage(null);
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? `Request failed (${response.status})`);
        return null;
      }
      if (successMessage) setOkMessage(successMessage);
      router.refresh();
      return body;
    } catch {
      setError('Network error — try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const created = await call(
      '/api/admin/keys',
      {
        name: name.trim(),
        scopes: selectedScopes,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
      },
      ''
    );
    if (created) {
      setName('');
      setExpiresAt('');
      setShowCreate(false);
      setReveal({ prefix: created.data.key.prefix, secret: created.data.secret });
      setCopied(false);
    }
  }

  function closeReveal() {
    setReveal(null);
    // Drop the secret from memory immediately.
    setTimeout(() => setReveal(null), 0);
  }

  function copySecret() {
    if (!reveal) return;
    navigator.clipboard
      .writeText(reveal.secret)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  async function rotate(key: ApiKeyRow) {
    if (
      !window.confirm(
        `Rotate "${key.name}" (${key.prefix})?\n\nThe current secret stops working immediately and a NEW secret is created. Merchants must switch to the new secret.`
      )
    ) {
      return;
    }
    const rotated = await call(`/api/admin/keys/${key.id}`, { action: 'rotate' }, '');
    if (rotated?.data?.secret) {
      setReveal({ prefix: rotated.data.key.prefix, secret: rotated.data.secret });
      setCopied(false);
    }
  }

  async function revoke(key: ApiKeyRow) {
    if (
      !window.confirm(
        `Revoke "${key.name}" (${key.prefix})?\n\nAny merchant using this key will immediately lose access. This cannot be undone.`
      )
    ) {
      return;
    }
    await call(
      `/api/admin/keys/${key.id}`,
      { action: 'revoke' },
      `${key.prefix} revoked. Authentication with this key now fails.`
    );
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-lg border border-badge-failed bg-badge-failed px-4 py-2.5 text-sm text-badge-failed-foreground">
          {error}
        </div>
      )}
      {okMessage && (
        <div role="status" className="rounded-lg border border-badge-success bg-badge-success px-4 py-2.5 text-sm text-badge-success-foreground">
          {okMessage}
        </div>
      )}

      <section className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Credentials ({keys.length})</h2>
            <p className="text-xs text-gray-secondary">
              Secrets are stored as SHA-256 hashes. Full secrets are never shown again after issuance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            aria-expanded={showCreate}
            className="btn btn-primary"
          >
            {showCreate ? 'Close' : 'Create API key'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-gray-border bg-gray-background-alt/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-primary">Key name</span>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Shopify storefront"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-primary">
                  Expiration (optional)
                </span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className={input}
                />
              </label>
            </div>
            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-gray-primary">Scopes</legend>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {API_KEYS_SUPPORTED_SCOPES.map((scope) => (
                  <label key={scope.id} className="flex items-start gap-2 text-sm text-gray-primary">
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope.id)}
                      onChange={() => toggleScope(scope.id)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-border text-primary"
                    />
                    <span>
                      <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs">
                        {scope.id}
                      </code>{' '}
                      — {scope.description}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-secondary">
                Scope enforcement is active when the gateway runs with{' '}
                <code className="font-mono">GATEWAY_API_KEYS_REQUIRED=true</code>. The gateway
                currently supports the single scope shown above.
              </p>
            </fieldset>
            <button
              type="submit"
              disabled={busy || selectedScopes.length === 0}
              className="mt-4 btn btn-primary"
            >
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </form>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-gray-secondary">
            No API keys yet. Create one to let merchant backends authenticate against
            <code className="ml-1 rounded bg-gray-background-alt px-1 font-mono text-xs">POST /api/payments/init</code>
            when the gateway runs with API keys enforced.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Key', 'Scopes', 'Status', 'Created', 'Last used', 'Expires', 'Actions'].map(
                    (label, index) => (
                      <th
                        key={label}
                        className={`bg-gray-background-alt border-b border-gray-border px-3 py-3 text-xs font-semibold text-gray-primary border-l border-gray-border first:border-l-0 ${index === 6 ? 'text-right' : 'text-left'}`}
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className={key.status === 'revoked' ? 'opacity-60' : ''}>
                    <td className="border-b border-gray-border px-3 py-3">
                      <strong className="block font-medium">{key.name}</strong>
                      <code className="font-mono text-xs text-gray-secondary">{key.prefix}</code>
                      <span className="ml-1 font-mono text-[10px] text-gray-secondary">
                        ····{key.fingerprint}
                      </span>
                      {key.rotatedFromId && (
                        <span className="ml-1 rounded bg-badge-partial-refund px-1 text-[10px] text-badge-partial-refund-foreground">
                          rotated
                        </span>
                      )}
                    </td>
                    <td className="border-b border-gray-border px-3 py-3">
                      {key.scopes.map((scope) => (
                        <code
                          key={scope}
                          className="mr-1 rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-[11px] text-gray-primary"
                        >
                          {scope}
                        </code>
                      ))}
                    </td>
                    <td className="border-b border-gray-border px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                          key.status === 'active'
                            ? 'bg-badge-success text-badge-success-foreground'
                            : 'bg-badge-failed text-badge-failed-foreground'
                        }`}
                      >
                        {key.status === 'active' ? '● active' : '✕ revoked'}
                      </span>
                      {key.revokedBy && (
                        <span className="block text-[10px] text-gray-secondary">
                          by {key.revokedBy}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-border px-3 py-3 text-xs tabular-nums text-gray-secondary">
                      {new Date(key.createdAt).toLocaleDateString()}{' '}
                      <span className="text-gray-secondary/50">· {key.createdByEmail ?? 'system'}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-border px-3 py-3 text-xs tabular-nums text-gray-secondary">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'never'}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-border px-3 py-3 text-xs tabular-nums text-gray-secondary">
                      {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-border px-3 py-3 text-right">
                      {key.status === 'active' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => rotate(key)}
                            disabled={busy}
                            className={`btn btn-primary btn-xs`}
                          >
                            Rotate
                          </button>
                          <button
                            type="button"
                            onClick={() => revoke(key)}
                            disabled={busy}
                            className={`btn btn-danger btn-xs`}
                          >
                            Revoke
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-secondary">
                          revoked{' '}
                          {key.revokedAt ? new Date(key.revokedAt).toLocaleDateString() : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* One-time secret reveal */}
      {reveal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reveal-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-secondary/60 p-4"
        >
          <div className="w-full max-w-lg card p-6 shadow-xl">
            <h2 id="reveal-title" className="text-base font-semibold">
              Save the API secret now
            </h2>
            <p className="mt-1 text-sm text-gray-primary">
              This is the only time the full secret is shown. It is stored only as a
              SHA-256 hash — copy it to your secret manager now.
            </p>
            <div className="mt-4 rounded-xl border border-primary/30 bg-secondary p-3">
              <code className="block font-mono text-xs text-primary">{reveal.secret}</code>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={copySecret}
                className="btn btn-primary"
              >
                {copied ? 'Copied ✓' : 'Copy secret'}
              </button>
              <button
                type="button"
                onClick={closeReveal}
                className="btn btn-secondary"
              >
                I saved it — close
              </button>
            </div>
            <p className="mt-3 text-[11px] text-gray-secondary">
              After closing this dialog the secret cannot be recovered — only rotated.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}