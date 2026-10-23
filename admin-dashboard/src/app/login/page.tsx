import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/session';
import { ensureBootstrapAdmin } from '@org/db';
import LoginForm from './_login-form';

export const dynamic = 'force-dynamic';

/**
 * /login — server component wraps the client form.
 * Already-authenticated visitors are sent straight to the dashboard
 * (validated against the database, so stale cookies never loop here).
 *
 * Layout follows the replicated reference design (see LOGIN-DESIGN-SPEC.md
 * for measured values); branding is FreeGateway's own.
 */

/** Lucide glyph, inlined so the project does not need lucide-react. */
function LucideIcon({
  paths,
  className,
}: {
  paths: string[];
  className: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** FreeGateway wordmark lockup (project's own mark — "FG" monogram + name). */
const BrandLogo = () => (
  <div className="flex items-center gap-2.5" aria-label="FreeGateway logo">
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-primary text-[14px] font-bold tracking-tight text-secondary">
      FG
    </span>
    <span className="text-[24px] font-bold leading-none tracking-tight text-primary">
      FreeGateway
    </span>
  </div>
);

const USERS_ICON = [
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
  'M16 3.128a4 4 0 0 1 0 7.744',
  'M22 21v-2a4 4 0 0 0-3-3.87',
  'M9 7a4 4 0 1 0 0-.01Z',
];
const HANDSHAKE_ICON = [
  'm11 17 2 2a1 1 0 1 0 3-3',
  'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4',
  'm21 3 1 11h-2',
  'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3',
  'M3 4h8',
];
const CHECK_CIRCLE_ICON = [
  'M21.801 10A10 10 0 1 1 17 3.335',
  'm9 11 3 3L22 4',
];

const FEATURES: string[] = [
  'Optimize sales team management',
  'Boost deal closure',
  'Enhance customer experience',
];

/* eslint-disable react/jsx-key -- icon arrays are created with LucideIcon */
const FEATURE_ICONS = [
  <LucideIcon paths={USERS_ICON} className="h-5 w-5 text-primary" />,
  <LucideIcon paths={HANDSHAKE_ICON} className="h-5 w-5 text-primary" />,
  <LucideIcon paths={CHECK_CIRCLE_ICON} className="h-5 w-5 text-primary" />,
];
/* eslint-enable react/jsx-key */

export default async function LoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect('/payments');

  // Belt & braces: make sure the first admin exists before rendering the form.
  await ensureBootstrapAdmin();

  const bootstrapEmail = (
    process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@freegateway.local'
  )
    .trim()
    .toLowerCase();
  const bootstrapPasswordSet = Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD);

  return (
    <div className="bg-background font-primary flex min-h-screen items-center justify-center overflow-hidden max-lg:p-10 max-md:p-4">
      <div className="flex w-full flex-col items-center gap-3">
        <div className="flex w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:flex-row">
          {/*
            Left panel — brand imagery (47% ≥lg; full-width banner below).
          */}
          <div className="relative flex w-full overflow-hidden bg-slate-800 lg:w-[47%]">
            <img
              src="/brand/login-background.png"
              alt="Background pattern"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="relative z-10 flex w-full flex-col px-6 py-6 md:px-8 lg:px-8 lg:pt-22 lg:pb-22">
              <div className="flex items-center max-md:justify-center">
                <BrandLogo />
              </div>

              <div className="flex w-full flex-1 flex-col items-center justify-start gap-2 md:items-start">
                <h1 className="text-lg font-semibold mt-4 mb-2 w-full max-w-sm text-center text-white md:mt-8 md:mb-3 md:text-left md:text-[30px] md:leading-[36px]">
                  Start closing more deals with FreeGateway
                </h1>

                <div className="mx-auto mt-2 hidden w-full max-w-[300px] flex-col gap-3 md:mx-0 md:mt-4 md:max-w-md lg:flex">
                  {FEATURES.map((feature, index) => (
                    <Fragment key={feature}>
                      <div className="flex w-full items-center gap-3">
                        <div className="bg-primary/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                          {FEATURE_ICONS[index]}
                        </div>
                        <p className="text-sm text-left text-[12px] leading-[1.6] text-white/80">
                          {feature}
                        </p>
                      </div>
                      {index < FEATURES.length - 1 && (
                        <div className="relative h-4 w-full">
                          <img
                            src="/brand/line.png"
                            alt=""
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>

              <div className="text-gray-secondary mt-4 w-full text-center text-xs md:text-white lg:absolute lg:bottom-6 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2">
                <span className="mr-2">©</span>
                <span>2026 All rights reserved by FreeGateway</span>
              </div>
            </div>
          </div>

          {/*
            Right panel — sign-in form (53% ≥lg, centered column ≤327px).
          */}
          <div className="flex w-full items-center justify-center px-6 py-8 md:pt-20 lg:w-[53%] lg:pb-10">
            <div className="w-full max-w-sm md:max-w-[327px]">
              <div className="mb-4 text-center md:mb-6">
                <h2 className="mb-2 text-xl font-bold text-gray-900 md:mb-3 md:text-2xl">
                  Welcome Back
                </h2>
                <p className="text-gray-secondary text-xs">
                  Sign in with your merchant credentials to manage.
                </p>
              </div>
              <LoginForm />
            </div>
          </div>
        </div>

        {/* First-run hint for the seeded bootstrap administrator. */}
        <div className="w-full max-w-[960px] p-3 text-center text-[11px] leading-relaxed text-gray-primary">
          <strong className="font-semibold">First run?</strong> A bootstrap
          administrator is created automatically ({bootstrapEmail}
          {bootstrapPasswordSet
            ? ' — ADMIN_BOOTSTRAP_PASSWORD is set and its value is not shown here'
            : ' — default password ChangeMe!2026'}
          ). Change it from <span className="font-semibold">My account</span> right
          after signing in.
        </div>
      </div>
    </div>
  );
}
