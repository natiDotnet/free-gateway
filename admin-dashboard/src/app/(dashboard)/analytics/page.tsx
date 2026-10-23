import Link from 'next/link';
import {
  can,
  countPaymentsByDay,
  countPaymentsByProviderWithin,
  countPaymentsByStatus,
  listDistinctPaymentProviders,
  successfulValueByCurrencyWithin,
  PAYMENT_STATUSES,
  RESOLVED_PAYMENT_STATUSES,
  type PaymentStatus,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { formatDecimal, formatInt } from '@/lib/ui';
import { percentageChange } from '@/lib/metric';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_STATUSES = PAYMENT_STATUSES as readonly string[];

type Props = {
  searchParams: Promise<{ from?: string; to?: string; provider?: string; status?: string; preset?: string }>;
};

function parseUtcDay(value?: string): Date | null {
  if (!value || !ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const admin = await requirePagePermission('payments.list');
  const params = await searchParams;

  const providers = await listDistinctPaymentProviders();
  const provider = providers.includes(params.provider ?? '') ? params.provider! : '';
  const status = ISO_STATUSES.includes(params.status ?? '') ? params.status! : '';

  const today = new Date();
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let endMs = parseUtcDay(params.to)?.getTime() ?? todayStart;
  let startMs = parseUtcDay(params.from)?.getTime() ?? endMs - 6 * DAY_MS;
  if (startMs > endMs) [startMs, endMs] = [endMs, startMs];
  const endExclusive = endMs + DAY_MS;
  const periodLength = endExclusive - startMs;
  const previousStart = startMs - periodLength;
  const dayCount = Math.max(1, Math.round(periodLength / DAY_MS));

  const filters = {
    provider: provider || undefined,
    status: status ? (status as PaymentStatus) : undefined,
  };

  const [byDayCurrent, byDayPrevious, statusCurrent, statusPrevious, providerCurrent, valueByCurrency] =
    await Promise.all([
      countPaymentsByDay({ ...filters, afterMs: startMs, beforeMs: endExclusive }),
      countPaymentsByDay({ ...filters, afterMs: previousStart, beforeMs: startMs }),
      countPaymentsByStatus({ ...filters, createdFromMs: startMs, createdToMs: endExclusive }),
      countPaymentsByStatus({ ...filters, createdFromMs: previousStart, createdToMs: startMs }),
      countPaymentsByProviderWithin(startMs, endExclusive, filters),
      successfulValueByCurrencyWithin(startMs, endExclusive, filters),
    ]);

  const sum = (counts: Record<PaymentStatus, number>) =>
    Object.values(counts).reduce((total, count) => total + count, 0);
  const mapSum = (map: Map<string, number>): number =>
    [...map.values()].reduce((total, count) => total + count, 0);
  const resolvedSum = (counts: Record<PaymentStatus, number>) =>
    (RESOLVED_PAYMENT_STATUSES as readonly string[]).reduce(
      (total, key) => total + (counts[key as PaymentStatus] ?? 0),
      0
    );
  const successSum = (counts: Record<PaymentStatus, number>) => counts.success ?? 0;
  const failedSum = (counts: Record<PaymentStatus, number>) => counts.failed ?? 0;

  const successRateOf = (counts: Record<PaymentStatus, number>): string => {
    const resolved = resolvedSum(counts);
    if (!resolved) return '—';
    return `${Math.round((successSum(counts) / resolved) * 1000) / 10}%`;
  };

  // Bucketing for the volume chart (max ~30 bars).
  const bucketSize = Math.max(1, Math.ceil(dayCount / 30));
  const bucketCount = Math.ceil(dayCount / bucketSize);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartMs = startMs + index * bucketSize * DAY_MS;
    const bucketEndMs = Math.min(bucketStartMs + bucketSize * DAY_MS - DAY_MS, endMs);
    return {
      label: bucketSize === 1 ? formatDay(new Date(bucketStartMs)) : `${formatDay(new Date(bucketStartMs))}–${formatDay(new Date(bucketEndMs))}`,
      firstDayMs: bucketStartMs,
      count: 0,
    };
  });
  for (const [day, count] of byDayCurrent) {
    if (!day) continue;
    const dayMs = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isNaN(dayMs)) continue;
    const index = Math.floor((dayMs - startMs) / DAY_MS / bucketSize);
    if (buckets[index]) buckets[index].count += count;
  }
  const maxBucketCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const currentTotal = sum(statusCurrent);

  const exportQuery = new URLSearchParams();
  if (provider) exportQuery.set('provider', provider);
  if (status) exportQuery.set('status', status);
  const exportHref = `/api/admin/payments/export${exportQuery.size ? `?${exportQuery}` : ''}`;

  const presetHref = (days: number) => {
    const to = new Date(endMs).toISOString().slice(0, 10);
    const from = new Date(endMs - (days - 1) * DAY_MS).toISOString().slice(0, 10);
    const query = new URLSearchParams({ from, to });
    if (provider) query.set('provider', provider);
    if (status) query.set('status', status);
    return `/analytics?${query}`;
  };

  const drillQuery = () => {
    const query = new URLSearchParams({
      from: new Date(startMs).toISOString().slice(0, 10),
      to: new Date(endMs).toISOString().slice(0, 10),
    });
    if (provider) query.set('provider', provider);
    if (status) query.set('status', status);
    return `/payments?${query}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-badge-success-foreground">
            Reporting
          </p>
          <h1 className="mt-1 text-h1 tracking-tight">Analytics</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Aggregations are computed in the database (per-currency, never
            converted). API request usage lives in{' '}
            <Link href="/logs" className="text-primary underline-offset-2 hover:underline">
              Request logs
            </Link>.
          </p>
        </div>
        <p className="text-xs text-gray-secondary">
          {formatDay(new Date(startMs))} – {formatDay(new Date(endMs))} UTC
        </p>
      </header>

      <form
        method="GET"
        action="/analytics"
        className="flex flex-wrap items-end gap-3 card p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          From (UTC)
          <input
            name="from"
            type="date"
            defaultValue={new Date(startMs).toISOString().slice(0, 10)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          To (UTC)
          <input
            name="to"
            type="date"
            defaultValue={new Date(endMs).toISOString().slice(0, 10)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Provider
          <select
            name="provider"
            defaultValue={provider}
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
          Status
          <select
            name="status"
            defaultValue={status}
            className="field select min-w-32"
          >
            <option value="">All statuses</option>
            {ISO_STATUSES.map((name) => (
              <option key={name} value={name}>
                {name.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <div className="ms-auto flex items-end">
          <button type="submit" className="btn btn-primary">
            Apply filters
          </button>
        </div>
      </form>

      <nav aria-label="Preset ranges" className="flex flex-wrap gap-2 text-xs">
        <span className="py-1.5 font-medium text-gray-secondary">Presets:</span>
        {[
          [7, 'Last 7 days'],
          [30, 'Last 30 days'],
          [90, 'Last 90 days'],
        ].map(([days, label]) => (
          <Link
            key={label as string}
            href={presetHref(days as number)}
            className="btn btn-secondary btn-sm hover:border-primary hover:text-primary"
          >
            {label as string}
          </Link>
        ))}
        {can(admin.role, 'reports.export') && (
          <a
            href={exportHref}
            className="btn btn-secondary btn-sm hover:border-primary hover:text-primary"
          >
            Export CSV<span aria-hidden>↓</span>
          </a>
        )}
        <Link
          href={drillQuery()}
          className="btn btn-secondary btn-sm hover:border-primary hover:text-primary"
        >
          Open records →
        </Link>
      </nav>

      <section aria-label="Period summary" className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-border bg-gray-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: `Payments · ${provider || 'all providers'}`,
            value: formatInt(currentTotal),
            comparison: percentageChange(currentTotal, sum(statusPrevious)),
          },
          {
            label: 'Successful',
            value: formatInt(successSum(statusCurrent)),
            comparison: percentageChange(successSum(statusCurrent), successSum(statusPrevious)),
          },
          {
            label: 'Failed',
            value: formatInt(failedSum(statusCurrent)),
            comparison: percentageChange(failedSum(statusCurrent), failedSum(statusPrevious)),
          },
          {
            label: 'Success rate',
            value: successRateOf(statusCurrent),
            comparison: `Prior period: ${successRateOf(statusPrevious)}`,
          },
        ].map((metric) => (
          <div key={metric.label} className="min-h-28 bg-white p-4">
            <p className="text-xs font-medium text-gray-secondary">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-secondary">{metric.value}</p>
            <p className="mt-1 text-[11px] text-gray-secondary">{metric.comparison}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-secondary">Payment volume</h2>
              <p className="mt-1 text-xs text-gray-secondary">
                {status || 'All statuses'} · prior {dayCount === 1 ? 'day' : `${dayCount} days`}:{' '}
                {formatInt(mapSum(byDayPrevious))} payments
              </p>
            </div>
            <Link href={drillQuery()} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
              Underlying records →
            </Link>
          </div>
          {currentTotal === 0 ? (
            <p className="mt-8 border-t border-gray-border/60 pt-4 text-sm text-gray-secondary">
              No payments match this reporting period and filters.
            </p>
          ) : (
            <div
              role="img"
              aria-label={`Payment count chart: ${buckets.map((bucket) => `${bucket.label}: ${bucket.count}`).join(', ')}`}
              className="mt-6 flex h-44 items-end gap-1 overflow-x-auto border-b border-gray-border px-1"
            >
              {buckets.map((bucket) => (
                <div key={bucket.label} className="flex h-full min-w-5 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] tabular-nums text-gray-secondary">{bucket.count || ''}</span>
                  <div
                    title={`${bucket.label}: ${bucket.count} payments`}
                    className="w-full max-w-8 rounded-t-sm bg-primary"
                    style={{ height: `${Math.max((bucket.count / maxBucketCount) * 100, bucket.count ? 7 : 2)}%` }}
                  />
                  <span className="max-w-full truncate text-[9px] text-gray-secondary">{bucket.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-secondary">Successful value by currency</h2>
          <p className="mt-1 text-xs text-gray-secondary">
            Currencies are kept separate; no conversion methodology is applied.
          </p>
          {[...valueByCurrency.entries()].length ? (
            <dl className="mt-4 divide-y divide-gray-border/50">
              {[...valueByCurrency.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([currency, amount]) => (
                  <div key={currency} className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-sm text-gray-primary">{currency}</dt>
                    <dd className="font-semibold tabular-nums text-secondary">{formatDecimal(amount)}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="mt-6 text-sm text-gray-secondary">No successful payment value in this period.</p>
          )}
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-secondary">Provider activity</h2>
          {[...providerCurrent.entries()].length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-background-alt border-b border-gray-border">
                  <tr>
                    <th className="py-2.5 px-4 border-l border-gray-border first:border-l-0">Provider</th>
                    <th className="py-2.5 px-4 text-right border-l border-gray-border first:border-l-0">Payments</th>
                    <th className="py-2.5 px-4 text-right border-l border-gray-border first:border-l-0">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {[...providerCurrent.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <tr key={name} className="border-t border-gray-border/60">
                        <td className="py-2.5">
                          <Link
                            href={`/analytics?${new URLSearchParams({ from: new Date(startMs).toISOString().slice(0, 10), to: new Date(endMs).toISOString().slice(0, 10), provider: name })}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-gray-primary">{formatInt(count)}</td>
                        <td className="py-2.5 text-right tabular-nums text-gray-secondary">
                          {currentTotal ? `${Math.round((count / currentTotal) * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-secondary">No provider activity recorded in this period.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-secondary">Status distribution</h2>
          {currentTotal ? (
            <dl className="mt-3 divide-y divide-gray-border/50">
              {(ISO_STATUSES as readonly string[])
                .map((name) => ({ name, count: statusCurrent[name as PaymentStatus] ?? 0 }))
                .filter((item) => item.count > 0)
                .map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-sm capitalize text-gray-primary">{item.name.replace('_', ' ')}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="hidden h-1.5 w-24 overflow-hidden rounded bg-gray-background-alt sm:block">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${(item.count / currentTotal) * 100}%` }}
                        />
                      </span>
                      <span className="font-medium tabular-nums text-secondary">{formatInt(item.count)}</span>
                    </dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-gray-secondary">No payment statuses to report.</p>
          )}
        </section>
      </div>

      <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-secondary">
        Source: payment records aggregated server-side in the configured database
        (Prisma datasource). Comparisons apply the same filters over the immediately
        preceding UTC period of equal length. Reports export as CSV by operator/admin
        roles and every export is audit logged.
      </p>
    </div>
  );
}