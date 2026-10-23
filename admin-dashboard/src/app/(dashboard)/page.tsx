import Link from 'next/link';
import {
  can,
  countApiKeysByStatus,
  countPaymentsByDay,
  countPaymentsByStatus,
  listAuditEntries,
  listPaymentsPage,
  listRecentPaymentEvents,
  webhookDeliveryBacklog,
  gatewayTrafficSummary,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import {
  statusBadge,
  formatDateTime,
  formatDecimal,
  formatInt,
} from '@/lib/ui';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export default async function OverviewPage() {
  const admin = await requirePagePermission('payments.list');
  const nowMs = Date.now();
  const periodStartMs = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate()
  ) - 6 * DAY_MS;

  const [byDay, statusCounts7d, recentPayments, keys, deliveries, traffic, recentAudit, recentEvents] =
    await Promise.all([
      countPaymentsByDay({ afterMs: periodStartMs, beforeMs: nowMs + DAY_MS }),
      countPaymentsByStatus({ createdFromMs: periodStartMs, createdToMs: nowMs + DAY_MS }),
      listPaymentsPage({}, 1, 6),
      can(admin.role, 'keys.manage') ? countApiKeysByStatus() : null,
      webhookDeliveryBacklog(),
      can(admin.role, 'logs.view') ? gatewayTrafficSummary(nowMs - DAY_MS, nowMs) : null,
      can(admin.role, 'audit.view') ? listAuditEntries(5) : [],
      listRecentPaymentEvents(5),
    ]);

  const total7d = Object.values(statusCounts7d).reduce((sum, count) => sum + count, 0);
  const resolved7d =
    statusCounts7d.success + statusCounts7d.failed + statusCounts7d.cancelled +
    statusCounts7d.incomplete + statusCounts7d.blocked;
  const successRate7d = resolved7d
    ? Math.round((statusCounts7d.success / resolved7d) * 1000) / 10
    : null;
  const inFlight7d =
    statusCounts7d.pending + statusCounts7d.auth_needed + statusCounts7d.incomplete;

  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(periodStartMs + index * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: dayLabel(date),
      count: byDay.get(key) ?? 0,
    };
  });
  const maxDailyCount = Math.max(...dailyCounts.map((day) => day.count), 1);

  const metrics = [
    {
      label: 'Payments (7 d)',
      value: formatInt(total7d),
      detail: `last 7 UTC days · transaction count`,
      tone: 'text-secondary',
      href: '/payments',
    },
    {
      label: 'Successful (7 d)',
      value: formatInt(statusCounts7d.success),
      detail: successRate7d === null ? 'resolved rate unavailable' : `${successRate7d}% success rate`,
      tone: 'text-badge-success-foreground',
      href: '/payments?status=success',
    },
    {
      label: 'In flight',
      value: formatInt(inFlight7d),
      detail: 'pending / awaiting provider (created this week)',
      tone: 'text-badge-pending-foreground',
      href: '/payments?status=pending',
    },
    {
      label: 'API keys active',
      value: keys ? formatInt(keys.active) : 'restricted',
      detail: keys ? `${formatInt(keys.revoked)} revoked` : 'admin-only signal',
      tone: 'text-secondary',
      href: can(admin.role, 'keys.manage') ? '/keys' : '/payments',
    },
  ];

  const actionsNeeded: Array<{ label: string; detail: string; href: string; tone: string }> = [];
  if (deliveries.failed > 0) {
    actionsNeeded.push({
      label: `${formatInt(deliveries.failed)} failed webhook delivery${deliveries.failed === 1 ? '' : 'ies'}`,
      detail: 'Merchant endpoints did not accept a status notification — inspect and retry.',
      href: '/webhooks?box=failed',
      tone: 'border-badge-blocked bg-badge-blocked text-badge-blocked-foreground',
    });
  }
  if (deliveries.pending > 0) {
    actionsNeeded.push({
      label: `${formatInt(deliveries.pending)} pending webhook delivery${deliveries.pending === 1 ? '' : 'ies'}`,
      detail: 'Attempts are scheduled/awaiting the next status change or manual retry.',
      href: '/webhooks?box=pending',
      tone: 'border-badge-pending bg-badge-pending text-badge-pending-foreground',
    });
  }
  if (traffic && traffic.errors5xx > 0) {
    actionsNeeded.push({
      label: `${formatInt(traffic.errors5xx)} gateway 5xx responses (24 h)`,
      detail: 'Server-side errors were recorded in the request logs.',
      href: '/logs?class=5xx',
      tone: 'border-badge-blocked bg-badge-blocked text-badge-blocked-foreground',
    });
  }
  if (total7d === 0) {
    actionsNeeded.push({
      label: 'No payments recorded this week',
      detail: 'The reporting window is empty — initialize a payment from the checkout app to verify the gateway end-to-end.',
      href: '/payments',
      tone: 'border-gray-border bg-gray-background-alt text-gray-primary',
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-badge-success-foreground">
            Operations
          </p>
          <h1 className="mt-1 text-h1 tracking-tight text-secondary">Overview</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Gateway activity and administrative events, aggregated in the
            shared database. Financial value below is per-currency, without
            conversion.
          </p>
        </div>
        <Link
          href="/health"
          className="btn btn-secondary"
        >
          System health →
        </Link>
      </header>

      {actionsNeeded.length > 0 && (
        <section aria-label="Actions needed">
          <div className="grid gap-3 md:grid-cols-2">
            {actionsNeeded.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`flex flex-col rounded-lg border px-4 py-3 text-sm transition hover:brightness-[0.97] ${action.tone}`}
              >
                <strong>{action.label}</strong>
                <span className="mt-0.5 text-xs opacity-80">{action.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Payment metrics, last seven days">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-border bg-gray-border sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="min-h-28 bg-white p-4 transition hover:bg-gray-background-alt"
            >
              <p className="text-xs font-medium text-gray-secondary">{metric.label}</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${metric.tone}`}>{metric.value}</p>
              <p className="mt-1 text-[11px] text-gray-secondary">{metric.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-secondary">Payment volume</h2>
              <p className="mt-1 text-xs text-gray-secondary">Created payments per day · UTC · last 7 days</p>
            </div>
            <Link href="/analytics" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
              Analytics →
            </Link>
          </div>
          {total7d === 0 ? (
            <p className="mt-8 border-t border-gray-border/60 pt-4 text-sm text-gray-secondary">
              No payments were created in this reporting window.
            </p>
          ) : (
            <div
              className="mt-6 grid h-36 grid-cols-7 items-end gap-3 border-b border-gray-border px-1"
              role="img"
              aria-label={`Daily payment counts for the last seven days: ${dailyCounts
                .map((day) => `${day.label} ${day.count}`)
                .join(', ')}`}
            >
              {dailyCounts.map((day) => (
                <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
                  <span className="text-[10px] tabular-nums text-gray-secondary">{day.count || ''}</span>
                  <div
                    title={`${day.label}: ${day.count} payments`}
                    className="w-full max-w-10 rounded-t-sm bg-primary"
                    style={{ height: `${Math.max((day.count / maxDailyCount) * 100, day.count ? 8 : 2)}%` }}
                  />
                  <span className="text-[10px] text-gray-secondary">{day.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-secondary">Gateway signals</h2>
          <p className="mt-1 text-xs text-gray-secondary">Measured values only · last 24 h where noted</p>
          <dl className="mt-4 divide-y divide-gray-border/50">
            {traffic ? (
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm text-gray-primary">API requests (24 h)</dt>
                <dd className="text-right">
                  <span className="block font-semibold tabular-nums text-secondary">
                    {formatInt(traffic.total)}
                  </span>
                  <span className="text-[11px] text-gray-secondary">
                    {traffic.p50Ms != null
                      ? `p50 ${traffic.p50Ms} ms · p95 ${traffic.p95Ms} ms`
                      : 'latency unavailable'}
                  </span>
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm text-gray-primary">API requests (24 h)</dt>
                <dd className="text-xs text-gray-secondary">request-log permission required</dd>
              </div>
            )}
            {traffic && (
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm text-gray-primary">Request errors (24 h)</dt>
                <dd className="font-semibold tabular-nums text-secondary">
                  <span className={traffic.errors4xx + traffic.errors5xx > 0 ? 'text-badge-failed-foreground' : 'text-badge-success-foreground'}>
                    {(traffic.errors4xx + traffic.errors5xx) === 0
                      ? 'none'
                      : `${formatInt(traffic.errors4xx)} 4xx · ${formatInt(traffic.errors5xx)} 5xx`}
                  </span>
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-gray-primary">Inbound provider events (latest)</dt>
              <dd className="text-right text-xs text-gray-secondary">
                {recentEvents.length
                  ? `${formatInt(recentEvents.length)} shown · latest ${formatDateTime(recentEvents[0].createdAt)}`
                  : 'none recorded'}
              </dd>
            </div>
            <div className="py-3">
              <dt className="mb-2 text-sm text-gray-primary">Webhook deliveries</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-secondary">
                <span>
                  <strong className="font-medium text-badge-pending-foreground">pending</strong> {formatInt(deliveries.pending)}
                </span>
                <span>
                  <strong className="font-medium text-badge-failed-foreground">failed</strong> {formatInt(deliveries.failed)}
                </span>
                <span className="text-gray-secondary">
                  attempts & history on the{' '}
                  <Link href="/webhooks" className="underline-offset-2 hover:underline">
                    Webhooks
                  </Link>{' '}
                  page
                </span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-3">
              <dt className="text-sm text-gray-primary">Provider availability probes</dt>
              <dd className="max-w-48 text-right text-xs text-gray-secondary">
                Not monitored actively — outcome rates per provider are in <Link href="/health" className="underline-offset-2 hover:underline">System health</Link>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="overflow-hidden card">
        <div className="flex items-center justify-between gap-3 border-b border-gray-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-secondary">Recent payments</h2>
            <p className="mt-1 text-xs text-gray-secondary">Latest records across all dates</p>
          </div>
          <Link href="/payments" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            All payments →
          </Link>
        </div>
        {recentPayments.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-gray-background-alt border-b border-gray-border">
                <tr>
                  <th className="px-5 py-3 border-l border-gray-border first:border-l-0">Reference</th>
                  <th className="px-4 py-3 border-l border-gray-border first:border-l-0">Customer</th>
                  <th className="px-4 py-3 border-l border-gray-border first:border-l-0">Amount</th>
                  <th className="px-4 py-3 border-l border-gray-border first:border-l-0">Status</th>
                  <th className="px-5 py-3 text-right border-l border-gray-border first:border-l-0">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.rows.map((payment) => (
                  <tr key={payment.id} className="border-t border-gray-border/60">
                    <td className="px-5 py-3">
                      <Link
                        href={`/payments/${encodeURIComponent(payment.merchantReference)}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {payment.merchantReference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-primary">
                      {payment.customerName ?? 'Unknown customer'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {formatDecimal(payment.amount)}{' '}
                      <span className="text-xs text-gray-secondary">{payment.currency}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${statusBadge(payment.status)}`}>
                        {payment.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-xs tabular-nums text-gray-secondary">
                      {formatDateTime(payment.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-gray-secondary">
            No payment records yet. New checkout activity will appear here.
          </p>
        )}
      </section>

      {can(admin.role, 'audit.view') && (
        <section className="card">
          <div className="flex items-center justify-between gap-3 border-b border-gray-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-secondary">Administrative activity</h2>
              <p className="mt-1 text-xs text-gray-secondary">Latest append-only audit events</p>
            </div>
            <Link href="/audit" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
              Audit trail →
            </Link>
          </div>
          {recentAudit.length ? (
            <ul className="divide-y divide-gray-border/50">
              {recentAudit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 px-5 py-3">
                  <span className="min-w-0 truncate text-sm text-gray-primary">
                    <span className="font-medium">{entry.action}</span>
                    {entry.target && <span className="text-gray-secondary"> · {entry.target}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-gray-secondary">
                    {entry.actorEmail ?? 'system'} · {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-secondary">No administrative events recorded.</p>
          )}
        </section>
      )}

      <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-secondary">
        Environment: this deployment is single-environment (no sandbox/production
        split exists in the backend). Latency percentiles are sampled from
        recorded request logs (bounded sample). Monetary figures keep each
        currency separate — the backend performs no FX conversion.
      </p>
    </div>
  );
}