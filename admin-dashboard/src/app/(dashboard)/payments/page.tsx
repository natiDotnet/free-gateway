import Link from 'next/link';
import Pagination from '../_pagination';
import {
  can,
  countPaymentsByStatus,
  listDistinctCurrencies,
  listDistinctPaymentProviders,
  listPaymentsPage,
  PAYMENT_STATUSES,
  type PaymentFilters,
  type PaymentStatus,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import {
  OPEN_STATUSES,
  formatDateTime,
  formatDecimal,
  formatInt,
  statusBadge,
} from '@/lib/ui';

export const dynamic = 'force-dynamic';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 20;

type Query = {
  q?: string;
  status?: string;
  provider?: string;
  currency?: string;
  from?: string;
  to?: string;
  page?: string;
  perPage?: string;
  saved?: string;
  error?: string;
};

type Props = { searchParams: Promise<Query> };

const ISO_STATUSES = PAYMENT_STATUSES as readonly string[];

export default async function PaymentsPage({ searchParams }: Props) {
  const admin = await requirePagePermission('payments.list');
  const params = await searchParams;

  const q = (params.q ?? '').trim();
  const statusFilter = ISO_STATUSES.includes(params.status ?? '') ? params.status! : '';
  const providerFilter = (params.provider ?? '').trim();
  const currencyFilter = (params.currency ?? '').trim();
  const fromDay = ISO_DAY.test(params.from ?? '') ? params.from!.slice(0, 10) : '';
  const toDay = ISO_DAY.test(params.to ?? '') ? params.to!.slice(0, 10) : '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const parsedPerPage = Number.parseInt(params.perPage ?? '', 10);
  const perPage = [10, 20, 50].includes(parsedPerPage) ? parsedPerPage : PAGE_SIZE;
  const hasFilters = Boolean(
    q || statusFilter || providerFilter || currencyFilter || fromDay || toDay
  );

  const filters: PaymentFilters = {
    q: q || undefined,
    status: statusFilter ? (statusFilter as PaymentStatus) : undefined,
    provider: providerFilter || undefined,
    currency: currencyFilter || undefined,
    fromDay: fromDay || undefined,
    toDay: toDay || undefined,
  };

  const [result, statusCounts, providers, currencies] = await Promise.all([
    listPaymentsPage(filters, page, perPage),
    countPaymentsByStatus(),
    listDistinctPaymentProviders(),
    listDistinctCurrencies(),
  ]);

  const canVerify = can(admin.role, 'payments.verify');
  const canCancel = can(admin.role, 'payments.cancel');
  const canExport = can(admin.role, 'reports.export');
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const exportQuery = new URLSearchParams();
  if (q) exportQuery.set('q', q);
  if (statusFilter) exportQuery.set('status', statusFilter);
  if (providerFilter) exportQuery.set('provider', providerFilter);
  if (currencyFilter) exportQuery.set('currency', currencyFilter);
  if (fromDay) exportQuery.set('from', fromDay);
  if (toDay) exportQuery.set('to', toDay);
  const exportHref = `/api/admin/payments/export${exportQuery.size ? `?${exportQuery}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 tracking-tight">Payments</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Transactions processed by the gateway across all providers. Webhooks
            are the source of truth — use <strong>Verify</strong> for a
            server-side re-check before fulfilling value.
          </p>
        </div>
        {canExport && (
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 btn btn-secondary"
          >
            Export CSV<span aria-hidden>↓</span>
          </a>
        )}
      </header>

      {params.saved === 'verified' && (
        <div role="status" className="rounded-lg border border-badge-success bg-badge-success px-4 py-2.5 text-sm text-badge-success-foreground">
          Payment re-verified server-side. The authoritative status was recorded in the event timeline.
        </div>
      )}
      {params.saved === 'cancelled' && (
        <div role="status" className="rounded-lg border border-badge-success bg-badge-success px-4 py-2.5 text-sm text-badge-success-foreground">
          Payment cancelled. The merchant notification (if configured) was attempted and logged.
        </div>
      )}
      {params.error === 'not_cancellable' && (
        <div role="alert" className="rounded-lg border border-badge-failed bg-badge-failed px-4 py-2.5 text-sm text-badge-failed-foreground">
          That payment has reached a final status and can no longer be cancelled.
        </div>
      )}

      <form
        method="GET"
        action="/payments"
        className="flex flex-wrap items-end gap-3 card p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Search
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Reference, customer, phone, provider ref…"
            className="field w-64"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Status
          <select
            name="status"
            defaultValue={statusFilter}
            className="field select min-w-32"
          >
            <option value="">All statuses</option>
            {ISO_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Provider
          <select
            name="provider"
            defaultValue={providerFilter}
            className="field select min-w-32"
          >
            <option value="">All providers</option>
            {providers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Currency
          <select
            name="currency"
            defaultValue={currencyFilter}
            className="field select min-w-24"
          >
            <option value="">All</option>
            {currencies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Created from
          <input
            type="date"
            name="from"
            defaultValue={fromDay}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          to
          <input
            type="date"
            name="to"
            defaultValue={toDay}
            className="field"
          />
        </label>
        <div className="ms-auto flex items-end gap-2">
          {hasFilters && (
            <Link href="/payments" className="btn btn-secondary btn-sm">
              Clear
            </Link>
          )}
          <button type="submit" className="btn btn-primary">
            Apply filters
          </button>
        </div>
      </form>

      <section aria-label="Payment status totals" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Tile label="Total" value={Object.values(statusCounts).reduce((sum, count) => sum + count, 0)} tone="text-secondary" />
        <Tile label="Successful" value={statusCounts.success} tone="text-badge-success-foreground" />
        <Tile label="Pending" value={statusCounts.pending} tone="text-badge-pending-foreground" />
        <Tile label="Awaiting auth" value={statusCounts.auth_needed} tone="text-badge-partial-refund-foreground" />
        <Tile label="Failed" value={statusCounts.failed} tone="text-badge-failed-foreground" />
        <Tile label="Cancelled" value={statusCounts.cancelled} tone="text-badge-failed-foreground" />
        <Tile label="Blocked" value={statusCounts.blocked} tone="text-badge-blocked-foreground" />
      </section>

      <section className="overflow-hidden card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-border px-5 py-4">
          <h2 className="text-base font-semibold">
            {formatInt(result.total)} transaction{result.total === 1 ? '' : 's'}{' '}
            {hasFilters && <span className="text-xs font-normal text-gray-secondary">matching filters</span>}
          </h2>
          <p className="text-xs text-gray-secondary">
            {result.rows.length === 0
              ? 'No transactions to show'
              : `Page ${result.page} of ${totalPages}`}
          </p>
        </div>

        {result.rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-secondary">
            No transactions match these filters. Initialize one from the checkout
            app (<code className="rounded bg-gray-background-alt px-1 font-mono text-xs">POST /api/payments/init</code>)
            or clear the filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-gray-background-alt">
                <tr>
                  {['Reference', 'Amount', 'Status', 'Customer', 'Provider / ref', 'Created', 'Actions'].map(
                    (label, index) => (
                      <th
                        key={label}
                        className={`px-4 py-3 text-xs font-semibold text-gray-primary border-l border-gray-border first:border-l-0 ${index === 6 ? 'text-right' : 'text-left'}`}
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-background-alt/70">
                    <td className="border-b border-gray-border px-4 py-3.5">
                      <Link
                        href={`/payments/${encodeURIComponent(payment.merchantReference)}`}
                        className="font-mono text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {payment.merchantReference}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-border px-4 py-3.5 tabular-nums">
                      {formatDecimal(payment.amount)}{' '}
                      <span className="text-xs text-gray-secondary">{payment.currency}</span>
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5">
                      <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${statusBadge(payment.status)}`}>
                        {payment.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="max-w-48 truncate border-b border-gray-border px-4 py-3.5 text-gray-primary">
                      {payment.customerName ?? <span className="text-gray-secondary/50">—</span>}
                      {payment.customerPhone && (
                        <span className="font-mono text-xs text-gray-secondary"> · {payment.customerPhone}</span>
                      )}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 text-right">
                      {payment.providerReference ? (
                        <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs">
                          {payment.providerReference}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-secondary">{payment.provider} · no ref</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-border px-4 py-3.5 text-xs tabular-nums text-gray-secondary">
                      {formatDateTime(payment.createdAt)}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {canVerify && OPEN_STATUSES.includes(payment.status) && (
                          <form
                            method="POST"
                            action={`/api/payments/${encodeURIComponent(payment.merchantReference)}/verify`}
                          >
                            <button
                              type="submit"
                              className="btn btn-primary btn-xs"
                            >
                              Verify
                            </button>
                          </form>
                        )}
                        {canCancel && OPEN_STATUSES.includes(payment.status) && (
                          <form
                            method="POST"
                            action={`/api/payments/${encodeURIComponent(payment.merchantReference)}/cancel`}
                          >
                            <button
                              type="submit"
                              className="btn btn-danger btn-xs"
                            >
                              Cancel
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/payments/${encodeURIComponent(payment.merchantReference)}`}
                          className="text-xs text-gray-secondary underline-offset-2 hover:text-secondary hover:underline"
                        >
                          Detail
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Pagination
        basePath="/payments"
        page={result.page}
        pageCount={totalPages}
        total={result.total}
        pageSize={result.pageSize}
        params={params}
      />
      </section>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-3">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-secondary">
        {label}
      </span>
      <span className={`text-xl font-bold tracking-tight tabular-nums ${tone}`}>
        {formatInt(value)}
      </span>
    </div>
  );
}