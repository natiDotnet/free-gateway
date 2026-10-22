import Link from 'next/link';
import {
  can,
  listAuditEntries,
  listPayments,
  type Payment,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { OPEN_STATUSES, statusBadge } from '@/lib/ui';

export const dynamic = 'force-dynamic';

const RESOLVED_STATUSES = new Set([
  'success',
  'failed',
  'cancelled',
  'incomplete',
  'blocked',
]);

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function paymentDayKey(payment: Payment): string {
  const timestamp = new Date(payment.createdAt);
  return Number.isNaN(timestamp.getTime()) ? '' : dayKey(timestamp);
}

const utcDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export default async function OverviewPage() {
  const admin = await requirePagePermission('payments.list');
  const allPayments = await listPayments();
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const periodStart = new Date(today);
  periodStart.setUTCDate(periodStart.getUTCDate() - 6);

  const payments = allPayments.filter((payment) => {
    const createdAt = new Date(payment.createdAt).getTime();
    return createdAt >= periodStart.getTime() && createdAt <= now.getTime();
  });
  const successful = payments.filter((payment) => payment.status === 'success');
  const failed = payments.filter((payment) => payment.status === 'failed');
  const inFlight = payments.filter((payment) =>
    OPEN_STATUSES.includes(payment.status)
  );
  const resolvedCount = payments.filter((payment) =>
    RESOLVED_STATUSES.has(payment.status)
  ).length;
  const successRate = resolvedCount
    ? Math.round((successful.length / resolvedCount) * 1000) / 10
    : null;

  const totalsByCurrency = successful.reduce<Record<string, number>>(
    (totals, payment) => {
      totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount;
      return totals;
    },
    {}
  );
  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(periodStart);
    date.setUTCDate(periodStart.getUTCDate() + index);
    const key = dayKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(date),
      count: payments.filter((payment) => paymentDayKey(payment) === key).length,
    };
  });
  const maxDailyCount = Math.max(...dailyCounts.map((day) => day.count), 1);
  const providerCounts = payments.reduce<Record<string, number>>(
    (counts, payment) => {
      counts[payment.provider] = (counts[payment.provider] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const recentPayments = allPayments.slice(0, 6);
  const recentAudit = can(admin.role, 'audit.view')
    ? await listAuditEntries(5)
    : [];

  const metrics = [
    {
      label: 'Payments created',
      value: formatCount(payments.length),
      detail: 'Last 7 days · transaction count',
      tone: 'text-slate-950',
    },
    {
      label: 'Successful',
      value: formatCount(successful.length),
      detail: 'Last 7 days · payment records',
      tone: 'text-emerald-700',
    },
    {
      label: 'Success rate',
      value: successRate === null ? '—' : `${successRate}%`,
      detail: 'Resolved payments only',
      tone: 'text-sky-800',
    },
    {
      label: 'Failed',
      value: formatCount(failed.length),
      detail: 'Last 7 days · payment status',
      tone: 'text-rose-700',
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Operations
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Payment activity and administrative events from the gateway database.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Reporting window: {utcDateFormatter.format(periodStart)} –{' '}
          {utcDateFormatter.format(today)} <span className="text-slate-400">(UTC)</span>
        </p>
      </header>

      <section aria-label="Payment metrics for the last seven days">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-h-28 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{metric.label}</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${metric.tone}`}>
                {metric.value}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Payment volume</h2>
              <p className="mt-1 text-xs text-slate-500">
                Created payments per day · UTC database dates
              </p>
            </div>
            <Link
              href="/payments"
              className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline"
            >
              View payments
            </Link>
          </div>
          {payments.length === 0 ? (
            <p className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-500">
              No payments were created in this reporting window.
            </p>
          ) : (
            <div
              className="mt-6 grid h-36 grid-cols-7 items-end gap-3 border-b border-slate-200 px-1"
              role="img"
              aria-label={`Daily payment counts for the last seven days: ${dailyCounts
                .map((day) => `${day.label} ${day.count}`)
                .join(', ')}`}
            >
              {dailyCounts.map((day) => (
                <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
                  <span className="text-[10px] tabular-nums text-slate-500">
                    {day.count || ''}
                  </span>
                  <div
                    title={`${day.label}: ${day.count} payments`}
                    className="w-full max-w-10 rounded-t-sm bg-emerald-600"
                    style={{ height: `${Math.max((day.count / maxDailyCount) * 100, day.count ? 8 : 2)}%` }}
                  />
                  <span className="text-[10px] text-slate-400">{day.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Gateway signals</h2>
          <p className="mt-1 text-xs text-slate-500">Available records, last 7 days</p>
          <dl className="mt-4 divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-slate-600">Payments in flight</dt>
              <dd className="font-semibold tabular-nums text-amber-700">{formatCount(inFlight.length)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-3">
              <dt className="text-sm text-slate-600">Successful payment value</dt>
              <dd className="text-right text-sm font-medium tabular-nums text-slate-900">
                {Object.keys(totalsByCurrency).length
                  ? Object.entries(totalsByCurrency).map(([currency, amount]) => (
                      <span key={currency} className="block">
                        {formatAmount(amount)} {currency}
                      </span>
                    ))
                  : '—'}
              </dd>
            </div>
            <div className="py-3">
              <dt className="mb-2 text-sm text-slate-600">Payments by provider</dt>
              {Object.keys(providerCounts).length ? (
                <dd className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {Object.entries(providerCounts).map(([provider, count]) => (
                    <span key={provider}>
                      <strong className="font-medium text-slate-800">{provider}</strong>{' '}
                      {formatCount(count)}
                    </span>
                  ))}
                </dd>
              ) : (
                <dd className="text-xs text-slate-400">No provider activity recorded.</dd>
              )}
            </div>
            <div className="flex items-start justify-between gap-3 py-3">
              <dt className="text-sm text-slate-600">Gateway health / latency</dt>
              <dd className="max-w-48 text-right text-xs text-slate-500">
                Not monitored by the current backend
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent payments</h2>
            <p className="mt-1 text-xs text-slate-500">Latest records across all dates</p>
          </div>
          <Link
            href="/payments"
            className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline"
          >
            All payments
          </Link>
        </div>
        {recentPayments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <Link
                        href={`/payments/${encodeURIComponent(payment.merchantReference)}`}
                        className="font-mono text-xs font-semibold text-emerald-800 hover:underline"
                      >
                        {payment.merchantReference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {payment.customerName ?? 'Unknown customer'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {formatAmount(payment.amount)} {payment.currency}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${statusBadge(payment.status)}`}>
                        {payment.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-xs tabular-nums text-slate-500">
                      {new Date(payment.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-slate-500">
            No payment records yet. New checkout activity will appear here.
          </p>
        )}
      </section>

      {can(admin.role, 'audit.view') && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Administrative activity</h2>
              <p className="mt-1 text-xs text-slate-500">Latest append-only audit events</p>
            </div>
            <Link
              href="/audit"
              className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline"
            >
              Audit trail
            </Link>
          </div>
          {recentAudit.length ? (
            <ul className="divide-y divide-slate-100">
              {recentAudit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 px-5 py-3">
                  <span className="min-w-0 truncate text-sm text-slate-700">
                    <span className="font-medium">{entry.action}</span>
                    {entry.target && <span className="text-slate-500"> · {entry.target}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {entry.actorEmail ?? 'system'} · {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">No administrative events recorded.</p>
          )}
        </section>
      )}

      <p className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        This backend does not currently collect API request logs, latency percentiles,
        API credentials, webhook delivery attempts, or health-check metrics. No
        gateway availability or request-volume estimates are shown here.
      </p>
    </div>
  );
}