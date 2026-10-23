import Link from 'next/link';
import { listGatewayRequests, type RequestLogFilters, type RequestLogEntry } from '@org/db';
import Pagination from '../_pagination';
import { requirePagePermission } from '@/lib/session';
import {
  formatDateTime,
  methodBadge,
  statusClassBadge,
} from '@/lib/ui';

export const dynamic = 'force-dynamic';

const METHODS = ['GET', 'POST'] as const;

type Props = {
  searchParams: Promise<{
    q?: string;
    class?: string;
    method?: string;
    from?: string;
    to?: string;
    page?: string;
    perPage?: string;
  }>;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function RequestLogsPage({ searchParams }: Props) {
  await requirePagePermission('logs.view');
  const params = await searchParams;

  const statusClass =
    params.class && ['2xx', '4xx', '5xx'].includes(params.class)
      ? (params.class as '2xx' | '4xx' | '5xx')
      : undefined;
  const method = METHODS.includes(params.method as (typeof METHODS)[number])
    ? params.method?.toUpperCase()
    : undefined;
  const q = (params.q ?? '').trim();
  const fromDay = ISO_DAY.test(params.from ?? '') ? params.from : undefined;
  const toDay = ISO_DAY.test(params.to ?? '') ? params.to : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const parsedPerPage = Number.parseInt(params.perPage ?? '', 10);
  const perPage = [10, 20, 50].includes(parsedPerPage) ? parsedPerPage : 50;

  // The search box targets path / correlation id / merchant reference. The
  // server routes it to the most precise filter it can type.
  const filters: RequestLogFilters = {
    statusClass,
    method,
    fromDay,
    toDay,
  };
  if (/^[0-9a-f-]{8,64}$/i.test(q)) {
    filters.correlationId = q;
  } else if (q.startsWith('/')) {
    filters.path = q;
  } else if (q) {
    filters.path = q;
  }

  const { rows, total, pageSize } = await listGatewayRequests(filters, page, perPage);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 tracking-tight">Request logs</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Sanitized gateway API traffic: method, endpoint, status, duration and
            correlation id. Headers, bodies and query values are never recorded;
            authorization secrets and payment credentials are never stored.
          </p>
        </div>
        <p className="text-xs text-gray-secondary">
          {total.toLocaleString()} matching requests · newest first
        </p>
      </header>

      <form
        method="GET"
        action="/logs"
        className="flex flex-wrap items-end gap-3 card p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Search (path, correlation ID, reference)
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="/api/payments/init, REQ-… , ORD-…"
            className="field w-64"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Status class
          <select
            name="class"
            defaultValue={statusClass ?? ''}
            className="field select"
          >
            <option value="">All</option>
            <option value="2xx">2xx succeeded</option>
            <option value="4xx">4xx client errors</option>
            <option value="5xx">5xx server errors</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Method
          <select
            name="method"
            defaultValue={method ?? ''}
            className="field select"
          >
            <option value="">All</option>
            {METHODS.map((methodOption) => (
              <option key={methodOption} value={methodOption}>
                {methodOption}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          From
          <input
            type="date"
            name="from"
            defaultValue={fromDay ?? ''}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          To
          <input
            type="date"
            name="to"
            defaultValue={toDay ?? ''}
            className="field"
          />
        </label>
        <div className="ms-auto flex items-end gap-2">
          <button
            type="submit"
            className="btn btn-primary"
          >
            Apply
          </button>
          {(q || statusClass || method || fromDay || toDay) && (
            <Link href="/logs" className="btn btn-secondary btn-sm">
              Clear
            </Link>
          )}
        </div>
      </form>

      <section className="overflow-hidden card">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-sm text-gray-secondary">
            No request logs match. Gateway traffic starts appearing after the
            checkout API routes receive requests (health probes are not logged).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-background-alt">
                <tr>
                  {['When', 'Request', 'Status', 'Duration', 'IP', 'API key', 'Merchant ref', 'Error'].map(
                    (label, index) => (
                      <th
                        key={label}
                        className={`px-4 py-3 text-xs font-semibold text-gray-primary border-l border-gray-border first:border-l-0 ${index === 7 ? 'text-right' : 'text-left'}`}
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          basePath="/logs"
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          params={params}
          perPageOptions={[10, 20, 50]}
          defaultPerPage={50}
        />
      </section>

      <p className="text-xs text-gray-secondary">
        Retention: request logs are append-only. A data-retention policy (automatic pruning of
        old rows) is not implemented by the current backend — plan database maintenance
        accordingly.
      </p>
    </div>
  );
}

function LogRow({ entry }: { entry: RequestLogEntry }) {
  return (
    <tr className="align-middle hover:bg-gray-background-alt/70">
      <td className="whitespace-nowrap border-b border-gray-border px-4 py-3.5 text-xs tabular-nums text-gray-secondary">
        {formatDateTime(entry.createdAt)}
      </td>
      <td className="border-b border-gray-border px-4 py-3.5">
        <Link href={`/logs/${entry.id}`} className="group flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${methodBadge(entry.method)}`}>
            {entry.method}
          </span>
          <span className="truncate font-mono text-xs text-gray-primary group-hover:text-primary group-hover:underline">
            {entry.path}
          </span>
        </Link>
      </td>
      <td className="border-b border-gray-border px-4 py-3.5">
        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold tabular-nums ${statusClassBadge(entry.statusCode)}`}>
          {entry.statusCode}
        </span>
      </td>
      <td className="whitespace-nowrap border-b border-gray-border px-4 py-3.5 text-xs tabular-nums text-gray-primary">
        {entry.durationMs} ms
      </td>
      <td className="border-b border-gray-border px-4 py-3.5 font-mono text-xs text-gray-secondary">
        {entry.ip ?? '—'}
      </td>
      <td className="border-b border-gray-border px-4 py-3.5 font-mono text-xs text-gray-secondary">
        {entry.apiKeyPrefix ?? '—'}
      </td>
      <td className="border-b border-gray-border px-4 py-3.5 font-mono text-xs text-gray-secondary">
        {entry.merchantReference ? (
          <Link
            href={`/payments/${encodeURIComponent(entry.merchantReference)}`}
            className="text-primary hover:underline"
          >
            {entry.merchantReference}
          </Link>
        ) : (
          '—'
        )}
      </td>
      <td className="border-b border-gray-border px-4 py-3.5 text-right text-xs text-gray-secondary">
        {entry.errorCode ?? '—'}
      </td>
    </tr>
  );
}