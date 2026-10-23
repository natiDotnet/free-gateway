'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Top navigation bar: page title/breadcrumb derived from the pathname plus
 * a global search (⌘K) against authorized record types.
 */
const TITLES: Array<{ panel: string; match: (path: string) => boolean }> = [
  { panel: 'Overview', match: (p) => p === '/' },
  { panel: 'Payments', match: (p) => p.startsWith('/payments') },
  { panel: 'Analytics', match: (p) => p.startsWith('/analytics') },
  { panel: 'Request logs', match: (p) => p.startsWith('/logs') },
  { panel: 'Webhooks', match: (p) => p.startsWith('/webhooks') },
  { panel: 'Audit trail', match: (p) => p.startsWith('/audit') },
  { panel: 'API keys', match: (p) => p.startsWith('/keys') },
  { panel: 'Users & roles', match: (p) => p.startsWith('/users') },
  { panel: 'System health', match: (p) => p.startsWith('/health') },
  { panel: 'My account', match: (p) => p.startsWith('/account') },
];

interface SearchResults {
  payments: Array<{ id: string; merchantReference: string; status: string; amount: number; currency: string; customerName: string | null }>;
  users: Array<{ id: string; email: string; name: string; role: string }>;
  apiKeys: Array<{ id: string; name: string; prefix: string; status: string }>;
  requests: Array<{ id: string; correlationId: string; path: string; method: string; statusCode: number; createdAt: string }>;
}

const EMPTY: SearchResults = { payments: [], users: [], apiKeys: [], requests: [] };

export default function DashboardTopbar() {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ⌘K / Ctrl+K focuses search.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults(EMPTY);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
          headers: { 'x-requested-with': 'fetch' },
        });
        const body = await response.json().catch(() => null);
        if (response.ok && body?.data) {
          setResults(body.data);
          setOpen(true);
        } else {
          setOpen(false);
        }
      } catch {
        /* aborted or network error — keep previous state */
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const title = TITLES.find((entry) => entry.match(pathname))?.panel ?? 'Dashboard';
  const hasResults =
    results.payments.length + results.users.length + results.apiKeys.length + results.requests.length > 0;

  return (
    <header className="sticky top-0 z-20 border-b border-gray-border bg-white/90 backdrop-blur">
      <div className="flex w-full items-center gap-4 px-5 py-3 md:px-6">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">
          <span className="text-gray-secondary">Admin console / </span>
          {title}
        </p>
        <div ref={boxRef} className="relative w-full max-w-sm">
          <label className="sr-only" htmlFor="global-search">
            Global search
          </label>
          <input
            id="global-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => query.trim().length >= 2 && setOpen(true)}
            placeholder="Search references, IDs, emails…"
            autoComplete="off"
            className="field-sm w-full bg-gray-background-alt"
          />
          <kbd className="border-gray-border text-gray-secondary pointer-events-none absolute right-2 top-1.5 hidden rounded border bg-white px-1.5 text-[10px] font-medium sm:block">
            ⌘K
          </kbd>

          {open && (query.trim().length >= 2) && (
            <div
              role="dialog"
              aria-label="Search results"
              className="border-gray-border absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-xl border bg-white shadow-elevated"
            >
              {searching && !hasResults && (
                <p className="text-gray-secondary px-4 py-3 text-sm">Searching…</p>
              )}
              {hasResults ? (
                <div className="divide-y divide-gray-border/50">
                  <ResultGroup title="Payments" count={results.payments.length}>
                    {results.payments.map((payment) => (
                      <Link
                        key={payment.id}
                        href={`/payments/${encodeURIComponent(payment.merchantReference)}`}
                        onClick={() => setOpen(false)}
                        className="hover:bg-gray-background-alt block px-4 py-2 text-sm"
                      >
                        <span className="font-mono text-xs font-semibold text-primary">
                          {payment.merchantReference}
                        </span>
                        <span className="text-gray-secondary ml-2 text-xs">
                          {payment.currency} {payment.amount} · {payment.status}
                        </span>
                      </Link>
                    ))}
                  </ResultGroup>
                  <ResultGroup title="Request logs" count={results.requests.length}>
                    {results.requests.map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/logs/${entry.id}`}
                        onClick={() => setOpen(false)}
                        className="hover:bg-gray-background-alt block px-4 py-2 text-sm"
                      >
                        <span className="font-mono text-xs">{entry.method}</span>{' '}
                        <span className="text-gray-primary">{entry.path}</span>{' '}
                        <span className="text-gray-secondary text-xs">· {entry.statusCode}</span>
                      </Link>
                    ))}
                  </ResultGroup>
                  <ResultGroup title="API keys" count={results.apiKeys.length}>
                    {results.apiKeys.map((key) => (
                      <Link
                        key={key.id}
                        href="/keys"
                        onClick={() => setOpen(false)}
                        className="hover:bg-gray-background-alt block px-4 py-2 text-sm"
                      >
                        <span className="font-mono text-xs">{key.prefix}</span>{' '}
                        <span className="text-gray-primary">{key.name}</span>
                      </Link>
                    ))}
                  </ResultGroup>
                  <ResultGroup title="Staff" count={results.users.length}>
                    {results.users.map((user) => (
                      <Link
                        key={user.id}
                        href="/users"
                        onClick={() => setOpen(false)}
                        className="hover:bg-gray-background-alt block px-4 py-2 text-sm"
                      >
                        {user.email}{' '}
                        <span className="text-gray-secondary text-xs">· {user.name}</span>
                      </Link>
                    ))}
                  </ResultGroup>
                </div>
              ) : (
                !searching && <p className="text-gray-secondary px-4 py-3 text-sm">No matches.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ResultGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-secondary">
        {title}
      </p>
      {children}
    </div>
  );
}