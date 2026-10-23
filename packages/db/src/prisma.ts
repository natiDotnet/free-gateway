import { PrismaClient, type Prisma } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'nx.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const workspaceRoot = findWorkspaceRoot(process.cwd());
loadEnv({ path: join(workspaceRoot, '.env') });

export const DATABASE_PROVIDER = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
const supportedProviders = new Set(['sqlite', 'postgresql', 'mysql']);
if (!supportedProviders.has(DATABASE_PROVIDER)) {
  throw new Error(
    `Unsupported DATABASE_PROVIDER "${DATABASE_PROVIDER}". Choose sqlite, postgresql, or mysql.`
  );
}

if (!process.env.DATABASE_URL) {
  if (DATABASE_PROVIDER !== 'sqlite') {
    throw new Error(`DATABASE_URL is required when DATABASE_PROVIDER=${DATABASE_PROVIDER}.`);
  }
  const sqlitePath = resolve(workspaceRoot, process.env.DATABASE_PATH ?? 'dev.sqlite');
  process.env.DATABASE_URL = pathToFileURL(sqlitePath).href;
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export type PaymentStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'incomplete'
  | 'auth_needed'
  | 'blocked';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'pending',
  'success',
  'failed',
  'cancelled',
  'incomplete',
  'auth_needed',
  'blocked',
] as const;

/** Statuses from which no further automatic progression is expected. */
export const RESOLVED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'success',
  'failed',
  'cancelled',
  'incomplete',
  'blocked',
] as const;

export interface Payment {
  id: string;
  merchantReference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  providerReference: string | null;
  provider: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  meta: Record<string, unknown> | null;
  returnUrl: string | null;
  cancelUrl: string | null;
  notificationUrl: string | null;
  day: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEvent {
  id: string;
  paymentId: string;
  eventType: string;
  provider: string;
  reference: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  /** Present on cross-payment listings (webhook monitoring), absent otherwise. */
  merchantReference?: string | null;
  paymentStatus?: string | null;
}

export interface CreatePaymentInput {
  merchantReference: string;
  amount: number;
  currency: string;
  customer?: { name?: string; email?: string; phone?: string };
  meta?: Record<string, unknown>;
  returnUrl?: string;
  cancelUrl?: string;
  notificationUrl?: string;
  provider?: string;
}

export type AdminRole = 'admin' | 'operator' | 'viewer';
export type AdminPermission =
  | 'payments.list'
  | 'payments.detail'
  | 'payments.verify'
  | 'payments.cancel'
  | 'users.manage'
  | 'audit.view'
  | 'keys.manage'
  | 'logs.view'
  | 'webhooks.manage'
  | 'reports.export';

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
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

export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

export function isAdminRole(value: unknown): value is AdminRole {
  return value === 'admin' || value === 'operator' || value === 'viewer';
}

export function can(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Explicit list of permissions for a role (client/server contract helper). */
export function permissionsForRole(role: AdminRole): AdminPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface CreateAdminUserInput {
  email: string;
  name: string;
  role: AdminRole;
  password: string;
}

function parseJson<T>(value: string | null): T | null {
  return value ? (JSON.parse(value) as T) : null;
}

function toPayment(row: Prisma.PaymentGetPayload<{}>): Payment {
  return {
    id: row.id,
    merchantReference: row.merchantReference,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentStatus,
    checkoutUrl: row.checkoutUrl,
    providerReference: row.providerReference,
    provider: row.provider,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    meta: parseJson<Record<string, unknown>>(row.meta),
    returnUrl: row.returnUrl,
    cancelUrl: row.cancelUrl,
    notificationUrl: row.notificationUrl,
    day: row.day,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPaymentEvent(row: Prisma.PaymentEventGetPayload<{}>): PaymentEvent {
  return {
    id: row.id,
    paymentId: row.paymentId,
    eventType: row.eventType,
    provider: row.provider,
    reference: row.reference,
    payload: parseJson<Record<string, unknown>>(row.payload),
    createdAt: row.createdAt,
  };
}

function toAdminUser(row: Prisma.AdminUserGetPayload<{}>): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: isAdminRole(row.role) ? row.role : 'viewer',
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastLoginAt: row.lastLoginAt,
  };
}

function toAuditEntry(row: Prisma.AuditLogGetPayload<{}>): AuditEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    actorRole: row.actorRole,
    action: row.action,
    target: row.target,
    detail: parseJson<Record<string, unknown>>(row.detail),
    ip: row.ip,
    createdAt: row.createdAt,
  };
}

export function paymentDayKey(isoDate: string): string {
  const time = new Date(isoDate).getTime();
  return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, 10);
}

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const now = new Date().toISOString();
  const row = await db.payment.create({
    data: {
      id: input.merchantReference,
      merchantReference: input.merchantReference,
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      customerName: input.customer?.name ?? null,
      customerEmail: input.customer?.email ?? null,
      customerPhone: input.customer?.phone ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      returnUrl: input.returnUrl ?? null,
      cancelUrl: input.cancelUrl ?? null,
      notificationUrl: input.notificationUrl ?? null,
      provider: input.provider ?? 'chapa',
      day: paymentDayKey(now),
      createdAt: now,
      updatedAt: now,
    },
  });
  return toPayment(row);
}

export async function getPaymentById(id: string): Promise<Payment | undefined> {
  const row = await db.payment.findUnique({ where: { id } });
  return row ? toPayment(row) : undefined;
}

export async function getPaymentByMerchantReference(
  merchantReference: string
): Promise<Payment | undefined> {
  const row = await db.payment.findUnique({ where: { merchantReference } });
  return row ? toPayment(row) : undefined;
}

export async function getPaymentByProviderReference(
  providerReference: string
): Promise<Payment | undefined> {
  const row = await db.payment.findUnique({ where: { providerReference } });
  return row ? toPayment(row) : undefined;
}

export async function listPayments(): Promise<Payment[]> {
  const rows = await db.payment.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toPayment);
}

export async function findOpenPaymentByAmount(
  currency: string,
  amount: number
): Promise<Payment | undefined> {
  const where = {
    currency,
    amount: { gte: amount - 0.005, lt: amount + 0.005 },
  };
  const authNeeded = await db.payment.findFirst({
    where: {
      ...where,
      status: 'auth_needed',
    },
    orderBy: { createdAt: 'desc' },
  });
  const row = authNeeded ?? await db.payment.findFirst({
    where: { ...where, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  return row ? toPayment(row) : undefined;
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  patch?: { providerReference?: string }
): Promise<Payment | undefined> {
  const now = new Date().toISOString();
  const result = await db.payment.updateMany({
    where: { id },
    data: {
      status,
      updatedAt: now,
      ...(patch?.providerReference ? { providerReference: patch.providerReference } : {}),
    },
  });
  return result.count ? getPaymentById(id) : undefined;
}

export async function updatePaymentProvider(id: string, provider: string): Promise<void> {
  await db.payment.updateMany({
    where: { id },
    data: { provider, updatedAt: new Date().toISOString() },
  });
}

export async function updatePaymentDetails(
  id: string,
  input: Pick<Payment, 'amount' | 'currency' | 'customerName' | 'customerEmail' | 'customerPhone' | 'meta' | 'returnUrl' | 'cancelUrl' | 'notificationUrl'>
): Promise<Payment | undefined> {
  const now = new Date().toISOString();
  const result = await db.payment.updateMany({
    where: { id, status: 'pending' },
    data: {
      amount: input.amount,
      currency: input.currency,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      notificationUrl: input.notificationUrl,
      updatedAt: now,
    },
  });
  return result.count ? getPaymentById(id) : undefined;
}

/* ==================================================================== */
/* Payment queries & aggregation (server-side pagination)               */
/* ==================================================================== */

export async function listDistinctPaymentProviders(): Promise<string[]> {
  const grouped = await db.payment.groupBy({ by: ['provider'], _count: { _all: true } });
  return grouped.map((row) => row.provider).sort();
}

export async function listDistinctCurrencies(): Promise<string[]> {
  const grouped = await db.payment.groupBy({ by: ['currency'], _count: { _all: true } });
  return grouped.map((row) => row.currency).sort();
}

export interface PaymentFilters {
  q?: string;
  status?: PaymentStatus;
  provider?: string;
  currency?: string;
  /** ISO date (inclusive), e.g. "2026-10-01" */
  fromDay?: string;
  toDay?: string;
  /** Created-at lower bound (ms epoch), for export of exact ranges */
  createdFromMs?: number;
  createdToMs?: number;
}

function paymentWhere(filters: PaymentFilters): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.provider) where.provider = filters.provider;
  if (filters.currency) where.currency = filters.currency;
  const dayRange: Prisma.StringFilter = {} as Prisma.StringFilter;
  if (filters.fromDay) dayRange.gte = filters.fromDay;
  if (filters.toDay) dayRange.lte = filters.toDay;
  if (dayRange.gte || dayRange.lte) where.day = dayRange;
  if (filters.createdFromMs != null || filters.createdToMs != null) {
    where.createdAt = {
      ...(filters.createdFromMs != null ? { gte: new Date(filters.createdFromMs).toISOString() } : {}),
      ...(filters.createdToMs != null ? { lt: new Date(filters.createdToMs).toISOString() } : {}),
    };
  }
  const q = filters.q?.trim();
  if (q) {
    const contains = ciContains(q);
    where.OR = [
      { merchantReference: contains },
      { providerReference: contains },
      { provider: contains },
      { customerName: contains },
      { customerEmail: contains },
      { customerPhone: contains },
    ];
  }
  return where;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listPaymentsPage(
  filters: PaymentFilters,
  page = 1,
  pageSize = 25
): Promise<PaginatedResult<Payment>> {
  const safePageSize = Math.min(Math.max(1, pageSize), 100);
  const safePage = Math.max(1, page);
  const where = paymentWhere(filters);
  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    db.payment.count({ where }),
  ]);
  return { rows: rows.map(toPayment), total, page: safePage, pageSize: safePageSize };
}

export async function countPaymentsByStatus(
  filters: PaymentFilters = {}
): Promise<Record<PaymentStatus, number>> {
  const counts = await db.payment.groupBy({
    by: ['status'],
    where: paymentWhere(filters),
    _count: { _all: true },
  });
  const result = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, 0])) as Record<
    PaymentStatus,
    number
  >;
  for (const row of counts) {
    if (row.status in result) {
      result[row.status as PaymentStatus] = row._count._all;
    }
  }
  return result;
}

/** Payments created per UTC day inside the given range (uses the `day` column). */
export async function countPaymentsByDay(
  filters: PaymentFilters & { afterMs: number; beforeMs: number }
): Promise<Map<string, number>> {
  const { afterMs, beforeMs, ...rest } = filters;
  const where = paymentWhere({ ...rest, createdFromMs: afterMs, createdToMs: beforeMs });
  const grouped = await db.payment.groupBy({
    by: ['day'],
    where,
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.day, row._count._all]));
}

export async function countPaymentsByProviderWithin(
  afterMs: number,
  beforeMs: number,
  filters: PaymentFilters = {}
): Promise<Map<string, number>> {
  const where = paymentWhere({
    ...filters,
    createdFromMs: afterMs,
    createdToMs: beforeMs,
  });
  const grouped = await db.payment.groupBy({
    by: ['provider'],
    where,
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.provider, row._count._all]));
}

export async function successfulValueByCurrencyWithin(
  afterMs: number,
  beforeMs: number,
  filters: PaymentFilters = {}
): Promise<Map<string, number>> {
  const where = paymentWhere({
    ...filters,
    status: 'success',
    createdFromMs: afterMs,
    createdToMs: beforeMs,
  });
  const grouped = await db.payment.groupBy({
    by: ['currency'],
    where,
    _sum: { amount: true },
  });
  return new Map(
    grouped
      .filter((row) => row._sum.amount != null)
      .map((row) => [row.currency, row._sum.amount ?? 0])
  );
}

/**
 * Backfill the `day` column for payments created before it existed.
 * Idempotent and cheap; safe to call at app startup.
 */
export async function ensurePaymentDaysBackfilled(): Promise<number> {
  const missing = await db.payment.findMany({
    where: { day: '' },
    select: { id: true, createdAt: true },
    take: 1000,
  });
  for (const row of missing) {
    await db.payment.update({
      where: { id: row.id },
      data: { day: paymentDayKey(row.createdAt) },
    });
  }
  return missing.length;
}

/** Rows for CSV export. Server-side filtered, capped, ordered oldest→newest. */
export async function paymentsForExport(
  filters: PaymentFilters,
  maxRows = 10_000
): Promise<Payment[]> {
  const rows = await db.payment.findMany({
    where: paymentWhere(filters),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.min(maxRows, 50_000),
  });
  return rows.map(toPayment);
}

export async function createPaymentEvent(input: {
  paymentId: string;
  eventType: string;
  provider: string;
  reference?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<PaymentEvent> {
  const row = await db.paymentEvent.create({
    data: {
      id: `${input.eventType}-${Date.now()}-${randomUUID()}`,
      paymentId: input.paymentId,
      eventType: input.eventType,
      provider: input.provider,
      reference: input.reference ?? null,
      payload: input.payload ? JSON.stringify(input.payload) : null,
      createdAt: new Date().toISOString(),
    },
  });
  return toPaymentEvent(row);
}

export async function getPaymentEventsByPaymentId(paymentId: string): Promise<PaymentEvent[]> {
  const rows = await db.paymentEvent.findMany({
    where: { paymentId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toPaymentEvent);
}

/** Recent provider events across all payments (inbound webhook monitoring). */
export async function listRecentPaymentEvents(
  limit = 50,
  provider?: string
): Promise<PaymentEvent[]> {
  const rows = await db.paymentEvent.findMany({
    where: provider ? { provider } : undefined,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(1, limit), 200),
    include: { payment: { select: { merchantReference: true, status: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    paymentId: row.paymentId,
    eventType: row.eventType,
    provider: row.provider,
    reference: row.reference,
    payload: parseJson<Record<string, unknown>>(row.payload),
    createdAt: row.createdAt,
    merchantReference: row.payment?.merchantReference ?? null,
    paymentStatus: row.payment?.status ?? null,
  }));
}

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function assertValidPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Password must be at least 10 characters');
  }
  if (password.length > 128) throw new Error('Password must be at most 128 characters');
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toAdminUser);
}

export async function findAdminUserById(id: string): Promise<AdminUser | undefined> {
  const row = await db.adminUser.findUnique({ where: { id } });
  return row ? toAdminUser(row) : undefined;
}

export async function findAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
  const row = await db.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  return row ? toAdminUser(row) : undefined;
}

export async function hasAdminUsers(): Promise<boolean> {
  return (await db.adminUser.count()) > 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Portable case-insensitive `contains` filter.
 *
 * SQLite and MySQL compare `contains` case-insensitively for ASCII by
 * default; PostgreSQL uses `LIKE` (case-sensitive), so the Prisma
 * `mode: "insensitive"` flag is added there. The generated client type for
 * the active provider decides whether `mode` exists in the filter type; the
 * extra optional key is structurally ignored elsewhere.
 */
export function ciContains(value: string): { contains: string; mode?: 'insensitive' } {
  return DATABASE_PROVIDER === 'postgresql'
    ? { contains: value, mode: 'insensitive' }
    : { contains: value };
}

export async function createAdminUser(
  input: CreateAdminUserInput,
  actor?: AdminUser | null
): Promise<AdminUser> {
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const role = isAdminRole(input.role) ? input.role : 'viewer';
  const password = String(input.password ?? '');

  if (!EMAIL_RE.test(email)) throw new Error('VALIDATION-email');
  if (name.length < 1 || name.length > 80) throw new Error('VALIDATION-name');
  assertValidPassword(password);

  const now = new Date().toISOString();
  const row = await db.adminUser.create({
    data: {
      id: randomUUID(),
      email,
      name,
      role,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    },
  });
  const user = toAdminUser(row);
  await recordAudit({
    action: 'user.create',
    actor: actor ?? null,
    target: email,
    detail: { userId: user.id, role, name },
  });
  return user;
}

export async function updateAdminUserRole(
  id: string,
  role: AdminRole,
  actor?: AdminUser | null
): Promise<AdminUser> {
  if (!isAdminRole(role)) throw new Error('VALIDATION-role');
  if (!(await db.adminUser.findUnique({ where: { id }, select: { id: true } }))) {
    throw new Error('NOT_FOUND');
  }
  const user = toAdminUser(
    await db.adminUser.update({
      where: { id },
      data: { role, updatedAt: new Date().toISOString() },
    })
  );
  await recordAudit({ action: 'user.role_change', actor: actor ?? null, target: id, detail: { role } });
  return user;
}

export async function setAdminUserActive(
  id: string,
  isActive: boolean,
  actor?: AdminUser | null
): Promise<AdminUser> {
  if (!(await db.adminUser.findUnique({ where: { id }, select: { id: true } }))) {
    throw new Error('NOT_FOUND');
  }
  const row = await db.adminUser.update({
    where: { id },
    data: { isActive, updatedAt: new Date().toISOString() },
  });
  if (!isActive) await destroyAllSessionsForUser(id);
  await recordAudit({
    action: isActive ? 'user.activate' : 'user.deactivate',
    actor: actor ?? null,
    target: id,
  });
  return toAdminUser(row);
}

export async function resetAdminPassword(
  id: string,
  newPassword: string,
  actor?: AdminUser | null
): Promise<AdminUser> {
  assertValidPassword(newPassword);
  if (!(await db.adminUser.findUnique({ where: { id }, select: { id: true } }))) {
    throw new Error('NOT_FOUND');
  }
  const row = await db.adminUser.update({
    where: { id },
    data: { passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() },
  });
  await destroyAllSessionsForUser(id);
  await recordAudit({ action: 'user.reset_password', actor: actor ?? null, target: id });
  return toAdminUser(row);
}

export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<AdminUser | null> {
  const row = await db.adminUser.findUnique({ where: { email: String(email ?? '').trim().toLowerCase() } });
  if (!row) {
    scryptSync('decoy', 'decoy-salt', SCRYPT_KEYLEN);
    return null;
  }
  if (!verifyPassword(String(password ?? ''), row.passwordHash) || !row.isActive) return null;

  const updated = await db.adminUser.update({
    where: { id: row.id },
    data: {
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  return toAdminUser(updated);
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepToken?: string
): Promise<AdminUser> {
  assertValidPassword(newPassword);
  const row = await db.adminUser.findUnique({ where: { id: userId } });
  if (!row) throw new Error('NOT_FOUND');
  if (!verifyPassword(String(currentPassword ?? ''), row.passwordHash)) {
    throw new Error('WRONG_CURRENT_PASSWORD');
  }

  const updated = await db.adminUser.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() },
  });
  if (keepToken) await destroyAllSessionsForUser(userId, sha256(keepToken));
  await recordAudit({ action: 'account.password_change', target: userId });
  return toAdminUser(updated);
}

const SESSION_TTL_HOURS = Math.max(1, Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 8));

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function purgeExpiredSessions(): Promise<void> {
  await db.adminSession.deleteMany({
    where: { expiresAt: { lt: new Date().toISOString() } },
  });
}

export async function createAdminSession(
  userId: string,
  ttlHours?: number
): Promise<{ token: string; expiresAt: string }> {
  await purgeExpiredSessions();
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const ttl = Math.max(1, Math.round(ttlHours ?? SESSION_TTL_HOURS));
  const expiresAt = new Date(now.getTime() + ttl * 3600 * 1000);
  await db.adminSession.create({
    data: {
      tokenHash: sha256(token),
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function getAdminUserBySessionToken(token: string): Promise<AdminUser | null> {
  if (!token || token.length < 32) return null;
  const session = await db.adminSession.findFirst({
    where: {
      tokenHash: sha256(token),
      expiresAt: { gt: new Date().toISOString() },
      user: { isActive: true },
    },
    include: { user: true },
  });
  return session ? toAdminUser(session.user) : null;
}

export async function destroyAdminSession(token: string): Promise<void> {
  await db.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function destroyAllSessionsForUser(
  userId: string,
  keepTokenHash?: string
): Promise<void> {
  await db.adminSession.deleteMany({
    where: { userId, ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}) },
  });
}

export async function recordAudit(entry: {
  action: string;
  actor?: AdminUser | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      id: randomUUID(),
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? null,
      actorRole: entry.actor?.role ?? null,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail ? JSON.stringify(entry.detail) : null,
      ip: entry.ip ?? null,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function listAuditEntries(limit = 200): Promise<AuditEntry[]> {
  const clamped = Math.min(Math.max(1, limit), 500);
  const rows = await db.auditLog.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: clamped,
  });
  return rows.map(toAuditEntry);
}

export interface AuditFilters {
  /** e.g. "auth." or "payment.verify" — prefix match */
  actionPrefix?: string;
  actorEmail?: string;
  target?: string;
  fromDay?: string;
  toDay?: string;
}

function auditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actionPrefix) where.action = { startsWith: filters.actionPrefix };
  if (filters.actorEmail) {
    const contains = ciContains(filters.actorEmail);
    where.OR = [{ actorEmail: contains }, { target: contains }];
  }
  if (filters.target) where.target = ciContains(filters.target);
  if (filters.fromDay || filters.toDay) {
    where.createdAt = {
      ...(filters.fromDay ? { gte: `${filters.fromDay}T00:00:00.000Z` } : {}),
      ...(filters.toDay ? { lt: nextDayStartISO(filters.toDay) } : {}),
    };
  }
  return where;
}

function nextDayStartISO(day: string): string {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(Number.isNaN(time) ? 0 : time + 24 * 3600 * 1000).toISOString();
}

export async function listAuditEntriesPage(
  filters: AuditFilters,
  page = 1,
  pageSize = 50
): Promise<PaginatedResult<AuditEntry>> {
  const safePageSize = Math.min(Math.max(1, pageSize), 100);
  const safePage = Math.max(1, page);
  const where = auditWhere(filters);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    db.auditLog.count({ where }),
  ]);
  return { rows: rows.map(toAuditEntry), total, page: safePage, pageSize: safePageSize };
}

export async function ensureBootstrapAdmin(): Promise<void> {
  if (await hasAdminUsers()) return;

  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@freegateway.local')
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'ChangeMe!2026';
  const name = process.env.ADMIN_BOOTSTRAP_NAME ?? 'Gateway Admin';

  await createAdminUser({ email, name, role: 'admin', password });
  console.warn(
    `[db] bootstrapped first admin: ${email} (role: admin).\n[db] The default password should be changed immediately — see /account,\n[db] or override via ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD / ADMIN_BOOTSTRAP_NAME.`
  );
}

/* ==================================================================== */
/* API keys (gateway credentials)                                       */
/* ==================================================================== */

export const API_KEY_SCOPES = ['payments.init'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_PREFIX_MARKER = 'fgk_';
const API_KEY_SECRET_LENGTH = 32; // hex chars of entropy

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === 'string' && (API_KEY_SCOPES as readonly string[]).includes(value);
}

function parseScopes(raw: string | null): ApiKeyScope[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isApiKeyScope) : [];
  } catch {
    return [];
  }
}

export type ApiKeyStatus = 'active' | 'revoked';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  fingerprint: string;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  rotatedFromId: string | null;
}

export interface ApiKeyCreated {
  key: ApiKey;
  /** The full secret, e.g. "fgk_a1b2…secret-part" — shown exactly once. */
  secret: string;
}

function toApiKey(row: Prisma.ApiKeyGetPayload<{}>): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    fingerprint: row.fingerprint,
    scopes: parseScopes(row.scopes),
    status: row.status === 'revoked' ? 'revoked' : 'active',
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy,
    rotatedFromId: row.rotatedFromId,
  };
}

export interface CreateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string | null;
  actor?: AdminUser | null;
  rotatedFromId?: string | null;
}

/**
 * Generate a new API key. Returns the plaintext secret exactly once — it is
 * never stored (only its SHA-256 hash) and never logged.
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
  const name = String(input.name ?? '').trim();
  if (name.length < 1 || name.length > 80) throw new Error('VALIDATION-name');
  const scopes = [...new Set(input.scopes.filter(isApiKeyScope))];
  if (scopes.length === 0) throw new Error('VALIDATION-scopes');

  const body = randomBytes(API_KEY_SECRET_LENGTH).toString('hex');
  const prefix = API_KEY_PREFIX_MARKER + body.slice(0, 8);
  const secret = `${API_KEY_PREFIX_MARKER}${body}`;
  const now = new Date().toISOString();

  const row = await db.apiKey.create({
    data: {
      id: randomUUID(),
      name,
      prefix,
      secretHash: sha256Hex(secret),
      fingerprint: body.slice(-4),
      scopes: JSON.stringify(scopes),
      createdById: input.actor?.id ?? null,
      createdByEmail: input.actor?.email ?? null,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
      rotatedFromId: input.rotatedFromId ?? null,
    },
  });

  await recordAudit({
    action: 'apikey.create',
    actor: input.actor ?? null,
    target: prefix,
    detail: { name, scopes, expiresAt: input.expiresAt ?? null, rotatedFromId: input.rotatedFromId ?? null },
  });
  return { key: toApiKey(row), secret };
}

export interface ApiKeyFilters {
  status?: ApiKeyStatus;
  q?: string;
}

export async function listApiKeys(filters: ApiKeyFilters = {}): Promise<ApiKey[]> {
  const where: Prisma.ApiKeyWhereInput = {};
  if (filters.status) where.status = filters.status;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { name: ciContains(q) },
      { prefix: ciContains(q) },
      { createdByEmail: ciContains(q) },
    ];
  }
  const rows = await db.apiKey.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(toApiKey);
}

export async function getApiKeyById(id: string): Promise<ApiKey | undefined> {
  const row = await db.apiKey.findUnique({ where: { id } });
  return row ? toApiKey(row) : undefined;
}

/**
 * Rotate a key: revoke the original and issue a replacement with the same
 * name and scopes. The replacement is linked to the original for lineage.
 */
export async function rotateApiKey(
  id: string,
  actor?: AdminUser | null
): Promise<ApiKeyCreated | null> {
  const existing = await db.apiKey.findUnique({ where: { id } });
  if (!existing) return null;

  const revokedKey = await revokeApiKey(id, actor);
  if (!revokedKey) return null;

  const created = await createApiKey({
    name: `${existing.name} (rotated)`.slice(0, 80),
    scopes: parseScopes(existing.scopes),
    expiresAt: existing.expiresAt,
    actor,
    rotatedFromId: existing.id,
  });

  await db.apiKey.update({
    where: { id: created.key.id },
    data: {
      name: existing.name,
      rotatedFromId: existing.id,
      updatedAt: new Date().toISOString(),
    },
  });
  await db.apiKey.update({
    where: { id: existing.id },
    data: { rotatedToId: created.key.id, updatedAt: new Date().toISOString() },
  });
  created.key = toApiKey(
    (await db.apiKey.findUnique({ where: { id: created.key.id } }))!
  );
  return created;
}

export async function revokeApiKey(
  id: string,
  actor?: AdminUser | null
): Promise<ApiKey | null> {
  const existing = await db.apiKey.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.status === 'revoked') return toApiKey(existing);

  const now = new Date().toISOString();
  const row = await db.apiKey.update({
    where: { id },
    data: { status: 'revoked', revokedAt: now, revokedBy: actor?.email ?? null, updatedAt: now },
  });
  await recordAudit({
    action: 'apikey.revoke',
    actor: actor ?? null,
    target: existing.prefix,
    detail: { name: existing.name },
  });
  return toApiKey(row);
}

export interface ApiKeyAuthResult {
  id: string;
  prefix: string;
  scopes: ApiKeyScope[];
  /** Deferred lastUsedAt update — fire-and-forget by the caller. */
  touchUsed: () => Promise<void>;
}

/**
 * Authenticate a gateway API request against an `Authorization: Bearer fga_…`
 * or `x-api-key` secret. Verifies hash, status and expiry; does NOT verify
 * scopes (callers check `result.scopes` against the action).
 */
export async function authenticateApiKey(
  secret: string | null,
  nowMs = Date.now()
): Promise<ApiKeyAuthResult | null> {
  if (!secret || !secret.startsWith(API_KEY_PREFIX_MARKER)) return null;
  const row = await db.apiKey.findUnique({ where: { secretHash: sha256Hex(secret) } });
  if (!row || row.status !== 'active') return null;
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= nowMs) return null;
  return {
    id: row.id,
    prefix: row.prefix,
    scopes: parseScopes(row.scopes),
    touchUsed: async () => {
      await db.apiKey.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date().toISOString() },
      }).catch(() => undefined);
    },
  };
}

export async function countApiKeysByStatus(): Promise<{ active: number; revoked: number }> {
  const grouped = await db.apiKey.groupBy({ by: ['status'], _count: { _all: true } });
  const out = { active: 0, revoked: 0 };
  for (const row of grouped) {
    if (row.status === 'active') out.active = row._count._all;
    else out.revoked = row._count._all;
  }
  return out;
}

/* ==================================================================== */
/* Request logs (gateway traffic)                                       */
/* ==================================================================== */

export interface GatewayRequestInput {
  correlationId: string;
  method: string;
  path: string;
  query?: string | null;
  statusCode: number;
  durationMs: number;
  ip?: string | null;
  userAgent?: string | null;
  apiKeyId?: string | null;
  apiKeyPrefix?: string | null;
  merchantReference?: string | null;
  errorCode?: string | null;
}

const USER_AGENT_LIMIT = 180;
const QUERY_LIMIT = 300;

export async function logGatewayRequest(input: GatewayRequestInput): Promise<void> {
  try {
    await db.requestLog.create({
      data: {
        id: randomUUID(),
        correlationId: input.correlationId,
        method: input.method.toUpperCase().slice(0, 8),
        path: input.path.slice(0, 300),
        query: input.query ? input.query.slice(0, QUERY_LIMIT) : null,
        statusCode: Math.trunc(input.statusCode) || 0,
        durationMs: Math.max(0, Math.trunc(input.durationMs) || 0),
        ip: input.ip ?? null,
        userAgent: input.userAgent ? input.userAgent.slice(0, USER_AGENT_LIMIT) : null,
        apiKeyId: input.apiKeyId ?? null,
        apiKeyPrefix: input.apiKeyPrefix ?? null,
        merchantReference: input.merchantReference ?? null,
        errorCode: input.errorCode ?? null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Logging must never break the API response.
    console.error('[db] request log write failed:', (err as Error).message);
  }
}

export interface RequestLogFilters {
  statusClass?: '2xx' | '4xx' | '5xx';
  method?: string;
  path?: string;
  correlationId?: string;
  merchantReference?: string;
  fromDay?: string;
  toDay?: string;
}

function requestLogWhere(filters: RequestLogFilters): Prisma.RequestLogWhereInput {
  const where: Prisma.RequestLogWhereInput = {};
  if (filters.statusClass) {
    const map: Record<string, { gte?: number; lt?: number; not?: object }> = {
      '2xx': { gte: 200, lt: 300 },
      '4xx': { gte: 400, lt: 500 },
      '5xx': { gte: 500, lt: 600 },
    };
    where.statusCode = map[filters.statusClass];
  }
  if (filters.method) where.method = filters.method.toUpperCase();
  if (filters.path) where.path = ciContains(filters.path);
  if (filters.correlationId) where.correlationId = filters.correlationId;
  if (filters.merchantReference) where.merchantReference = filters.merchantReference;
  if (filters.fromDay || filters.toDay) {
    where.createdAt = {
      ...(filters.fromDay ? { gte: `${filters.fromDay}T00:00:00.000Z` } : {}),
      ...(filters.toDay ? { lt: nextDayStartISO(filters.toDay) } : {}),
    };
  }
  return where;
}

export interface RequestLogEntry {
  id: string;
  correlationId: string;
  method: string;
  path: string;
  query: string | null;
  statusCode: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  apiKeyId: string | null;
  apiKeyPrefix: string | null;
  merchantReference: string | null;
  errorCode: string | null;
  createdAt: string;
}

function toRequestLog(row: Prisma.RequestLogGetPayload<{}>): RequestLogEntry {
  return {
    id: row.id,
    correlationId: row.correlationId,
    method: row.method,
    path: row.path,
    query: row.query,
    statusCode: row.statusCode,
    durationMs: row.durationMs,
    ip: row.ip,
    userAgent: row.userAgent,
    apiKeyId: row.apiKeyId,
    apiKeyPrefix: row.apiKeyPrefix,
    merchantReference: row.merchantReference,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
  };
}

export async function listGatewayRequests(
  filters: RequestLogFilters,
  page = 1,
  pageSize = 50
): Promise<PaginatedResult<RequestLogEntry>> {
  const safePageSize = Math.min(Math.max(1, pageSize), 100);
  const safePage = Math.max(1, page);
  const where = requestLogWhere(filters);
  const [rows, total] = await Promise.all([
    db.requestLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    db.requestLog.count({ where }),
  ]);
  return { rows: rows.map(toRequestLog), total, page: safePage, pageSize: safePageSize };
}

export async function getGatewayRequest(id: string): Promise<RequestLogEntry | undefined> {
  const row = await db.requestLog.findUnique({ where: { id } });
  return row ? toRequestLog(row) : undefined;
}

export { nextDayStartISO };

export interface GatewayTrafficSummary {
  total: number;
  errors4xx: number;
  errors5xx: number;
  /** Aggregated over a bounded sample (max 5000 rows) — accurate for low/mid volume. */
  sampled: boolean;
  p50Ms: number | null;
  p95Ms: number | null;
  /** Sorted ascending; index i = percentile value over the sampled durations. */
  sampledDurationsMs: number[];
}

export async function gatewayTrafficSummary(
  afterMs: number,
  beforeMs = Date.now()
): Promise<GatewayTrafficSummary> {
  const where: Prisma.RequestLogWhereInput = {
    createdAt: { gte: new Date(afterMs).toISOString(), lt: new Date(beforeMs).toISOString() },
  };
  const grouped = await db.requestLog.groupBy({
    by: ['statusCode'],
    where,
    _count: { _all: true },
  });
  let total = 0;
  let errors4xx = 0;
  let errors5xx = 0;
  for (const row of grouped) {
    total += row._count._all;
    if (row.statusCode >= 500 && row.statusCode < 600) errors5xx += row._count._all;
    else if (row.statusCode >= 400 && row.statusCode < 500) errors4xx += row._count._all;
  }
  const durations = await db.requestLog.findMany({
    where,
    select: { durationMs: true },
    take: 5000,
    orderBy: { createdAt: 'desc' },
  });
  const durationsMs = durations.map((d) => d.durationMs).sort((a, b) => a - b);
  const pick = (p: number): number | null => {
    if (!durationsMs.length) return null;
    const idx = Math.min(durationsMs.length - 1, Math.ceil(p * durationsMs.length) - 1);
    return durationsMs[Math.max(0, idx)];
  };
  return {
    total,
    errors4xx,
    errors5xx,
    sampled: durations.length >= 5000,
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    sampledDurationsMs: durationsMs,
  };
}

/* ==================================================================== */
/* Webhook deliveries (outbound payment status notifications)           */
/* ==================================================================== */

const DELIVERY_MAX_ATTEMPTS = 5;
export const WEBHOOK_RETRY_DELAY_MS = 60 * 60 * 1000; // manual retry cadence; nextRetryAt guidance only

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

/** Payload sent to merchant notification URLs — status data only, no secrets. */
function buildDeliveryPayload(eventType: string, payment: Payment): Record<string, unknown> {
  return {
    event: eventType,
    type: 'payment_status_update',
    timestamp: new Date().toISOString(),
    data: {
      reference: payment.merchantReference,
      providerReference: payment.providerReference,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.provider,
    },
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface DeliveryAttemptOutcome {
  ok: boolean;
  responseStatus: number | null;
  error: string | null;
  attempts: number;
}

/**
 * Fire the payment's configured notification_url once, recording the attempt.
 * Best-effort: failures never throw — they are reported in the outcome.
 * Automatic calls skip re-firing once MAX_ATTEMPTS is reached (the admin
 * dashboard's manual retry resets nothing; a new attempt is only allowed via
 * `retryWebhookDelivery` before the cap).
 */
export async function deliverPaymentNotification(
  paymentId: string,
  eventType: string,
  previousStatus: string,
  options?: { timeoutMs?: number; force?: boolean }
): Promise<DeliveryAttemptOutcome | null> {
  void previousStatus;
  const payment = await getPaymentById(paymentId);
  if (!payment || !payment.notificationUrl) return null;

  if (!isValidHttpUrl(payment.notificationUrl)) {
    await db.webhookDelivery.create({
      data: {
        id: randomUUID(),
        paymentId,
        eventType,
        destinationUrl: payment.notificationUrl,
        status: 'failed',
        attempts: 1,
        responseError: 'invalid_url',
        lastAttemptAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    return { ok: false, responseStatus: null, error: 'invalid_url', attempts: 1 };
  }

  const open = await db.webhookDelivery.findFirst({
    where: { paymentId, status: { in: ['pending', 'failed'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (open && open.attempts >= DELIVERY_MAX_ATTEMPTS && !options?.force) {
    return { ok: false, responseStatus: open.responseStatus, error: 'max_attempts', attempts: open.attempts };
  }

  const payload = buildDeliveryPayload(eventType, payment);
  let rowId: string;
  if (open) {
    await db.webhookDelivery.update({
      where: { id: open.id },
      data: {
        eventType,
        attempts: { increment: 1 },
        lastAttemptAt: new Date().toISOString(),
        status: 'pending',
        nextRetryAt: null,
      },
    });
    rowId = open.id;
  } else {
    const created = await db.webhookDelivery.create({
      data: {
        id: randomUUID(),
        paymentId,
        eventType,
        destinationUrl: payment.notificationUrl,
        attempts: 1,
        lastAttemptAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    rowId = created.id;
  }

  let responseStatus: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 5000);
    const response = await fetch(payment.notificationUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'FreeGateway-Webhook/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'follow',
    }).finally(() => clearTimeout(timer));
    responseStatus = response.status;
    if (!(response.status >= 200 && response.status < 300)) {
      error = `http_${response.status}`;
    }
  } catch (err) {
    error = (err as Error)?.name === 'AbortError' ? 'timeout' : 'network_error';
  }

  const ok = error === null && responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const attemptsBeforeUpdate = await db.webhookDelivery
    .findUnique({ where: { id: rowId }, select: { attempts: true } })
    .then((row) => row?.attempts ?? 1);
  await db.webhookDelivery.update({
    where: { id: rowId },
    data: {
      status: ok ? 'success' : 'failed',
      attempts: Math.max(1, attemptsBeforeUpdate),
      responseStatus,
      responseError: error ? error.slice(0, 160) : null,
      nextRetryAt: ok ? null : new Date(Date.now() + WEBHOOK_RETRY_DELAY_MS).toISOString(),
    },
  });
  return { ok, responseStatus, error, attempts: Math.max(1, attemptsBeforeUpdate) };
}

export interface WebhookDeliveryEntry {
  id: string;
  paymentId: string | null;
  eventType: string;
  destinationUrl: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  responseError: string | null;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  paymentReference: string | null;
  paymentStatus: string | null;
}

type WebhookDeliveryWithPayment = Prisma.WebhookDeliveryGetPayload<{
  include: { payment: { select: { merchantReference: true; status: true } } };
}>;

function toDelivery(row: WebhookDeliveryWithPayment): WebhookDeliveryEntry {
  return {
    id: row.id,
    paymentId: row.paymentId,
    eventType: row.eventType,
    destinationUrl: row.destinationUrl,
    status: row.status === 'pending' || row.status === 'success' ? row.status : 'failed',
    attempts: row.attempts,
    responseStatus: row.responseStatus,
    responseError: row.responseError,
    nextRetryAt: row.nextRetryAt,
    lastAttemptAt: row.lastAttemptAt,
    createdAt: row.createdAt,
    paymentReference: row.payment?.merchantReference ?? null,
    paymentStatus: row.payment?.status ?? null,
  };
}

export interface WebhookDeliveryFilters {
  status?: WebhookDeliveryStatus;
  q?: string;
}

export async function listWebhookDeliveries(
  filters: WebhookDeliveryFilters = {},
  limit = 100
): Promise<WebhookDeliveryEntry[]> {
  const rows = await db.webhookDelivery.findMany({
    where: webhookDeliveryWhere(filters),
    include: { payment: { select: { merchantReference: true, status: true } } },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(1, limit), 200),
  });
  return rows.map(toDelivery);
}

export async function listWebhookDeliveriesPage(
  filters: WebhookDeliveryFilters = {},
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<WebhookDeliveryEntry>> {
  const safePageSize = Math.min(Math.max(1, pageSize), 100);
  const safePage = Math.max(1, page);
  const where = webhookDeliveryWhere(filters);
  const [rows, total] = await Promise.all([
    db.webhookDelivery.findMany({
      where,
      include: { payment: { select: { merchantReference: true, status: true } } },
      orderBy: [{ createdAt: 'desc' }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    db.webhookDelivery.count({ where }),
  ]);
  return { rows: rows.map(toDelivery), total, page: safePage, pageSize: safePageSize };
}

export async function countWebhookDeliveriesByStatus(
  filters: WebhookDeliveryFilters = {}
): Promise<Record<'pending' | 'success' | 'failed', number>> {
  const grouped = await db.webhookDelivery.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: webhookDeliveryWhere(filters),
  });
  const counts: Record<'pending' | 'success' | 'failed', number> = {
    pending: 0,
    success: 0,
    failed: 0,
  };
  for (const group of grouped) {
    if (group.status === 'pending' || group.status === 'success' || group.status === 'failed') {
      counts[group.status] = group._count._all;
    }
  }
  return counts;
}

function webhookDeliveryWhere(filters: WebhookDeliveryFilters): Prisma.WebhookDeliveryWhereInput {
  const where: Prisma.WebhookDeliveryWhereInput = {};
  if (filters.status) where.status = filters.status;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { eventType: ciContains(q) },
      { destinationUrl: ciContains(q) },
      { payment: { is: { merchantReference: ciContains(q) } } },
    ];
  }
  return where;
}

export async function getWebhookDelivery(id: string): Promise<WebhookDeliveryEntry | undefined> {
  const row = await db.webhookDelivery.findUnique({
    where: { id },
    include: { payment: { select: { merchantReference: true, status: true } } },
  });
  return row ? toDelivery(row) : undefined;
}

/**
 * Manually retry a delivery. Only deliveries whose payment still has a
 * notification_url can be retried; the attempt count is capped at
 * `DELIVERY_MAX_ATTEMPTS` to protect merchant endpoints.
 */
export async function retryWebhookDelivery(
  id: string,
  actor?: AdminUser | null
): Promise<{ delivery: WebhookDeliveryEntry; outcome: DeliveryAttemptOutcome | null } | null> {
  const existing = await db.webhookDelivery.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.attempts >= DELIVERY_MAX_ATTEMPTS) {
    throw new Error('MAX_ATTEMPTS');
  }
  if (!existing.paymentId) throw new Error('NO_PAYMENT');
  const payment = await getPaymentById(existing.paymentId);
  if (!payment || !payment.notificationUrl) throw new Error('NO_PAYMENT');

  const outcome = await deliverPaymentNotification(existing.paymentId, existing.eventType, payment.status, {
    force: true,
  });
  await recordAudit({
    action: 'webhook.retry',
    actor: actor ?? null,
    target: payment.merchantReference,
    detail: { deliveryId: id, event: existing.eventType, ok: outcome?.ok ?? null },
  });
  const delivery = await getWebhookDelivery(id);
  if (!delivery) return null;
  return { delivery, outcome };
}

export async function webhookDeliveryBacklog(): Promise<{ pending: number; failed: number }> {
  const grouped = await db.webhookDelivery.groupBy({ by: ['status'], _count: { _all: true } });
  const out = { pending: 0, failed: 0 };
  for (const row of grouped) {
    if (row.status === 'pending') out.pending = row._count._all;
    if (row.status === 'failed') out.failed = row._count._all;
  }
  return out;
}

/* ==================================================================== */
/* Gateway health (measured, never invented)                            */
/* ==================================================================== */

export interface GatewayHealth {
  database: { ok: boolean; latencyMs: number; provider: string };
  openPayments: number;
  recentPayments: { created24h: number; success24h: number; failed24h: number };
  traffic: GatewayTrafficSummary;
  deliveries: { pending: number; failed: number };
  apiKeys: { active: number; revoked: number };
  providers: Array<{ provider: string; total: number; successRatePercent: number | null }>;
  generatedAt: string;
}

/** Derived from payment records over the last 7 days — NOT an active probe. */
async function providerAvailabilityPercent(): Promise<
  GatewayHealth['providers']
> {
  const grouped = await db.payment.groupBy({
    by: ['provider', 'status'],
    _count: { _all: true },
  });
  const totals = new Map<string, { total: number; success: number }>();
  for (const row of grouped) {
    const entry = totals.get(row.provider) ?? { total: 0, success: 0 };
    entry.total += row._count._all;
    if (row.status === 'success') entry.success += row._count._all;
    totals.set(row.provider, entry);
  }
  return [...totals.entries()].map(([provider, { total, success }]) => ({
    provider,
    total,
    successRatePercent: total ? Math.round((success / total) * 1000) / 10 : null,
  }));
}

export async function getGatewayHealth(): Promise<GatewayHealth> {
  const startedAt = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const nowMs = startedAt;

  let dbOk = true;
  let dbLatency = 0;
  try {
    await db.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - startedAt;
  } catch {
    dbOk = false;
  }

  if (!dbOk) {
    return {
      database: { ok: false, latencyMs: dbLatency, provider: DATABASE_PROVIDER },
      openPayments: 0,
      recentPayments: { created24h: 0, success24h: 0, failed24h: 0 },
      traffic: {
        total: 0,
        errors4xx: 0,
        errors5xx: 0,
        sampled: false,
        p50Ms: null,
        p95Ms: null,
        sampledDurationsMs: [],
      },
      deliveries: { pending: 0, failed: 0 },
      apiKeys: { active: 0, revoked: 0 },
      providers: [],
      generatedAt: new Date(nowMs).toISOString(),
    };
  }

  const [openPayments, created24h, statusCounts, traffic, deliveries, apiKeys, providers] =
    await Promise.all([
      db.payment.count({ where: { status: { in: ['pending', 'auth_needed', 'incomplete'] } } }),
      db.payment.count({
        where: { createdAt: { gte: new Date(nowMs - dayMs).toISOString() } },
      }),
      countPaymentsByStatus({ createdFromMs: nowMs - dayMs, createdToMs: nowMs }),
      gatewayTrafficSummary(nowMs - dayMs, nowMs),
      webhookDeliveryBacklog(),
      countApiKeysByStatus(),
      providerAvailabilityPercent(),
    ]);

  return {
    database: { ok: true, latencyMs: dbLatency, provider: DATABASE_PROVIDER },
    openPayments,
    recentPayments: {
      created24h,
      success24h: statusCounts.success ?? 0,
      failed24h: statusCounts.failed ?? 0,
    },
    traffic,
    deliveries,
    apiKeys,
    providers,
    generatedAt: new Date(nowMs).toISOString(),
  };
}

/* ==================================================================== */
/* Global search                                                        */
/* ==================================================================== */

export interface GatewaySearchResults {
  payments: Array<{ id: string; merchantReference: string; customerName: string | null; status: string; amount: number; currency: string }>;
  users: Array<{ id: string; email: string; name: string; role: string }>;
  apiKeys: Array<{ id: string; name: string; prefix: string; status: string }>;
  requests: Array<{ id: string; correlationId: string; path: string; method: string; statusCode: number; createdAt: string }>;
}

export async function searchGateway(q: string, permissions: Set<AdminPermission>): Promise<GatewaySearchResults> {
  const value = q.trim();
  const out: GatewaySearchResults = { payments: [], users: [], apiKeys: [], requests: [] };
  if (value.length < 2) return out;

  if (permissions.has('payments.list')) {
    const contains = ciContains(value);
    const rows = await db.payment.findMany({
      where: {
        OR: [{ merchantReference: contains }, { providerReference: contains }],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        merchantReference: true,
        customerName: true,
        status: true,
        amount: true,
        currency: true,
      },
    });
    out.payments = rows;
  }

  if (permissions.has('users.manage')) {
    const contains = ciContains(value);
    const rows = await db.adminUser.findMany({
      where: { OR: [{ email: contains }, { name: contains }] },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    out.users = rows.map(({ id, email, name, role }) => ({ id, email, name, role }));
  }

  if (permissions.has('keys.manage')) {
    const contains = ciContains(value);
    const rows = await db.apiKey.findMany({
      where: { OR: [{ name: contains }, { prefix: contains }] },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    out.apiKeys = rows.map(({ id, name, prefix, status }) => ({ id, name, prefix, status }));
  }

  if (permissions.has('logs.view')) {
    const rows = await db.requestLog.findMany({
      where: {
        OR: [
          { correlationId: ciContains(value) },
          { path: ciContains(value) },
          { merchantReference: ciContains(value) },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    out.requests = rows.map((row) => ({
      id: row.id,
      correlationId: row.correlationId,
      path: row.path,
      method: row.method,
      statusCode: row.statusCode,
      createdAt: row.createdAt,
    }));
  }

  return out;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export default db;