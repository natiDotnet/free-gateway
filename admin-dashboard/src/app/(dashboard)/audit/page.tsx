import { ROLE_LABELS, listAuditEntries, type AuditEntry } from '@org/db';
import { requirePagePermission } from '@/lib/session';
import { actionChip } from '@/lib/ui';

export const dynamic = 'force-dynamic';

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

const th =
  'border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500';

export default async function AuditPage() {
  const admin = await requirePagePermission('audit.view');
  const entries = listAuditEntries(200);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Audit trail</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Who did what, when, from where. Sign-ins, changed roles, payment
          actions and account changes. The latest 200 entries are shown.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing yet — audit entries appear as soon as staff start signing
            in and acting on payments.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Action</th>
                  <th className={th}>Actor</th>
                  <th className={th}>Target</th>
                  <th className={th}>Detail</th>
                  <th className={`${th} text-right`}>IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 tabular-nums">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <code
                        className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] ${actionChip(entry.action)}`}
                      >
                        {entry.action}
                      </code>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {actorLine(entry)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {entry.target ? (
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                          {entry.target}
                        </code>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="max-w-[420px] overflow-hidden border-b border-slate-100 px-3 py-2.5 text-ellipsis whitespace-nowrap">
                      {entry.detail ? (
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                          {JSON.stringify(entry.detail)}
                        </code>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {entry.ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Viewing as {admin.email}. Audit entries are append-only; they record
        admin actions, not provider webhooks (those live in each payment&apos;s
        event timeline).
      </p>
    </div>
  );
}
