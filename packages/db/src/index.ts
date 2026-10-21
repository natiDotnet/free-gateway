import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

/* ------------------------------------------------------------------ */
/* Types                                                              */
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
/* Connection                                                         */
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
const DB_PATH = process.env.DATABASE_PATH ?? join(WORKSPACE_ROOT, 'dev.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ------------------------------------------------------------------ */
/* Schema                                                             */
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
`);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
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

/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

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
    .prepare(
      'SELECT * FROM payments ORDER BY datetime(created_at) DESC'
    )
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

/* ------------------------------------------------------------------ */
/* Default export                                                     */
/* ------------------------------------------------------------------ */

export { db };
export default db;
