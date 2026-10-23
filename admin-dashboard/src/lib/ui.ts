/**
 * Shared UI tokens for the admin console.
 *
 * Plain data only — importable from both server components and client
 * components (must NOT import `@org/db`, which is Node-only).
 */

export const OPEN_STATUSES = ['pending', 'auth_needed', 'incomplete'];

/** Tailwind classes per payment status badge (reference badge palette). */
export const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-badge-pending text-badge-pending-foreground',
  auth_needed: 'bg-badge-auth-needed text-badge-auth-needed-foreground',
  incomplete: 'bg-badge-incomplete text-badge-incomplete-foreground',
  success: 'bg-badge-success text-badge-success-foreground',
  failed: 'bg-badge-failed text-badge-failed-foreground',
  cancelled: 'bg-badge-cancelled text-badge-cancelled-foreground',
  blocked: 'bg-badge-blocked text-badge-blocked-foreground',
};

export function statusBadge(status: string): string {
  return STATUS_BADGE[status] ?? 'bg-badge-cancelled text-badge-cancelled-foreground';
}

/** Badge for API-key status. */
export const KEY_BADGE: Record<string, string> = {
  active: 'bg-badge-success text-badge-success-foreground',
  revoked: 'bg-badge-failed text-badge-failed-foreground',
};

export function keyBadge(status: string): string {
  return KEY_BADGE[status] ?? 'bg-badge-cancelled text-badge-cancelled-foreground';
}

/** Webhook delivery status badge. */
export const DELIVERY_BADGE: Record<string, string> = {
  pending: 'bg-badge-pending text-badge-pending-foreground',
  success: 'bg-badge-success text-badge-success-foreground',
  failed: 'bg-badge-failed text-badge-failed-foreground',
};

export function deliveryBadge(status: string): string {
  return DELIVERY_BADGE[status] ?? 'bg-badge-cancelled text-badge-cancelled-foreground';
}

/** HTTP method chip. */
export const METHOD_BADGE: Record<string, string> = {
  GET: 'bg-badge-partial-refund text-badge-partial-refund-foreground',
  POST: 'bg-badge-success text-badge-success-foreground',
  PUT: 'bg-badge-incomplete text-badge-incomplete-foreground',
  PATCH: 'bg-badge-incomplete text-badge-incomplete-foreground',
  DELETE: 'bg-badge-failed text-badge-failed-foreground',
};

export function methodBadge(method: string): string {
  return METHOD_BADGE[method.toUpperCase()] ?? 'bg-badge-cancelled text-badge-cancelled-foreground';
}

/** HTTP status class based on the numeric code. */
export function statusClassBadge(code: number): string {
  if (code >= 500) return 'bg-badge-failed text-badge-failed-foreground';
  if (code >= 400) return 'bg-badge-incomplete text-badge-incomplete-foreground';
  if (code >= 300) return 'bg-badge-cancelled text-badge-cancelled-foreground';
  return 'bg-badge-success text-badge-success-foreground';
}

/** Tailwind classes per admin role chip. */
export const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-badge-auth-needed text-badge-auth-needed-foreground',
  operator: 'bg-badge-partial-refund text-badge-partial-refund-foreground',
  viewer: 'bg-badge-cancelled text-badge-cancelled-foreground',
};

export function roleBadge(role: string): string {
  return ROLE_BADGE[role] ?? 'bg-badge-cancelled text-badge-cancelled-foreground';
}

/** Audit action → colored chip. */
export function actionChip(action: string): string {
  if (action.startsWith('auth.')) return 'bg-badge-auth-needed text-badge-auth-needed-foreground';
  if (action.startsWith('payment.')) return 'bg-nav-hover text-dark-green';
  if (action.startsWith('apikey.')) return 'bg-badge-incomplete text-badge-incomplete-foreground';
  if (action.startsWith('webhook.')) return 'bg-badge-partial-refund text-badge-partial-refund-foreground';
  if (action.startsWith('user.')) return 'bg-badge-pending text-badge-pending-foreground';
  if (action.startsWith('account.')) return 'bg-badge-fully-refunded text-badge-fully-refunded-foreground';
  if (action.startsWith('report.')) return 'bg-badge-otp-required text-badge-otp-required-foreground';
  return 'bg-badge-cancelled text-badge-cancelled-foreground';
}

/** Client-side mirror of the role permission matrix from
 * packages/db/src/prisma.ts (kept in sync manually — the sidebar is a
 * client component and cannot import that Node-only module). */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'payments.list',
    'payments.detail',
    'payments.verify',
    'payments.cancel',
    'users.manage',
    'audit.view',
    'keys.manage',
    'logs.view',
    'webhooks.manage',
    'reports.export',
  ],
  operator: [
    'payments.list',
    'payments.detail',
    'payments.verify',
    'payments.cancel',
    'audit.view',
    'logs.view',
    'webhooks.manage',
    'reports.export',
  ],
  viewer: ['payments.list', 'payments.detail'],
};

export const ROLE_LABELS_MIRROR: Record<string, string> = {
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'payments.list': 'View payments',
  'payments.detail': 'Inspect payments',
  'payments.verify': 'Verify payments',
  'payments.cancel': 'Cancel payments',
  'users.manage': 'Manage staff',
  'audit.view': 'View audit trail',
  'keys.manage': 'Manage API keys',
  'logs.view': 'Inspect request logs',
  'webhooks.manage': 'Manage webhook deliveries',
  'reports.export': 'Export data',
};

/* ------------------------------- formatters ------------------------------ */

export function formatInt(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatDecimal(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/** "1,250.50 ETB" — never aggregates currencies. */
export function formatMoney(amount: number, currency: string): string {
  return `${formatDecimal(amount)} ${currency}`;
}

export function formatDateTime(iso: string): string {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? '—' : new Date(time).toLocaleString();
}

export function formatUtcDay(iso: string): string {
  const time = new Date(iso).getTime();
  return Number.isNaN(time)
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(time);
}

export function maskDestinationUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : `${parsed.pathname.slice(0, 40)}${parsed.pathname.length > 40 ? '…' : ''}`;
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return 'invalid URL';
  }
}
