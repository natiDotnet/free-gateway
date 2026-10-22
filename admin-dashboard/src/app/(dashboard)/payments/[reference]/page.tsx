import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  getPaymentByMerchantReference,
  getPaymentById,
  getPaymentEventsByPaymentId,
  ROLE_LABELS,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { statusBadge, OPEN_STATUSES } from '@/lib/ui';
import PaymentActions from '../_payment-actions';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ reference: string }> };

export default async function PaymentDetailPage({ params }: Props) {
  const admin = await requirePagePermission('payments.detail');
  const { reference } = await params;

  const payment =
    (await getPaymentByMerchantReference(reference)) ??
    (await getPaymentById(reference));
  if (!payment) notFound();

  const events = await getPaymentEventsByPaymentId(payment.id);
  const openable = OPEN_STATUSES.includes(payment.status);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/payments"
            className="mb-1 inline-block rounded-full border border-slate-200 bg-white px-3 py-0.5 text-xs text-slate-500 hover:text-slate-900"
          >
            ← Payments
          </Link>
          <h1 className="break-all font-mono text-2xl font-bold tracking-tight">
            {payment.merchantReference}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(payment.status)}`}
            >
              {payment.status}
            </span>
            <span className="text-xs text-slate-400">
              provider: {payment.provider}
              {payment.providerReference ? ` · ${payment.providerReference}` : ''}
            </span>
          </p>
        </div>
        {openable && (
          <PaymentActions
            reference={payment.merchantReference}
            status={payment.status}
            canVerify={can(admin.role, 'payments.verify')}
            canCancel={can(admin.role, 'payments.cancel')}
          />
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Amount</h2>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">
            {payment.amount.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
            <span className="ml-1.5 text-base font-semibold text-slate-500">
              {payment.currency}
            </span>
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Checkout URL
              </dt>
              <dd className="break-all">
                {payment.checkoutUrl ? (
                  <a
                    href={payment.checkoutUrl}
                    className="text-teal-700 underline-offset-2 hover:underline"
                  >
                    {payment.checkoutUrl}
                  </a>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Created
              </dt>
              <dd className="tabular-nums">
                {new Date(payment.createdAt).toLocaleString()}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Last update
              </dt>
              <dd className="tabular-nums">
                {new Date(payment.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Customer</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Name', payment.customerName ?? '—'],
              ['Email', payment.customerEmail ?? '—'],
              ['Phone', payment.customerPhone ?? '—'],
              [
                'Return / cancel',
                `${payment.returnUrl ?? '—'} / ${payment.cancelUrl ?? '—'}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {label}
                </dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
          {payment.meta && Object.keys(payment.meta).length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-800">
                Metadata
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(payment.meta, null, 2)}
              </pre>
            </details>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Event timeline</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">
            No provider events recorded yet.
          </p>
        ) : (
          <ol className="ml-1 list-none border-l-2 border-slate-200">
            {events.map((event) => (
              <li
                key={event.id}
                className="relative pb-5 pl-4 last:pb-1"
              >
                <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                    {event.eventType}
                  </code>
                  <span className="text-[11px] text-slate-400">
                    {event.provider}
                    {event.reference ? ` · ${event.reference}` : ''}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                  {new Date(event.createdAt).toLocaleString()}
                </div>
                {event.payload && (
                  <details className="mt-1">
                    <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-800">
                      Payload
                    </summary>
                    <pre className="mt-2 max-w-3xl overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Viewing as {admin.email} ({ROLE_LABELS[admin.role]}). Every action on
        this payment is recorded in the audit trail.
      </p>
    </div>
  );
}
