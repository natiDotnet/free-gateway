import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/session';
import { ensureBootstrapAdmin } from '@org/db';
import LoginForm from './_login-form';

export const dynamic = 'force-dynamic';

/**
 * /login — server component wraps the client form.
 * Already-authenticated visitors are sent straight to the dashboard
 * (validated against the database, so stale cookies never loop here).
 */
export default async function LoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect('/payments');

  // Belt & braces: make sure the first admin exists before rendering the form.
  ensureBootstrapAdmin();

  const bootstrapEmail = (
    process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@freegateway.local'
  )
    .trim()
    .toLowerCase();
  const bootstrapPasswordSet = Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-base font-black text-emerald-800">
            FG
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              FreeGateway Admin
            </h1>
            <p className="text-xs text-slate-500">
              Payments, providers &amp; audit — sign in to continue
            </p>
          </div>
        </div>
        <LoginForm />
      </div>

      <div className="w-full max-w-sm rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-xs leading-relaxed text-slate-500">
        <strong className="text-slate-700">First run?</strong> A bootstrap
        administrator is created automatically:{' '}
        <code className="rounded bg-slate-100 px-1 py-px text-[11px] text-slate-700">
          {bootstrapEmail}
        </code>{' '}
        with the default password{' '}
        <code className="rounded bg-slate-100 px-1 py-px text-[11px] text-slate-700">
          ChangeMe!2026
        </code>
        {bootstrapPasswordSet
          ? ' (overridden via ADMIN_BOOTSTRAP_PASSWORD — value not shown here)'
          : ''}
        . Change it from <span className="font-semibold">My account</span> right
        after signing in.
      </div>
    </div>
  );
}
