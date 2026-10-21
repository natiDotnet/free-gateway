# Free Gateway — Payment Gateway Backend (Next.js + Nx)

A backend gateway that accepts Chapa-style payment initialization requests,
stores them in a **SQLite database**, and processes webhooks from payment
providers (Chapa, Telebirr, …) to update payment status.

Built as an Nx monorepo with two Next.js apps and shared libraries:

| Project | Port | Purpose |
|---------|------|---------|
| `checkout` | 3000 | Public payment gateway: init, hosted checkout page, verify, webhooks |
| `admin-dashboard` | 3001 | Admin view: list transactions, server-side verify |
| `@org/db` | — | Shared SQLite database layer (`better-sqlite3`) |
| `@org/chapa` | — | Chapa API v2 outbound client |

## Data flow

```
1. Customer submits payment details                       (checkout /)
2. POST /api/payments/init                              (checkout)
   → validates payload, stores Payment (status=pending)
   → returns checkout_url = /payment/{merchantReference}
3. Customer lands on the gateway's OWN hosted checkout  (checkout /payment/[id])
   → picks a payment method (Telebirr / Chapa / Card)
   → POST /api/payments/[reference]/submit
   → Payment → auth_needed (awaiting the provider)
4. Provider webhook (Telebirr / Chapa / …)              (checkout /api/webhooks/[provider])
   → POST /api/webhooks/cancel or /api/webhooks/chapa
   → normalizes payload, updates Payment status
   → records a PaymentEvent (audit log)
5. Server-side verification BEFORE delivering value     (checkout /api/payments/[reference]/verify)
   → returns authoritative status from the database
   → the hosted page polls this until the webhook lands
6. Admin views & verifies transactions                  (admin-dashboard /)
```

Key rule: **redirects are UX signals, not proof**. The provider's webhook is
the source of truth, and value is only delivered after server-side
verification.

## API reference

### POST /api/payments/init
Initialize a payment (Chapa-style payload) and store it in the database.

Body:
```json
{
  "amount": 500,
  "currency": "USD",
  "customer": {
    "first_name": "Abebe",
    "last_name": "Bikila",
    "email": "abebe@example.com",
    "phone_number": "+251960724272"
  },
  "merchant_reference": "ORD-99887",
  "meta": { "order_id": "ORD-99887", "notes": "..." },
  "return_url": "http://localhost:3000/success",
  "cancel_url": "http://localhost:3000/cancel",
  "notification_url": "http://localhost:3000/api/webhooks/chapa"
}
```

Response:
```json
{
  "status": "success",
  "message": "Payment initialized",
  "data": {
    "checkout_url": "http://localhost:3000/payment/ORD-99887",
    "reference": "ORD-99887",
    "amount": 500,
    "currency": "USD"
  }
}
```

- `amount` and `currency` are required.
- `merchant_reference` must be unique (idempotency — duplicates are rejected
  once non-pending).
- Supported currencies: USD, ETB, UGX, DJF.

### GET /api/payments/[reference]/verify
Server-side verification. Returns the authoritative payment status from the
database (updated by webhooks).

```json
{
  "status": "success",
  "message": "Payment is success",
  "data": {
    "reference": "ORD-99887",
    "providerReference": "CHAPA_12345",
    "amount": 500,
    "currency": "USD",
    "status": "success"
  }
}
```

Only deliver value when `data.status === "success"`.

### POST /api/payments/[reference]/submit
Called by the gateway's hosted checkout page when the customer submits a
payment method.

```json
{ "method": "telebirr", "phone": "+251960724272" }
```
- `method`: `telebirr | chapa | card`
- `telebirr` requires `phone` in international format (validated server-side,
  masked before storage).
- `card` accepts `last4` only — raw card numbers are never stored.

Response sets the payment to `auth_needed` (awaiting the provider) and
records a `payment.submitted` audit event.

### POST /api/payments/[reference]/cancel
Marks a pending/awaiting payment as `cancelled` and records an audit event.
Submitting after cancellation is rejected with `409`.

### POST /api/webhooks/[provider]
Receives webhooks from providers. `provider` is `chapa` or `telebirr` (or any
string you configure).

Chapa-style payload:
```json
{
  "event": "payment.success",
  "data": {
    "reference": "ORD-99887",
    "chapa_reference": "CHAPA_12345",
    "amount": "500",
    "currency": "USD",
    "status": "success"
  }
}
```

Telebirr SMS notify (forwarded by an SMS gateway — real-world payload, flat,
no merchant reference):
```json
{
  "createdAt": "2026-10-18T15:09:28.707Z",
  "provider": "telebirr",
  "from": "127",
  "amount": "5.00",
  "sender_name": "Natnael Yirga",
  "sender_phone": "2519****0217",
  "datetime": "19/10/2026 15:54:53",
  "transaction_number": "DJJ928K0V3",
  "balance": "ETB 5.00.",
  "text": "Dear TAMRAT \nYou have received ETB 5.00 from Natnael Yirga(2519****0217)  on 19/10/2026 15:54:53. Your transaction number is DJJ928K0V3. Your current E-Money Account balance is ETB 5.00.\nThank you for using telebirr\nEthio telecom",
  "sentStamp": 1792414493000,
  "receivedStamp": 1792414497399,
  "sim": "sim2"
}
```
Telebirr SMS reconciliation order:
1. **Idempotency** — a `transaction_number` that already settled a payment is
   ignored (`Duplicate event`).
2. **Text reference** — if the payer wrote the order reference (e.g. `ORD-…`
   or `Ref: …`) in the transaction text, match it.
3. **Amount match** — otherwise match an open ETB payment with the same
   amount, preferring `auth_needed` (the customer already chose Telebirr on
   the hosted checkout). Unmatched SMS are acked and logged, never guessed.
4. The raw SMS payload is stored in `payment_events` (audit log), and the
   payment row records `provider = telebirr` + `provider_reference =
   DJJ928K0V3`.

Optional integrity guard — `checkout/.env`:
```
# Only accept SMS notifications addressed to this Telebirr account name
TELEBIRR_ACCOUNT_NAME=TAMRAT
```

The endpoint:
1. Normalizes the provider-specific payload into `{ eventType, reference, status }`.
2. Finds the payment by `provider_reference` or `merchant_reference` (plus the
   Telebirr reconciliation above).
3. Updates the payment status and records a `PaymentEvent`.
4. Always replies `200 Event received` (acknowledges the webhook to prevent
   provider retries).

> **Security TODO:** Add webhook signature validation (e.g. verify a Chapa /
> Telebirr HMAC signature from request headers) before trusting the payload.

### Database schema (`@org/db`)

Stored in `dev.sqlite` at the workspace root (SQLite, WAL mode).

```sql
payments (
  id TEXT PRIMARY KEY,
  merchant_reference TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|success|failed|cancelled|incomplete|auth_needed|blocked
  checkout_url TEXT,
  provider_reference TEXT UNIQUE,            -- upstream provider txn ref (Chapa/Telebirr)
  provider TEXT NOT NULL DEFAULT 'chapa',   -- chapa | telebirr | ...
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  meta TEXT,                                 -- JSON
  return_url TEXT,
  cancel_url TEXT,
  notification_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)

payment_events (
  id TEXT PRIMARY KEY,
  payment_id TEXT REFERENCES payments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                  -- payment.success | payment.failed | …
  provider TEXT NOT NULL,
  reference TEXT,
  payload TEXT,                              -- JSON raw webhook body
  created_at TEXT DEFAULT (datetime('now'))
)

admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,               -- no-case compare
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',      -- admin | operator | viewer
  password_hash TEXT NOT NULL,              -- scrypt:salt:hash
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
)

admin_sessions (
  token_hash TEXT PRIMARY KEY,              -- SHA-256 of the cookie token
  user_id TEXT REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
)

audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT, actor_email TEXT, actor_role TEXT,
  action TEXT NOT NULL,                     -- auth.login | payment.verify | user.create | …
  target TEXT, detail TEXT,                 -- JSON
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

## Setup

```bash
cd free-gateway
npm install
```

### Environment variables

`checkout/.env`:
```
DATABASE_PATH=/absolute/path/to/dev.sqlite   # optional; defaults to workspace-root dev.sqlite
GATEWAY_SIMULATE_PROVIDERS=true              # demo only: auto-dispatch a simulated provider webhook after submit
GATEWAY_SIMULATE_DELAY_MS=2000               # demo delay before the simulated webhook fires
PORT=3000
```

`admin-dashboard/.env`:
```
PORT=3001

# ── Admin console (RBAC) ─────────────────────────────────────────────
# First administrator is seeded automatically when admin_users is empty:
ADMIN_BOOTSTRAP_EMAIL=admin@freegateway.local        # default shown
ADMIN_BOOTSTRAP_PASSWORD=ChangeMe!2026               # default shown; override for prod
ADMIN_BOOTSTRAP_NAME=Gateway Admin                   # default shown

ADMIN_SESSION_TTL_HOURS=8       # admin session lifetime (default 8)
COOKIE_SECURE=false             # set true when serving admin over HTTPS
```

The database path is resolved automatically to the workspace root (where
`nx.json` lives), so both apps share the same `dev.sqlite` file regardless of
which directory each dev server runs from.

## Admin console — authentication & roles (`admin-dashboard`)

The dashboard at `http://localhost:3001` is a full staff console protected
by session auth and role-based access control (RBAC):

| Role | Permissions |
|---|---|
| **Administrator** | everything: payments + verify/cancel, **user management**, audit |
| **Operator** | payments + verify/cancel, audit |
| **Viewer** | read-only payments |

Architecture:
- **Sessions** — opaque 256-bit tokens in an `HttpOnly` `SameSite=Lax` cookie;
  only the SHA-256 hash is stored (`admin_sessions`), TTL via
  `ADMIN_SESSION_TTL_HOURS`. Passwords are scrypt-hashed with per-user salts
  (Node `crypto` — no extra dependency). Wrong-password attempts lock an
  (ip, email) pair for 10 minutes after 5 failures.
- **`src/proxy.ts` (edge)** — cheap gate: no session cookie → redirect to
  `/login?next=…` (pages) or `401` (API), plus security headers
  (`X-Frame-Options: DENY`, `nosniff`, referrer/permissions policy). The edge
  layer deliberately cannot touch SQLite; real validation happens in the
  Node runtime.
- **Server guards** — every dashboard layout/page calls
  `requirePagePermission(...)`; every API route re-checks
  session + `can(role, permission)` (defense in depth). Pages render inside
  `(dashboard)` route group with a role-filtered Tailwind sidebar.
- **Audit** — `audit_log` records `auth.login` / `auth.login.failed` /
  `auth.logout`, `payment.verify` / `payment.cancel`,
  `user.create` / `user.role_change` / `user.activate` / `user.deactivate` /
  `user.reset_password` / `account.password_change` with actor, target,
  detail and IP. Password reset or deactivation revokes sessions instantly.
- **Pages** — `/login`, `/payments` (search, status filter, stats tiles,
  quick verify/cancel), `/payments/[reference]` (amount, customer, metadata,
  provider event timeline, actions), `/users` (admin-only staff management),
  `/audit`, `/account` (self-service password change).

Login with curl:
```bash
# sign in (cookie jar) and call the API
curl -s -c admin.jar -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@freegateway.local","password":"ChangeMe!2026"}'

curl -s -b admin.jar http://localhost:3001/api/admin/users
```

Production hardening TODOs: run behind HTTPS (`COOKIE_SECURE=true`), replace
the in-memory login throttle with Redis if you scale horizontally, and add
TOTP 2FA for administrators.

## Run

Terminal 1 — checkout gateway:
```bash
npm run dev:checkout        # http://localhost:3000
```

Terminal 2 — admin dashboard:
```bash
npm run dev:admin-dashboard # http://localhost:3001
```

Open http://localhost:3000 to initialize a payment; open
http://localhost:3001 to view and verify transactions.

## Test the flow with curl

```bash
# 1. Initialize a payment (stored as pending); returns the gateway's checkout_url
curl -s -X POST http://localhost:3000/api/payments/init \
  -H 'Content-Type: application/json' \
  -d '{"amount":"500","currency":"USD","merchant_reference":"ORD-TEST-001","customer":{"first_name":"A","last_name":"B","email":"a@b.com"}}'

# 2. Open the gateway's hosted checkout and submit Telebirr
curl -s -X POST http://localhost:3000/api/payments/ORD-TEST-001/submit \
  -H 'Content-Type: application/json' \
  -d '{"method":"telebirr","phone":"+251960724272"}'   # → auth_needed

# 3. Verify (still awaiting the provider)
curl http://localhost:3000/api/payments/ORD-TEST-001/verify

# 4. Provider webhook (Chapa) confirms
curl -s -X POST http://localhost:3000/api/webhooks/chapa \
  -H 'Content-Type: application/json' \
  -d '{"event":"payment.success","data":{"reference":"ORD-TEST-001","chapa_reference":"CHAPA_XYZ","amount":"500","currency":"USD"}}'

# 5. Verify again (now success)
curl http://localhost:3000/api/payments/ORD-TEST-001/verify

# 6. Telebirr SMS notify (real-world payload — reconcile by amount)
#    First create an open 5.00 ETB Telebirr payment:
curl -s -X POST http://localhost:3000/api/payments/init \
  -H 'Content-Type: application/json' \
  -d '{"amount":"5.00","currency":"ETB","merchant_reference":"ORD-TEST-002","customer":{"first_name":"N","last_name":"Y","email":"n@b.com","phone_number":"+251911000217"}}'
curl -s -X POST http://localhost:3000/api/payments/ORD-TEST-002/submit \
  -H 'Content-Type: application/json' \
  -d '{"method":"telebirr","phone":"+251911000217"}'
#    Then post the SMS notification received from Telebirr:
curl -s -X POST http://localhost:3000/api/webhooks/telebirr \
  -H 'Content-Type: application/json' \
  -d @- <<'EOF'
{
  "createdAt": "2026-10-18T15:09:28.707Z",
  "provider": "telebirr",
  "from": "127",
  "amount": "5.00",
  "sender_name": "Natnael Yirga",
  "sender_phone": "2519****0217",
  "datetime": "19/10/2026 15:54:53",
  "transaction_number": "DJJ928K0V3",
  "balance": "ETB 5.00.",
  "text": "Dear TAMRAT \nYou have received ETB 5.00 from Natnael Yirga(2519****0217)  on 19/10/2026 15:54:53. Your transaction number is DJJ928K0V3. Your current E-Money Account balance is ETB 5.00.\nThank you for using telebirr\nEthio telecom",
  "sentStamp": 1792414493000,
  "receivedStamp": 1792414497399,
  "sim": "sim2"
}
EOF

#    Confirm the SMS settled it (success + provider_reference = DJJ928K0V3)
curl http://localhost:3000/api/payments/ORD-TEST-002/verify

# 7. Admin dashboard verifies the same record
curl -s -X POST http://localhost:3001/api/payments/ORD-TEST-001/verify
```

## Type-check & build

```bash
npm run typecheck   # tsc across both apps + shared libs
npm run build       # build both Next.js apps
```

## Production notes

- Swap SQLite for PostgreSQL (or another SQL database) for multi-instance
  deployments; `@org/db` is the single integration point.
- Enable webhook signature validation in `api/webhooks/[provider]/route.ts`.
- Replace the in-memory retry/payment page logic with your real provider SDKs
  (Chapa, Telebirr, etc.) for the actual redirect/checkout step.
- Add authentication/authorization to the admin dashboard and webhook endpoints.
