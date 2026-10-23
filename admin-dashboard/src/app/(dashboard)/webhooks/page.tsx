import Link from 'next/link';
import {
  can,
  countWebhookDeliveriesByStatus,
  listRecentPaymentEvents,
  listWebhookDeliveriesPage,
  type PaymentEvent,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import DeliveryRetryButton from './_delivery-retry';
import Pagination from '../_pagination';
import { formatDateTime, formatInt, maskDestinationUrl, deliveryBadge } from '@/lib/ui';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{
    q?: string;
    box?: string;
    provider?: string;
    page?: string;
    perPage?: string;
  }>;
};

export default async function WebhooksPage({ searchParams }: Props) {
  const admin = await requirePagePermission('payments.list');
  const params = await searchParams;

  const canManage = can(admin.role, 'webhooks.manage');
  const q = (params.q ?? '').trim();
  const boxFilter = ['pending', 'success', 'failed'].includes(params.box ?? '')
    ? (params.box as 'pending' | 'success' | 'failed')
    : undefined;
  const providerFilter = (params.provider ?? '').trim() || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const parsedPerPage = Number.parseInt(params.perPage ?? '', 10);
  const perPage = [10, 20, 50].includes(parsedPerPage) ? parsedPerPage : 20;

  const [result, counts, events] = await Promise.all([
    listWebhookDeliveriesPage({ status: boxFilter, q: q || undefined }, page, perPage),
    countWebhookDeliveriesByStatus({ status: boxFilter, q: q || undefined }),
    listRecentPaymentEvents(40, providerFilter),
  ]);
  const deliveries = result.rows;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const providerNames = [...new Set(events.map((event) => event.provider))].sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 tracking-tight">Webhooks</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Outbound deliveries the gateway fires to each payment&apos;s
            notification_url, plus inbound provider events that settle
            payments. Payloads never contain payment credentials.
          </p>
        </div>
        {canManage && (
          <p className="text-xs text-gray-secondary">
            You can retry failed deliveries (max 5 attempts each).
          </p>
        )}
      </header>

      {counts.failed > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-badge-pending bg-badge-pending px-4 py-2.5 text-sm text-badge-pending-foreground"
        >
          {counts.failed} delivery{counts.failed === 1 ? '' : 'ies'} failed and {counts.pending}{' '}
          still pending — inspect below and retry once the merchant endpoint is fixed.
        </div>
      )}

      <section aria-label="Outgoing webhook delivery history" className="overflow-hidden card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Outgoing delivery attempts ({formatInt(result.total)})</h2>
            <p className="mt-0.5 text-xs text-gray-secondary">
              Fired when a payment&apos;s status changes and a notification_url is set.
            </p>
          </div>
          <form method="GET" action="/webhooks" className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search reference, event, URL…"
              aria-label="Search deliveries"
              className="field-sm w-48"
            />
            <select
              name="box"
              defaultValue={boxFilter ?? ''}
              aria-label="Filter delivery status"
              className="field-sm select"
            >
              <option value="">All statuses</option>
              <option value="pending">pending</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
            </select>
            <button type="submit" className="btn btn-primary btn-xs">
              Filter
            </button>
          </form>
        </div>

        {deliveries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-secondary">
            No outgoing deliveries recorded. Add a notification_url when
            initializing a payment; the gateway then POSTs status updates there.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-background-alt border-b border-gray-border">
                <tr>
                  <th className="px-5 py-3 text-left border-l border-gray-border first:border-l-0">Payment</th>
                  <th className="px-4 py-3 text-left border-l border-gray-border first:border-l-0">Event</th>
                  <th className="px-4 py-3 text-left border-l border-gray-border first:border-l-0">Destination</th>
                  <th className="px-4 py-3 text-left border-l border-gray-border first:border-l-0">Status</th>
                  <th className="px-4 py-3 text-left border-l border-gray-border first:border-l-0">Attempts / response</th>
                  <th className="px-4 py-3 text-left border-l border-gray-border first:border-l-0">Created · last attempt</th>
                  <th className="px-5 py-3 text-right border-l border-gray-border first:border-l-0">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="border-b border-gray-border px-5 py-3">
                      {delivery.paymentId ? (
                        <Link
                          href={`/payments/${encodeURIComponent(delivery.paymentReference ?? '')}`}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {delivery.paymentReference ?? 'unknown'}
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-secondary">no payment link</span>
                      )}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 font-mono text-xs text-gray-primary">
                      {delivery.eventType}
                    </td>
                    <td className="max-w-56 truncate border-b border-gray-border px-4 py-3.5 font-mono text-xs text-gray-secondary">
                      {maskDestinationUrl(delivery.destinationUrl)}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${deliveryBadge(delivery.status)}`}>
                        {delivery.status === 'success' ? '✓ delivered' : delivery.status === 'pending' ? '↻ pending' : '✕ failed'}
                      </span>
                      {delivery.responseError && (
                        <span className="block text-[10px] text-badge-failed-foreground">{delivery.responseError}</span>
                      )}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 text-xs tabular-nums text-gray-primary">
                      {delivery.attempts}
                      {delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ''}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 text-xs tabular-nums text-gray-secondary">
                      {formatDateTime(delivery.createdAt)}
                      {delivery.lastAttemptAt && (
                        <span className="block text-gray-secondary">
                          last: {formatDateTime(delivery.lastAttemptAt)}
                        </span>
                      )}
                    </td>
                    <td className="border-b border-gray-border px-5 py-2.5 text-right">
                      {delivery.status !== 'success' && canManage ? (
                        <DeliveryRetryButton deliveryId={delivery.id} />
                      ) : (
                        <span className="text-xs text-gray-secondary/50">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          basePath="/webhooks"
          page={result.page}
          pageCount={pageCount}
          total={result.total}
          pageSize={result.pageSize}
          params={params}
          defaultPerPage={20}
        />
      </section>

      <section className="overflow-hidden card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Inbound provider events (latest {events.length})</h2>
            <p className="mt-0.5 text-xs text-gray-secondary">
              Webhooks received from providers (the source of truth for payment status).
            </p>
          </div>
          <form method="GET" action="/webhooks" className="flex items-center gap-2">
            <select
              name="provider"
              defaultValue={providerFilter ?? ''}
              aria-label="Filter provider events"
              className="field-sm select"
            >
              <option value="">All providers</option>
              {providerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary btn-xs">
              Filter
            </button>
          </form>
        </div>
        {events.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-secondary">No provider events recorded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-border/50">
            {events.map((event) => (
              <InboundEvent key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-secondary">
        Capabilities: automatic outbound retries on a schedule are not implemented — the
        dashboard performs manual retries (capped at 5 attempts per delivery) and the gateway
        records one attempt per status change. Inbound webhook signature validation is also
        still open (see README security TODOs).
      </p>
    </div>
  );
}

function InboundEvent({ event }: { event: PaymentEvent }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-[11px] text-secondary">
          {event.eventType}
        </code>
        <span className="text-xs text-gray-secondary">{event.provider}</span>
        {event.merchantReference && (
          <Link
            href={`/payments/${encodeURIComponent(event.merchantReference)}`}
            className="truncate font-mono text-xs text-primary hover:underline"
          >
            {event.merchantReference}
          </Link>
        )}
      </div>
      <span className="text-xs tabular-nums text-gray-secondary">
        {event.reference ? `${event.reference} · ` : ''}
        {formatDateTime(event.createdAt)}
      </span>
    </li>
  );
}