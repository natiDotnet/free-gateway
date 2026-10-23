import Link from 'next/link';
import {
  getGatewayHealth,
  listAuditEntries,
  type GatewayHealth,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { PERMISSION_LABELS, ROLE_PERMISSIONS, formatInt, formatDecimal } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function SystemHealthPage() {
  const admin = await requirePagePermission('logs.view');
  const health: GatewayHealth = await getGatewayHealth();
  const recentAudit = (await listAuditEntries(1))[0] ?? null;

  const errorRate =
    health.traffic.total > 0
      ? Math.round(
          ((health.traffic.errors4xx + health.traffic.errors5xx) / health.traffic.total) * 1000
        ) / 10
      : null;

  const configBits: Array<{ label: string; value: string; note?: string }> = [
    {
      label: 'DATABASE_PROVIDER',
      value: health.database.provider,
      note: 'Prisma datasource in use (sqlite / postgresql / mysql).',
    },
    {
      label: 'API key enforcement',
      value:
        process.env.GATEWAY_API_KEYS_REQUIRED === 'true'
          ? 'required on /api/payments/init'
          : 'off — gateway open by default',
      note: 'Set GATEWAY_API_KEYS_REQUIRED=true to require merchant keys.',
    },
    {
      label: 'Webhook signature validation',
      value: 'not implemented',
      note: 'Inbound provider webhooks are not cryptographically verified yet (README TODO).',
    },
    {
      label: 'Automatic delivery retries',
      value: 'manual only',
      note: 'Failed webhook deliveries are retried from this dashboard (cap: 5 attempts).',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 tracking-tight">System health</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Measures taken directly from the database and request telemetry.
            Nothing here is estimated — unavailable signals are labeled
            instead of invented.
          </p>
        </div>
        <p className="text-xs text-gray-secondary">Generated {new Date(health.generatedAt).toLocaleString()}</p>
      </header>

      <section aria-label="Live health signals" className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-border bg-gray-border sm:grid-cols-2 xl:grid-cols-4">
        <HealthTile
          label="Database"
          value={health.database.ok ? `reachable · ${health.database.latencyMs} ms` : 'UNREACHABLE'}
          detail={`provider: ${health.database.provider}`}
          tone={health.database.ok ? 'text-badge-success-foreground' : 'text-badge-failed-foreground'}
        />
        <HealthTile
          label="Open payments"
          value={formatInt(health.openPayments)}
          detail="pending / auth_needed / incomplete"
          tone={health.openPayments > 50 ? 'text-badge-pending-foreground' : 'text-secondary'}
        />
        <HealthTile
          label="Error rate (24 h)"
          value={health.traffic.total ? `${errorRate}%` : 'no traffic'}
          detail={`${formatInt(health.traffic.errors4xx)} × 4xx · ${formatInt(health.traffic.errors5xx)} × 5xx of ${formatInt(health.traffic.total)}`}
          tone={errorRate != null && errorRate > 5 ? 'text-badge-failed-foreground' : 'text-badge-success-foreground'}
        />
        <HealthTile
          label="Latency p50 / p95 (24 h)"
          value={
            health.traffic.p50Ms != null
              ? `${formatInt(health.traffic.p50Ms)} / ${formatInt(health.traffic.p95Ms ?? 0)} ms`
              : 'no samples'
          }
          detail="sampled from recorded request logs"
          tone="text-secondary"
        />
        <HealthTile
          label="Webhook delivery backlog"
          value={`${formatInt(health.deliveries.failed)} failed · ${formatInt(health.deliveries.pending)} pending`}
          detail="outgoing merchant notifications"
          tone={health.deliveries.failed > 0 ? 'text-badge-failed-foreground' : 'text-badge-success-foreground'}
        />
        <HealthTile
          label="API keys"
          value={`${formatInt(health.apiKeys.active)} active`}
          detail={`${formatInt(health.apiKeys.revoked)} revoked · manage in API keys`}
          tone="text-secondary"
        />
        <HealthTile
          label="Payments 24 h"
          value={formatInt(health.recentPayments.created24h)}
          detail={`${formatInt(health.recentPayments.success24h)} succeeded · ${formatInt(health.recentPayments.failed24h)} failed`}
          tone="text-secondary"
        />
        <HealthTile
          label="Queue / provider probes"
          value="not applicable"
          detail="No message queues or active provider health checks exist in this backend."
          tone="text-gray-secondary"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-secondary">Provider activity (payment records)</h2>
          <p className="mt-1 text-xs text-gray-secondary">
            Derived from payment statuses of all recorded transactions — the
            backend performs no active provider health checks, so this is an
            <strong> outcome statistic</strong>, not availability monitoring.
          </p>
          {health.providers.length ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="bg-gray-background-alt border-b border-gray-border">
                <tr>
                  <th className="py-2.5 px-4 border-l border-gray-border first:border-l-0">Provider</th>
                  <th className="py-2.5 px-4 text-right border-l border-gray-border first:border-l-0">Payments</th>
                  <th className="py-2.5 px-4 text-right border-l border-gray-border first:border-l-0">Success rate</th>
                </tr>
              </thead>
              <tbody>
                {health.providers.map((provider) => (
                  <tr key={provider.provider} className="border-t border-gray-border/60">
                    <td className="py-2.5 font-medium text-secondary">{provider.provider}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatInt(provider.total)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {provider.successRatePercent == null ? '—' : `${formatDecimal(provider.successRatePercent)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-gray-secondary">No provider activity recorded.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-secondary">Platform configuration (non-secret)</h2>
          <dl className="mt-4 divide-y divide-gray-border/50">
            {configBits.map((bit) => (
              <div key={bit.label} className="py-3">
                <dt className="text-sm text-gray-primary">
                  {bit.label}{' '}
                  <span className="ml-1 font-semibold text-secondary">{bit.value}</span>
                </dt>
                {bit.note && <dd className="mt-0.5 text-xs text-gray-secondary">{bit.note}</dd>}
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-secondary">Your access</h2>
        <p className="mt-1 text-xs text-gray-secondary">
          Signed in as {admin.email}. Server-enforced permissions for your role:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {(ROLE_PERMISSIONS[admin.role] ?? []).map((permission) => (
            <li
              key={permission}
              className="rounded-full bg-gray-background-alt px-3 py-1 text-xs text-gray-primary ring-1 ring-gray-border"
            >
              {PERMISSION_LABELS[permission] ?? permission}{' '}
              <code className="font-mono text-[10px] text-gray-secondary">{permission}</code>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-secondary">
          Next administrative event on record:{' '}
          {recentAudit ? (
            <Link href="/audit" className="text-primary hover:underline">
              {recentAudit.action.split('.')[0]} · {recentAudit.createdAt.split('T')[0]} ·{' '}
              {recentAudit.actorEmail ?? 'system'}
            </Link>
          ) : (
            'none recorded yet'
          )}
        </p>
      </section>

      <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-secondary">
        Not provided by this backend: CPU/memory metrics, message-queue depth,
        active provider pings with per-provider latency, uptime checks, node
        saturation, and alerting rules. Adding them requires server-side
        instrumentation in the gateway process.
      </p>
    </div>
  );
}

function HealthTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="min-h-24 bg-white p-4">
      <p className="text-xs font-medium text-gray-secondary">{label}</p>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] text-gray-secondary">{detail}</p>
    </div>
  );
}