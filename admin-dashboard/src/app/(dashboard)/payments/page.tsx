import Link from 'next/link';
import { can, listPayments, type Payment } from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { statusBadge, OPEN_STATUSES } from '@/lib/ui';

export const dynamic = 'force-dynamic';

const STATUSES = new Set([
  'pending',
  'auth_needed',
  'incomplete',
  'success',
  'failed',
  'cancelled',
  'blocked',
]);

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    saved?: string;
    error?: string;
  }>;
};

function matches(payment: Payment, q: string): boolean {
  const haystack = [
    payment.merchantReference,
    payment.providerReference ?? '',
    payment.provider,
    payment.customerName ?? '',
    payment.customerEmail ?? '',
    payment.customerPhone ?? '',
    String(payment.amount),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export default async function PaymentsPage({ searchParams }: Props) {
  const admin = await requirePagePermission('payments.list');
  const params = await searchParams;

  const q = (params.q ?? '').trim();
  const statusFilter =
    params.status && STATUSES.has(params.status) ? params.status : '';

  const all = await listPayments();
  const payments = all.filter(
    (p) =>
      (!q || matches(p, q)) && (!statusFilter || p.status === statusFilter)
  );

  const counts = all.reduce(
    (acc, p) => {
      acc.total += 1;
      if (p.status === 'success') acc.success += 1;
      if (OPEN_STATUSES.includes(p.status)) acc.inFlight += 1;
      if (p.status === 'failed' || p.status === 'cancelled' || p.status === 'blocked')
        acc.closed += 1;
      return acc;
    },
    { total: 0, success: 0, inFlight: 0, closed: 0 }
  );

  const canVerify = can(admin.role, 'payments.verify');
  const canCancel = can(admin.role, 'payments.cancel');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Transactions processed by the gateway. Webhooks are the source of
            truth; use <strong>Verify</strong> for a server-side re-check
            before fulfilling.
          </p>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          method="GET"
          action="/payments"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search reference, customer, phone…"
            aria-label="Search payments"
            className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            aria-label="Filter status"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {[...STATUSES].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filter
          </button>
          {(q || statusFilter) && (
            <Link
              href="/payments"
              className="text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Clear
            </Link>
          )}
        </form>
      </header>

      {params.saved === 'verified' && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Payment re-verified successfully.
        </div>
      )}
      {params.saved === 'cancelled' && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Payment cancelled.
        </div>
      )}
      {params.error === 'not_cancellable' && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-900">
          That payment has reached a final status and can no longer be
          cancelled.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total', value: counts.total, tone: 'text-slate-900' },
          { label: 'Successful', value: counts.success, tone: 'text-emerald-700' },
          { label: 'In flight', value: counts.inFlight, tone: 'text-amber-700' },
          { label: 'Failed / cancelled', value: counts.closed, tone: 'text-rose-700' },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {tile.label}
            </span>
            <span className={`text-2xl font-bold tracking-tight ${tile.tone}`}>
              {tile.value}
            </span>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">
          Transactions{' '}
          {payments.length !== all.length && (
            <span className="text-xs font-normal text-slate-400">
              ({payments.length} of {all.length})
            </span>
          )}
        </h2>

        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">
            No transactions match. Initialize one from the checkout app, or
            clear the filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Reference
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Amount
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Customer
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Provider / ref
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Created
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="align-middle">
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <Link
                        href={`/payments/${encodeURIComponent(p.merchantReference)}`}
                        className="font-mono text-[13px] font-semibold text-teal-700 underline-offset-2 hover:underline"
                      >
                        {p.merchantReference}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                      {p.amount} {p.currency}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {p.customerName ? (
                        <span>
                          {p.customerName}
                          {p.customerPhone && (
                            <span className="font-mono text-xs text-slate-400">
                              {' '}
                              · {p.customerPhone}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                      {p.providerReference ? (
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                          {p.providerReference}
                        </code>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {p.provider} · no ref
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 tabular-nums">
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {canVerify && OPEN_STATUSES.includes(p.status) && (
                          <form
                            method="POST"
                            action={`/api/payments/${encodeURIComponent(p.merchantReference)}/verify`}
                          >
                            <button
                              type="submit"
                              className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              Verify
                            </button>
                          </form>
                        )}
                        {canCancel && OPEN_STATUSES.includes(p.status) && (
                          <form
                            method="POST"
                            action={`/api/payments/${encodeURIComponent(p.merchantReference)}/cancel`}
                          >
                            <button
                              type="submit"
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
                            >
                              Cancel
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/payments/${encodeURIComponent(p.merchantReference)}`}
                          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
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
      </section>
    </div>
  );
}
