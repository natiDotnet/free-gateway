import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGatewayRequest, getPaymentByMerchantReference } from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { formatDateTime, methodBadge, statusClassBadge } from '@/lib/ui';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RequestLogDetailPage({ params }: Props) {
  await requirePagePermission('logs.view');
  const { id } = await params;
  const entry = await getGatewayRequest(id);
  if (!entry) notFound();

  const payment = entry.merchantReference
    ? await getPaymentByMerchantReference(entry.merchantReference)
    : null;

  const fields: Array<[label: string, value: React.ReactNode]> = [
    ['When', <span className="tabular-nums">{formatDateTime(entry.createdAt)}</span>],
    ['Correlation ID', <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs">{entry.correlationId}</code>],
    [
      'Endpoint',
      <span className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${methodBadge(entry.method)}`}>
          {entry.method}
        </span>
        <code className="font-mono text-xs">{entry.path}</code>
      </span>,
    ],
    ['Query string', entry.query ?? <span className="text-gray-secondary">—</span>],
    [
      'Status',
      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold tabular-nums ${statusClassBadge(entry.statusCode)}`}>
        {entry.statusCode}
      </span>,
    ],
    ['Duration', <span className="tabular-nums">{entry.durationMs} ms</span>],
    ['Client IP', entry.ip ?? <span className="text-gray-secondary">—</span>],
    ['User agent', entry.userAgent ?? <span className="text-gray-secondary">—</span>],
    ['API key prefix', entry.apiKeyPrefix ?? <span className="text-gray-secondary">—</span>],
    ['Merchant reference', entry.merchantReference ?? <span className="text-gray-secondary">—</span>],
    ['Error classification', entry.errorCode ?? <span className="text-gray-secondary">—</span>],
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/logs"
            className="mb-1 inline-block rounded-full border border-gray-border bg-white px-3 py-0.5 text-xs text-gray-secondary hover:text-secondary"
          >
            ← Request logs
          </Link>
          <h1 className="break-all font-mono text-xl font-bold tracking-tight">
            {entry.method} {entry.path}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold tabular-nums ${statusClassBadge(entry.statusCode)}`}>
              {entry.statusCode}
            </span>
            <span className="text-xs text-gray-secondary">{entry.durationMs} ms · correlation {entry.correlationId.slice(0, 13)}…</span>
          </p>
        </div>
      </header>

      <section className="card p-6">
        <h2 className="text-base font-semibold">Sanitized request metadata</h2>
        <p className="mt-1 text-xs text-gray-secondary">
          Only the fields below are stored. Authorization headers, API secrets,
          cookies, bodies and payment credentials are redacted by design at the
          gateway — they are not hidden after the fact, they are simply never
          recorded.
        </p>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-secondary">
                {label}
              </dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {payment && (
        <section className="card p-6">
          <h2 className="text-base font-semibold">Related payment</h2>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <Link
              href={`/payments/${encodeURIComponent(payment.merchantReference)}`}
              className="font-mono text-sm font-semibold text-primary hover:underline"
            >
              {payment.merchantReference}
            </Link>
            <span className="text-gray-secondary">
              {payment.currency} {payment.amount}
            </span>
            <span className="text-xs text-gray-secondary">
              status: {payment.status} · provider: {payment.provider}
            </span>
          </div>
        </section>
      )}

      <section className="card p-6">
        <h2 className="text-base font-semibold">Availability note</h2>
        <p className="mt-1 text-sm text-gray-primary">
          Full request/response body capture, HTTP header inspection and network
          trace export are not implemented by this backend. If you need them,
          they must be added server-side with redaction rules — the dashboard
          never displays payload contents it has not received from the gateway.
        </p>
      </section>
    </div>
  );
}