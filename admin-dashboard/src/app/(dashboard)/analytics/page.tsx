import { listPayments, type Payment } from '@org/db';
import { requirePagePermission } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUSES: Payment['status'][] = [
  'pending',
  'auth_needed',
  'incomplete',
  'success',
  'failed',
  'cancelled',
  'blocked',
];

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    provider?: string;
    status?: string;
  }>;
};

function parseUtcDay(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function percentageChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'No change' : 'No prior activity';
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change) * 10) / 10;
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${rounded}% vs prior period`;
}

function matchesFilters(payment: Payment, provider: string, status: string): boolean {
  return (!provider || payment.provider === provider) && (!status || payment.status === status);
}

function isInRange(payment: Payment, start: number, end: number): boolean {
  const createdAt = new Date(payment.createdAt).getTime();
  return createdAt >= start && createdAt < end;
}

function successRate(payments: Payment[]): string {
  const resolved = payments.filter((payment) =>
    ['success', 'failed', 'cancelled', 'incomplete', 'blocked'].includes(payment.status)
  );
  if (!resolved.length) return '—';
  return `${Math.round((resolved.filter((payment) => payment.status === 'success').length / resolved.length) * 1000) / 10}%`;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  await requirePagePermission('payments.list');
  const params = await searchParams;
  const allPayments = await listPayments();
  const providers = [...new Set(allPayments.map((payment) => payment.provider))].sort();
  const provider = providers.includes(params.provider ?? '') ? params.provider ?? '' : '';
  const status = STATUSES.includes(params.status as Payment['status'])
    ? params.status ?? ''
    : '';

  const today = new Date();
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let end = parseUtcDay(params.to)?.getTime() ?? todayStart;
  let start = parseUtcDay(params.from)?.getTime() ?? end - 6 * DAY_MS;
  if (start > end) [start, end] = [end, start];
  const endExclusive = end + DAY_MS;
  const periodLength = endExclusive - start;
  const previousStart = start - periodLength;

  const filtered = allPayments.filter((payment) =>
    matchesFilters(payment, provider, status)
  );
  const current = filtered.filter((payment) =>
    isInRange(payment, start, endExclusive)
  );
  const previous = filtered.filter((payment) =>
    isInRange(payment, previousStart, start)
  );
  const successful = current.filter((payment) => payment.status === 'success');
  const failed = current.filter((payment) => payment.status === 'failed');
  const successfulValue = successful.reduce<Record<string, number>>((totals, payment) => {
    totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount;
    return totals;
  }, {});

  const dayCount = Math.max(1, Math.ceil(periodLength / DAY_MS));
  const bucketSize = Math.ceil(dayCount / 30);
  const bucketCount = Math.ceil(dayCount / bucketSize);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start + index * bucketSize * DAY_MS);
    const bucketEnd = new Date(Math.min(start + (index + 1) * bucketSize * DAY_MS - DAY_MS, end));
    return {
      label: bucketSize === 1 ? formatDay(bucketStart) : `${formatDay(bucketStart)}–${formatDay(bucketEnd)}`,
      count: 0,
    };
  });
  for (const payment of current) {
    const dayIndex = Math.floor((new Date(payment.createdAt).getTime() - start) / DAY_MS);
    const bucket = buckets[Math.floor(dayIndex / bucketSize)];
    if (bucket) bucket.count += 1;
  }
  const maxBucketCount = Math.max(...buckets.map((bucket) => bucket.count), 1);

  const providerSummary = providers
    .filter((name) => !provider || name === provider)
    .map((name) => {
      const payments = current.filter((payment) => payment.provider === name);
      return { name, count: payments.length, rate: successRate(payments) };
    });
  const statusCounts = STATUSES.map((name) => ({
    name,
    count: current.filter((payment) => payment.status === name).length,
  })).filter((item) => item.count > 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Reporting
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Payment analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Transaction records only. API request telemetry is not collected by this backend.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          {formatDay(new Date(start))} – {formatDay(new Date(end))} UTC
        </p>
      </header>

      <form method="GET" action="/analytics" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          From (UTC)
          <input name="from" type="date" defaultValue={new Date(start).toISOString().slice(0, 10)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          To (UTC)
          <input name="to" type="date" defaultValue={new Date(end).toISOString().slice(0, 10)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Provider
          <select name="provider" defaultValue={provider} className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm">
            <option value="">All providers</option>
            {providers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Status
          <select name="status" defaultValue={status} className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((name) => <option key={name} value={name}>{name.replace('_', ' ')}</option>)}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700">
          Apply filters
        </button>
      </form>

      <section aria-label="Payment analytics summary" className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Payments', value: formatCount(current.length), comparison: percentageChange(current.length, previous.length) },
          { label: 'Successful', value: formatCount(successful.length), comparison: percentageChange(successful.length, previous.filter((payment) => payment.status === 'success').length) },
          { label: 'Failed', value: formatCount(failed.length), comparison: percentageChange(failed.length, previous.filter((payment) => payment.status === 'failed').length) },
          { label: 'Success rate', value: successRate(current), comparison: 'Resolved payments only' },
        ].map((metric) => (
          <div key={metric.label} className="min-h-28 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{metric.value}</p>
            <p className="mt-1 text-[11px] text-slate-400">{metric.comparison}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Payment volume</h2>
          <p className="mt-1 text-xs text-slate-500">
            Records per {bucketSize === 1 ? 'day' : `${bucketSize}-day interval`} · compared with the prior {dayCount} days
          </p>
          {current.length ? (
            <div role="img" aria-label={`Payment count chart: ${buckets.map((bucket) => `${bucket.label}: ${bucket.count}`).join(', ')}`} className="mt-6 flex h-44 items-end gap-1 overflow-x-auto border-b border-slate-200 px-1">
              {buckets.map((bucket) => (
                <div key={bucket.label} className="flex h-full min-w-5 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500">{bucket.count || ''}</span>
                  <div title={`${bucket.label}: ${bucket.count} payments`} className="w-full max-w-8 rounded-t-sm bg-emerald-600" style={{ height: `${Math.max((bucket.count / maxBucketCount) * 100, bucket.count ? 7 : 2)}%` }} />
                  <span className="max-w-full truncate text-[9px] text-slate-400">{bucket.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-500">No payments match this reporting period and filters.</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Successful value by currency</h2>
          <p className="mt-1 text-xs text-slate-500">Currencies are kept separate; no conversion is applied.</p>
          {Object.keys(successfulValue).length ? (
            <dl className="mt-4 divide-y divide-slate-100">
              {Object.entries(successfulValue).sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => (
                <div key={currency} className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-sm text-slate-600">{currency}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{formatAmount(amount)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-6 text-sm text-slate-500">No successful payment value in this period.</p>
          )}
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Provider activity</h2>
          {providerSummary.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] font-semibold uppercase text-slate-500">
                  <tr><th className="py-2">Provider</th><th className="py-2 text-right">Payments</th><th className="py-2 text-right">Success rate</th></tr>
                </thead>
                <tbody>{providerSummary.map((item) => (
                  <tr key={item.name} className="border-t border-slate-100">
                    <td className="py-2.5 font-medium text-slate-800">{item.name}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCount(item.count)}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.rate}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">No provider activity recorded.</p>}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Status distribution</h2>
          {statusCounts.length ? (
            <dl className="mt-3 divide-y divide-slate-100">
              {statusCounts.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-sm capitalize text-slate-600">{item.name.replace('_', ' ')}</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{formatCount(item.count)}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="mt-4 text-sm text-slate-500">No payment statuses to report.</p>}
        </section>
      </div>

      <p className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        Source: payment records in the configured database. Comparisons use the same filters over the immediately preceding equal-length UTC period. Report export is unavailable until a dedicated permission and export policy are defined.
      </p>
    </div>
  );
}