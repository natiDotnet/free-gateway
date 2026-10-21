import { ROLE_LABELS } from '@org/db';
import { requireAdmin } from '@/lib/session';
import { roleBadge } from '@/lib/ui';
import PasswordChangeForm from './_password-form';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Profile and password management for your own credentials.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Profile</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Name
              </dt>
              <dd>{admin.name}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Email
              </dt>
              <dd className="break-all">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                  {admin.email}
                </code>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Role
              </dt>
              <dd>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${roleBadge(admin.role)}`}
                >
                  {ROLE_LABELS[admin.role]}
                </span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Last login
              </dt>
              <dd className="tabular-nums">
                {admin.lastLoginAt
                  ? new Date(admin.lastLoginAt).toLocaleString()
                  : 'first session'}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Member since
              </dt>
              <dd className="tabular-nums">
                {new Date(admin.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            Changing your password signs out every other session, but keeps
            this one alive.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Change password</h2>
          <PasswordChangeForm />
        </section>
      </div>
    </div>
  );
}
