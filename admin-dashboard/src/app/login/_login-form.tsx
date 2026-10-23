'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Login form following the replicated reference design
 * (measured values in LOGIN-DESIGN-SPEC.md, FreeGateway branding).
 *
 * Behavior is kept local: credentials are posted to the existing
 * /api/auth/login endpoint (email + password + optional long-lived session
 * flag). Controls that reference flows this gateway does not implement
 * (Google SSO, password reset, merchant signup) explain that inline
 * instead of navigating nowhere.
 */

/** Lucide glyphs, inlined so the project does not need lucide-react. */
function Icon({ paths, className }: { paths: string[]; className: string }) {
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

const PHONE_CALL_ICON = [
  'M13 2a9 9 0 0 1 9 9',
  'M13 6a5 5 0 0 1 5 5',
  'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
];
const LOCK_KEYHOLE_ICON = [
  'M12 16a1 1 0 1 0 0-.01Z',
  'M3 12a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  'M7 10V7a5 5 0 0 1 10 0v3',
];
const EYE_ICON = [
  'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
  'M12 12a3 3 0 1 0 0-.01Z',
];
const EYE_OFF_ICON = [
  'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575a1 1 0 0 1 0 .696a10.747 10.747 0 0 1-1.444 2.49',
  'M14.084 14.158a3 3 0 0 1-4.242-4.242',
  'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.159 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143',
  'm2 2 20 20',
];

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Inline informational response for flows this gateway does not have. */
  function notice(message: string) {
    setError(null);
    setNoticeMessage(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNoticeMessage(null), 4000);
  }

  function submitEnabled(): boolean {
    return !busy && email.trim().length > 0 && password.length > 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!submitEnabled()) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch',
        },
        body: JSON.stringify({
          email,
          password,
          next: searchParams.get('next') ?? undefined,
          remember,
        }),
      });

      const body = await response.json().catch(() => null);

      if (response.ok) {
        const redirectTo =
          typeof body?.data?.redirectTo === 'string'
            ? body.data.redirectTo
            : '/payments';
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      if (response.status === 429) {
        const retryAfter = body?.data?.retryAfterSeconds ?? 60;
        setError(
          `Too many failed attempts. Try again in ${Math.ceil(
            Number(retryAfter) / 60
          )} minute(s).`
        );
      } else {
        setError(body?.message ?? 'Sign in failed. Check your credentials.');
      }
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-lg bg-badge-failed px-3.5 py-2.5 text-xs font-medium text-badge-failed-foreground">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
        <div>
          <div className="relative w-full">
            <div className="pointer-events-none absolute top-1/2 left-4 z-10 -translate-y-1/2">
              <Icon paths={PHONE_CALL_ICON} className="h-5 w-5 text-gray-600" />
            </div>
            <div className="pointer-events-none absolute top-1/2 left-12 z-10 h-8 w-px -translate-y-1/2 bg-gray-200" />
            <label className="pointer-events-none absolute top-3 z-10 left-16 text-[10px] font-normal text-gray-400 transition-all">
              Phone Number / Email
              <span className="ml-1 text-red-500">*</span>
            </label>
            <input
              type="text"
              name="phoneOrEmail"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your phone number or email"
              className="border-gray-border hover:border-gray-400 focus:border-primary flex h-[54px] w-full rounded-xl border bg-white pb-2 pl-16 pt-6 text-xs font-medium text-foreground placeholder:text-xs placeholder:text-gray-secondary focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div>
          <div className="relative w-full">
            <div className="pointer-events-none absolute top-1/2 left-4 z-10 -translate-y-1/2">
              <Icon paths={LOCK_KEYHOLE_ICON} className="h-5 w-5 text-gray-600" />
            </div>
            <div className="pointer-events-none absolute top-1/2 left-12 z-10 h-8 w-px -translate-y-1/2 bg-gray-200" />
            <label className="pointer-events-none absolute top-3 z-10 left-16 text-[10px] font-normal text-gray-400 transition-all">
              Password
              <span className="ml-1 text-red-500">*</span>
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="border-gray-border hover:border-gray-400 focus:border-primary flex h-[54px] w-full rounded-xl border bg-white pb-2 pl-16 pr-16 pt-6 text-xs font-medium text-foreground placeholder:text-xs placeholder:text-gray-secondary focus-visible:outline-none focus-visible:ring-0"
            />
            <div className="absolute top-1/2 right-4 -translate-y-1/2">
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="cursor-pointer"
              >
                <Icon
                  paths={showPassword ? EYE_OFF_ICON : EYE_ICON}
                  className="h-5 w-5 text-gray-500"
                />
              </button>
            </div>
          </div>
        </div>

        <div className="flex max-md:flex-col max-md:gap-4 py-2 md:flex-row md:items-center md:justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={remember}
              data-state={remember ? 'checked' : 'unchecked'}
              onClick={() => setRemember((v) => !v)}
              className="peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-gray-300 bg-white shadow-xs outline-none transition-all hover:border-primary hover:bg-gray-50 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white"
            >
              {remember && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <path d="m20 6-11 11-5-5" />
                </svg>
              )}
            </button>
            <input
              type="checkbox"
              aria-hidden="true"
              tabIndex={-1}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="sr-only"
            />
            <p className="font-medium text-gray-secondary text-xs">
              Keep me signed in for 7 days
            </p>
          </label>
          <button
            type="button"
            onClick={() =>
              notice(
                'Password resets are not available in this gateway. Change your password from My account after signing in.'
              )
            }
            className="after:bg-primary text-primary hover:text-primary/80 relative max-md:text-left cursor-pointer text-xs font-medium after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:transition-all after:duration-200 hover:after:w-full"
          >
            Forgot Password ?
          </button>
        </div>

        <button
          data-disabled={!submitEnabled()}
          className="bg-primary disabled:bg-button-disabled group relative inline-flex h-10 w-full shrink-0 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-sm px-4 py-2 text-xs font-semibold leading-none tracking-normal text-white shadow-xs transition-all duration-300 ease-out outline-none normal-case active:scale-[0.995] disabled:cursor-not-allowed disabled:text-white"
          disabled={!submitEnabled()}
          type="submit"
        >
          <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full group-data-disabled:group-hover:-translate-x-full" />
          {busy ? 'Signing in…' : 'Login'}
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="border-gray-border w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="text-gray-secondary bg-white px-2">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            notice('Google sign-in is not configured for this gateway.')
          }
          className="shadow-elevated text-foreground group relative inline-flex h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm bg-transparent px-4 py-2 text-xs font-medium tracking-wide capitalize transition-none outline-none hover:shadow-md"
        >
          <span className="inline-flex items-center justify-center">
            <img
              alt="Google"
              loading="lazy"
              width={20}
              height={20}
              src="/brand/google.svg"
            />
          </span>
          Continue With Google
        </button>
      </form>

      {noticeMessage && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-secondary">
          {noticeMessage}
        </p>
      )}

      <div className="mt-4 text-center md:mt-6">
        <p className="text-gray-secondary text-xs">
          Don&apos;t have an account?{' '}
          <a
            className="after:bg-primary text-primary relative inline-flex cursor-pointer text-xs font-medium transition-all after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.preventDefault();
              notice(
                'Sign-up is not available in this gateway. Administrators are seeded automatically; contact an administrator for staff access.'
              );
            }}
          >
            Sign up
          </a>
        </p>
      </div>
    </>
  );
}
