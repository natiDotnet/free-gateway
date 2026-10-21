import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

/* ==================================================================== */
/* NOTE FOR MAINTAINERS                                                 */
/*                                                                      */
/* This package is intentionally a SINGLE FILE. The Next.js apps import */
/* it through a tsconfig `paths` alias that points at this exact source */
/* file (packages/db/src/index.ts). Under Turbopack, files reached via  */
/* that alias cannot reliably resolve sibling/relative imports, so any  */
/* code shared between apps must live here — do not split this package  */
/* into modules without re-testing `nx run checkout:build` AND          */
/* `nx run admin-dashboard:build`.                                      */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Finding the workspace root / opening the connection                */
/* ------------------------------------------------------------------ */

/**
 * Find the Nx workspace root by walking up from the current working
 * directory until we hit a directory containing nx.json. All apps in the
 * monorepo share this root, so they also share the same SQLite file.
 */
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

const WORKSPACE_ROOT = findWorkspaceRoot(process.cwd());
export const DB_PATH =
  process.env.DATABASE_PATH ?? join(WORKSPACE_ROOT, 'dev.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ------------------------------------------------------------------ */
/* Types — payments                                                    */
/* ------------------------------------------------------------------ */

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
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  meta?: Record<string, unknown>;
  returnUrl?: string;
  cancelUrl?: string;
  notificationUrl?: string;
  provider?: string;
}

/* ------------------------------------------------------------------ */
/* Types — admin (RBAC)                                                */
/* ------------------------------------------------------------------ */

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

/** Pure permission check — usable from client-side props too. */
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

export interface AdminSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
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

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id              TEXT PRIMARY KEY,
    merchant_reference TEXT UNIQUE NOT NULL,
    amount          REAL NOT NULL,
    currency        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    checkout_url    TEXT,
    provider_reference TEXT UNIQUE,
    provider        TEXT NOT NULL DEFAULT 'chapa',
    customer_name   TEXT,
    customer_email  TEXT,
    customer_phone  TEXT,
    meta            TEXT,
    return_url      TEXT,
    cancel_url      TEXT,
    notification_url TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payment_events (
    id           TEXT PRIMARY KEY,
    payment_id   TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    provider     TEXT NOT NULL,
    reference    TEXT,
    payload      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_payments_merchant_reference
    ON payments(merchant_reference);
  CREATE INDEX IF NOT EXISTS idx_payments_status
    ON payments(status);
  CREATE INDEX IF NOT EXISTS idx_payments_provider
    ON payments(provider);
  CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id
    ON payment_events(payment_id);
  CREATE INDEX IF NOT EXISTS idx_payment_events_provider_ref
    ON payment_events(provider, reference);

  CREATE TABLE IF NOT EXISTS admin_users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'viewer',
    password_hash TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_user
    ON admin_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
    ON admin_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT,
    actor_email TEXT,
    actor_role  TEXT,
    action      TEXT NOT NULL,
    target      TEXT,
    detail      TEXT,
    ip          TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_log_created
    ON audit_log(created_at);
`);

/* ------------------------------------------------------------------ */
/* Row mapping helpers                                                 */
/* ------------------------------------------------------------------ */

function toPayment(row: any): Payment {
  return {
    id: row.id,
    merchantReference: row.merchant_reference,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentStatus,
    checkoutUrl: row.checkout_url,
    providerReference: row.provider_reference,
    provider: row.provider,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    meta: row.meta ? JSON.parse(row.meta) : null,
    returnUrl: row.return_url,
    cancelUrl: row.cancel_url,
    notificationUrl: row.notification_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPaymentEvent(row: any): PaymentEvent {
  return {
    id: row.id,
    paymentId: row.payment_id,
    eventType: row.event_type,
    provider: row.provider,
    reference: row.reference,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.created_at,
  };
}

function toAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: (isAdminRole(row.role) ? row.role : 'viewer') as AdminRole,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function toAuditEntry(row: any): AuditEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    target: row.target,
    detail: row.detail ? JSON.parse(row.detail) : null,
    ip: row.ip,
    createdAt: row.created_at,
  };
}

/* ==================================================================== */
/* Payments                                                             */
/* ==================================================================== */

export function createPayment(input: CreatePaymentInput): Payment {
  const id = input.merchantReference;
  const now = new Date().toISOString();
  const provider = input.provider ?? 'chapa';

  const insert = db.prepare(`
    INSERT INTO payments (
      id, merchant_reference, amount, currency, status,
      customer_name, customer_email, customer_phone, meta,
      return_url, cancel_url, notification_url, provider,
      created_at, updated_at
    ) VALUES (
      @id, @merchantReference, @amount, @currency, 'pending',
      @customerName, @customerEmail, @customerPhone, @meta,
      @returnUrl, @cancelUrl, @notificationUrl, @provider,
      @now, @now
    )
  `);

  insert.run({
    id,
    merchantReference: input.merchantReference,
    amount: input.amount,
    currency: input.currency,
    customerName: input.customer?.name ?? null,
    customerEmail: input.customer?.email ?? null,
    customerPhone: input.customer?.phone ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    returnUrl: input.returnUrl ?? null,
    cancelUrl: input.cancelUrl ?? null,
    notificationUrl: input.notificationUrl ?? null,
    provider,
    now,
  });

  return getPaymentByMerchantReference(input.merchantReference)!;
}

export function getPaymentById(id: string): Payment | undefined {
  const row = db
    .prepare('SELECT * FROM payments WHERE id = @id')
    .get({ id }) as any;
  return row ? toPayment(row) : undefined;
}

export function getPaymentByMerchantReference(
  merchantReference: string
): Payment | undefined {
  const row = db
    .prepare(
      'SELECT * FROM payments WHERE merchant_reference = @merchantReference'
    )
    .get({ merchantReference }) as any;
  return row ? toPayment(row) : undefined;
}

export function getPaymentByProviderReference(
  providerReference: string
): Payment | undefined {
  const row = db
    .prepare(
      'SELECT * FROM payments WHERE provider_reference = @providerReference'
    )
    .get({ providerReference }) as any;
  return row ? toPayment(row) : undefined;
}

export function listPayments(): Payment[] {
  const rows = db
    .prepare('SELECT * FROM payments ORDER BY datetime(created_at) DESC')
    .all() as any[];
  return rows.map(toPayment);
}

export function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  patch?: {
    providerReference?: string;
  }
): Payment | undefined {
  const sets: string[] = ['status = @status', 'updated_at = @now'];
  const params: Record<string, unknown> = { id, status, now: new Date().toISOString() };

  if (patch?.providerReference) {
    sets.push('provider_reference = @providerReference');
    params.providerReference = patch.providerReference;
  }

  const update = db.prepare(`
    UPDATE payments
    SET ${sets.join(', ')}
    WHERE id = @id
  `);

  const result = update.run(params);
  if (result.changes === 0) return undefined;

  return getPaymentById(id);
}

/** Record which provider settled/updated this payment (audit-friendly). */
export function updatePaymentProvider(id: string, provider: string): void {
  db.prepare(
    `UPDATE payments SET provider = @provider, updated_at = @now WHERE id = @id`
  ).run({ id, provider, now: new Date().toISOString() });
}

export function createPaymentEvent({
  paymentId,
  eventType,
  provider,
  reference,
  payload,
}: {
  paymentId: string;
  eventType: string;
  provider: string;
  reference?: string | null;
  payload?: Record<string, unknown> | null;
}): PaymentEvent {
  const id = `${eventType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO payment_events (id, payment_id, event_type, provider, reference, payload, created_at)
    VALUES (@id, @paymentId, @eventType, @provider, @reference, @payload, @now)
  `);

  insert.run({
    id,
    paymentId,
    eventType,
    provider,
    reference: reference ?? null,
    payload: payload ? JSON.stringify(payload) : null,
    now,
  });

  const row = db
    .prepare('SELECT * FROM payment_events WHERE id = @id')
    .get({ id }) as any;
  return toPaymentEvent(row);
}

export function getPaymentEventsByPaymentId(paymentId: string): PaymentEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM payment_events
       WHERE payment_id = @paymentId
       ORDER BY datetime(created_at) DESC, rowid DESC`
    )
    .all({ paymentId }) as any[];
  return rows.map(toPaymentEvent);
}

/* ==================================================================== */
/* Admin — password hashing (Node crypto scrypt, no extra dependency)   */
/* ==================================================================== */

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
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export function assertValidPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Password must be at least 10 characters');
  }
  if (password.length > 128) {
    throw new Error('Password must be at most 128 characters');
  }
}

/* ==================================================================== */
/* Admin — users                                                        */
/* ==================================================================== */

export function listAdminUsers(): AdminUser[] {
  const rows = db
    .prepare('SELECT * FROM admin_users ORDER BY datetime(created_at) ASC')
    .all() as any[];
  return rows.map(toAdminUser);
}

export function findAdminUserById(id: string): AdminUser | undefined {
  const row = db
    .prepare('SELECT * FROM admin_users WHERE id = @id')
    .get({ id }) as any;
  return row ? toAdminUser(row) : undefined;
}

/** Safe (public) user record — never exposes the password hash. */
export function findAdminUserByEmail(email: string): AdminUser | undefined {
  const row = db
    .prepare('SELECT * FROM admin_users WHERE email = @email COLLATE NOCASE')
    .get({ email }) as any;
  return row ? toAdminUser(row) : undefined;
}

function getEmailHashRow(email: string): { passwordHash: string } | undefined {
  const row = db
    .prepare(
      'SELECT password_hash AS passwordHash FROM admin_users WHERE email = @email COLLATE NOCASE'
    )
    .get({ email }) as { passwordHash: string } | undefined;
  return row;
}

export function hasAdminUsers(): boolean {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM admin_users')
    .get() as { n: number };
  return row.n > 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAdminUser(
  input: CreateAdminUserInput,
  actor?: AdminUser | null
): AdminUser {
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const role = isAdminRole(input.role) ? input.role : 'viewer';
  const password = String(input.password ?? '');

  if (!EMAIL_RE.test(email)) throw new Error('VALIDATION-email');
  if (name.length < 1 || name.length > 80) throw new Error('VALIDATION-name');
  assertValidPassword(password);

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO admin_users
       (id, email, name, role, password_hash, is_active, created_at, updated_at)
     VALUES
       (@id, @email, @name, @role, @passwordHash, 1, @now, @now)`
  ).run({
    id,
    email,
    name,
    role,
    passwordHash: hashPassword(password),
    now,
  });

  recordAudit({
    action: 'user.create',
    actor: actor ?? null,
    target: email,
    detail: { userId: id, role, name },
  });

  return findAdminUserById(id)!;
}

export function updateAdminUserRole(
  id: string,
  role: AdminRole,
  actor?: AdminUser | null
): AdminUser {
  if (!isAdminRole(role)) throw new Error('VALIDATION-role');
  if (!findAdminUserById(id)) throw new Error('NOT_FOUND');

  db.prepare(
    `UPDATE admin_users SET role = @role, updated_at = @now WHERE id = @id`
  ).run({ id, role, now: new Date().toISOString() });

  recordAudit({
    action: 'user.role_change',
    actor: actor ?? null,
    target: id,
    detail: { role },
  });
  return findAdminUserById(id)!;
}

export function setAdminUserActive(
  id: string,
  isActive: boolean,
  actor?: AdminUser | null
): AdminUser {
  if (!findAdminUserById(id)) throw new Error('NOT_FOUND');

  db.prepare(
    `UPDATE admin_users SET is_active = @isActive, updated_at = @now WHERE id = @id`
  ).run({ id, isActive: isActive ? 1 : 0, now: new Date().toISOString() });

  if (!isActive) destroyAllSessionsForUser(id);
  recordAudit({
    action: isActive ? 'user.activate' : 'user.deactivate',
    actor: actor ?? null,
    target: id,
  });
  return findAdminUserById(id)!;
}

export function resetAdminPassword(
  id: string,
  newPassword: string,
  actor?: AdminUser | null
): AdminUser {
  assertValidPassword(newPassword);
  if (!findAdminUserById(id)) throw new Error('NOT_FOUND');

  db.prepare(
    `UPDATE admin_users
     SET password_hash = @hash, updated_at = @now WHERE id = @id`
  ).run({ id, hash: hashPassword(newPassword), now: new Date().toISOString() });

  // Any existing session for this user is revoked on password reset.
  destroyAllSessionsForUser(id);
  recordAudit({
    action: 'user.reset_password',
    actor: actor ?? null,
    target: id,
  });
  return findAdminUserById(id)!;
}

/** Verify email + password. Returns the user, or null (generic — no
 *  enumeration: missing user and wrong password behave identically). */
export function verifyAdminCredentials(
  email: string,
  password: string
): AdminUser | null {
  const row = getEmailHashRow(String(email ?? '').trim());
  if (!row) {
    // Burn comparable time to a real scrypt verify to avoid timing probes.
    scryptSync('decoy', 'decoy-salt', SCRYPT_KEYLEN);
    return null;
  }
  if (!verifyPassword(String(password ?? ''), row.passwordHash)) return null;

  const user = findAdminUserByEmail(email)!;
  if (!user.isActive) return null;

  db.prepare(
    'UPDATE admin_users SET last_login_at = @now WHERE id = @id'
  ).run({ id: user.id, now: new Date().toISOString() });

  return user;
}

/** Change own password — requires the current password. Keeps the current
 *  session alive but invalidates every other session of the user. */
export function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepToken?: string
): AdminUser {
  assertValidPassword(newPassword);

  const row = db
    .prepare(
      'SELECT password_hash AS passwordHash FROM admin_users WHERE id = @id'
    )
    .get({ id: userId }) as { passwordHash: string } | undefined;
  if (!row) throw new Error('NOT_FOUND');
  if (!verifyPassword(String(currentPassword ?? ''), row.passwordHash)) {
    throw new Error('WRONG_CURRENT_PASSWORD');
  }

  db.prepare(
    `UPDATE admin_users
     SET password_hash = @hash, updated_at = @now WHERE id = @id`
  ).run({ id: userId, hash: hashPassword(newPassword), now: new Date().toISOString() });

  if (keepToken) {
    destroyAllSessionsForUser(userId, sha256(keepToken));
  }
  recordAudit({ action: 'account.password_change', target: userId });
  return findAdminUserById(userId)!;
}

/* ==================================================================== */
/* Admin — sessions                                                     */
/* ==================================================================== */

const SESSION_TTL_HOURS = Math.max(
  1,
  Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 8)
);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < @now').run({
    now: new Date().toISOString(),
  });
}

export function createAdminSession(userId: string): {
  token: string;
  expiresAt: string;
} {
  purgeExpiredSessions();
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_HOURS * 3600 * 1000
  ).toISOString();

  db.prepare(
    `INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at)
     VALUES (@tokenHash, @userId, @now, @expiresAt)`
  ).run({ tokenHash, userId, now: new Date().toISOString(), expiresAt });

  return { token, expiresAt };
}

export function getAdminUserBySessionToken(token: string): AdminUser | null {
  if (!token || token.length < 32) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = @tokenHash AND s.expires_at > @now AND u.is_active = 1`
    )
    .get({
      tokenHash: sha256(token),
      now: new Date().toISOString(),
    }) as any;
  return row ? toAdminUser(row) : null;
}

export function destroyAdminSession(token: string): void {
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = @tokenHash').run({
    tokenHash: sha256(token),
  });
}

export function destroyAllSessionsForUser(
  userId: string,
  keepTokenHash?: string
): void {
  if (keepTokenHash) {
    db.prepare(
      'DELETE FROM admin_sessions WHERE user_id = @userId AND token_hash != @keepTokenHash'
    ).run({ userId, keepTokenHash });
  } else {
    db.prepare('DELETE FROM admin_sessions WHERE user_id = @userId').run({
      userId,
    });
  }
}

/* ==================================================================== */
/* Admin — audit log                                                    */
/* ==================================================================== */

export function recordAudit(entry: {
  action: string;
  actor?: AdminUser | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}): void {
  db.prepare(
    `INSERT INTO audit_log
       (id, actor_id, actor_email, actor_role, action, target, detail, ip, created_at)
     VALUES
       (@id, @actorId, @actorEmail, @actorRole, @action, @target, @detail, @ip, @now)`
  ).run({
    id: randomUUID(),
    actorId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? null,
    actorRole: entry.actor?.role ?? null,
    action: entry.action,
    target: entry.target ?? null,
    detail: entry.detail ? JSON.stringify(entry.detail) : null,
    ip: entry.ip ?? null,
    now: new Date().toISOString(),
  });
}

export function listAuditEntries(limit = 200): AuditEntry[] {
  const clamped = Math.min(Math.max(1, limit), 500);
  const rows = db
    .prepare(
      'SELECT * FROM audit_log ORDER BY datetime(created_at) DESC, rowid DESC LIMIT @limit'
    )
    .all({ limit: clamped }) as any[];
  return rows.map(toAuditEntry);
}

/* ==================================================================== */
/* Bootstrap admin — created only while the users table is empty        */
/* ==================================================================== */

export function ensureBootstrapAdmin(): void {
  if (hasAdminUsers()) return;

  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@freegateway.local')
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'ChangeMe!2026';
  const name = process.env.ADMIN_BOOTSTRAP_NAME ?? 'Gateway Admin';

  createAdminUser({ email, name, role: 'admin', password });
  console.warn(
    `[db] bootstrapped first admin: ${email} (role: admin).
[db] The default password should be changed immediately — see /account,
[db] or override via ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD / ADMIN_BOOTSTRAP_NAME.`
  );
}

ensureBootstrapAdmin();

/* ------------------------------------------------------------------ */
/* Default export                                                      */
/* ------------------------------------------------------------------ */

export { db };
export default db;
