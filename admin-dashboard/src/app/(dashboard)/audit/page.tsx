import Link from 'next/link';
import Pagination from '../_pagination';
import {
  listAuditEntriesPage,
  ROLE_LABELS,
  type AuditEntry,
  type AuditFilters,
} from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { actionChip, formatDateTime } from '@/lib/ui';

export const dynamic = 'force-dynamic';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    target?: string;
    from?: string;
    to?: string;
    page?: string;
    perPage?: string;
  }>;
};

const ACTION_PREFIXES = [
  { prefix: '', label: 'All actions' },
  { prefix: 'auth.', label: 'Sign-ins' },
  { prefix: 'payment.', label: 'Payment actions' },
  { prefix: 'apikey.', label: 'API keys' },
  { prefix: 'user.', label: 'User admin' },
  { prefix: 'account.', label: 'Account changes' },
  { prefix: 'webhook.', label: 'Webhook retries' },
  { prefix: 'report.', label: 'Exports' },
];

function actorLine(entry: AuditEntry): string {
  if (entry.actorEmail) {
    if (entry.actorRole && ROLE_LABELS[entry.actorRole as 'admin']) {
      const role = ROLE_LABELS[entry.actorRole as 'admin'];
      return `${entry.actorEmail} (${role})`;
    }
    return entry.actorEmail;
  }
  if (entry.action === 'auth.login.failed') return 'unknown / anonymous';
  return 'system';
}

export default async function AuditPage({ searchParams }: Props) {
  await requirePagePermission('audit.view');
  const params = await searchParams;

  const actionPrefix = ACTION_PREFIXES.some(
    (entry) => entry.prefix && entry.prefix === params.action
  )
    ? params.action!
    : '';
  const actor = (params.actor ?? '').trim();
  const target = (params.target ?? '').trim();
  const fromDay = ISO_DAY.test(params.from ?? '') ? params.from!.slice(0, 10) : '';
  const toDay = ISO_DAY.test(params.to ?? '') ? params.to!.slice(0, 10) : '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const parsedPerPage = Number.parseInt(params.perPage ?? '', 10);
  const perPage = [10, 20, 50].includes(parsedPerPage) ? parsedPerPage : PAGE_SIZE;

  const filters: AuditFilters = {
    actionPrefix: actionPrefix || undefined,
    actorEmail: actor || undefined,
    target: target || undefined,
    fromDay: fromDay || undefined,
    toDay: toDay || undefined,
  };

  const { rows, total, pageSize } = await listAuditEntriesPage(filters, page, perPage);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 tracking-tight">Audit trail</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
          Who did what, when, from where: sign-ins, role changes, payment
          actions, API-key lifecycle, webhook retries and report exports.
          Append-only, {formatInt(total)} matching entries (latest shown first).
        </p>
      </header>

      <form
        method="GET"
        action="/audit"
        className="flex flex-wrap items-end gap-3 card p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Action group
          <select
            name="action"
            defaultValue={actionPrefix}
            className="field select min-w-36"
          >
            {ACTION_PREFIXES.map((entry) => (
              <option key={entry.prefix} value={entry.prefix}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Actor / target contains
          <input
            type="search"
            name="actor"
            defaultValue={actor}
            placeholder="email…"
            className="field w-52"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          Target contains
          <input
            type="search"
            name="target"
            defaultValue={target}
            placeholder="reference, prefix, id…"
            className="field w-52"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-primary">
          From
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
          <button
            type="submit"
            className="btn btn-primary"
          >
            Apply
          </button>
          {(actionPrefix || actor || target || fromDay || toDay) && (
            <Link href="/audit" className="btn btn-secondary btn-sm">
              Clear
            </Link>
          )}
        </div>
      </form>

      <section className="overflow-hidden card">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-secondary">
            No audit entries match. Entries appear as soon as staff sign in and
            act on payments, keys, users or settings.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-background-alt">
                <tr>
                  {['When', 'Action', 'Actor', 'Target', 'Detail', 'IP'].map((label, index) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-xs font-semibold text-gray-primary border-l border-gray-border first:border-l-0 ${index === 5 ? 'text-right' : 'text-left'}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap border-b border-gray-border px-4 py-3.5 text-xs tabular-nums text-gray-secondary">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5">
                      <code
                        className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] ${actionChip(entry.action)}`}
                      >
                        {entry.action}
                      </code>
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 text-sm text-gray-primary">
                      {actorLine(entry)}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5">
                      {entry.target ? (
                        <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs text-gray-primary">
                          {entry.target.length > 48 ? `${entry.target.slice(0, 48)}…` : entry.target}
                        </code>
                      ) : (
                        <span className="text-gray-secondary/50">—</span>
                      )}
                    </td>
                    <td className="max-w-[420px] overflow-hidden border-b border-gray-border px-4 py-3.5 text-ellipsis whitespace-nowrap">
                      {entry.detail ? (
                        <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-[11px] text-gray-primary">
                          {JSON.stringify(entry.detail)}
                        </code>
                      ) : (
                        <span className="text-gray-secondary/50">—</span>
                      )}
                    </td>
                    <td className="border-b border-gray-border px-4 py-3.5 text-right tabular-nums text-xs text-gray-secondary">
                      {entry.ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          basePath="/audit"
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          params={params}
        />
      </section>

      <p className="text-xs text-gray-secondary">
        Audit records are append-only from this console — there is no edit or delete
        surface. They record administrative actions, not provider webhooks (those
        live in each payment&apos;s event timeline and on the{' '}
        <Link href="/webhooks" className="underline-offset-2 hover:underline">
          Webhooks
        </Link>{' '}
        page).
      </p>
    </div>
  );
}

function formatInt(value: number): string {
  return new Intl.NumberFormat().format(value);
}
