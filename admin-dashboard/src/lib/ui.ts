/**
 * Shared UI tokens for the admin console.
 *
 * Plain data only — importable from both server components and client
 * components (must NOT import `@org/db`, which is Node-only).
 */

/** Tailwind classes per payment status badge. */
export const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300/60',
  auth_needed: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300/60',
  incomplete: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300/60',
  success: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/60',
  failed: 'bg-red-100 text-red-700 ring-1 ring-red-300/60',
  cancelled: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300/60',
  blocked: 'bg-red-100 text-red-900 ring-1 ring-red-300/60',
};

export function statusBadge(status: string): string {
  return STATUS_BADGE[status] ?? 'bg-slate-200 text-slate-700 ring-1 ring-slate-300/60';
}

/** Tailwind classes per admin role chip. */
export const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800 ring-1 ring-purple-300/60',
  operator: 'bg-sky-100 text-sky-800 ring-1 ring-sky-300/60',
  viewer: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300/60',
};

export function roleBadge(role: string): string {
  return ROLE_BADGE[role] ?? 'bg-slate-200 text-slate-700 ring-1 ring-slate-300/60';
}

/** Audit action → colored chip. */
export function actionChip(action: string): string {
  if (action.startsWith('auth.')) return 'bg-purple-100 text-purple-700';
  if (action.startsWith('payment.')) return 'bg-blue-100 text-blue-700';
  if (action.startsWith('user.')) return 'bg-amber-100 text-amber-800';
  if (action.startsWith('account.')) return 'bg-teal-100 text-teal-700';
  return 'bg-slate-100 text-slate-700';
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
  ],
  operator: [
    'payments.list',
    'payments.detail',
    'payments.verify',
    'payments.cancel',
    'audit.view',
  ],
  viewer: ['payments.list', 'payments.detail'],
};

export const ROLE_LABELS_MIRROR: Record<string, string> = {
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

/** Statuses that an operator/admin can still act on. */
export const OPEN_STATUSES = ['pending', 'auth_needed', 'incomplete'];
