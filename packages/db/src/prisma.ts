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
  | 'audit.view';

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
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

export async function createAdminSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  await purgeExpiredSessions();
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
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

export default db;