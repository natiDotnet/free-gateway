import { expect, type Page, type Response } from '@playwright/test';

/**
 * Admin dashboard flows under test run on :3001 (the checkout/gateway API
 * lives on :3000). Both URLs are overridable for deployed CI runs.
 */
export const ADMIN_URL = process.env['ADMIN_URL'] || 'http://localhost:3001';
export const CHECKOUT_URL = process.env['BASE_URL'] || 'http://localhost:3000';

export const ADMIN_EMAIL = 'admin@freegateway.local';
export const ADMIN_PASSWORD = 'ChangeMe!2026';

export function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Logs in through the real login form. Returns to `next` (or payments).
 */
export async function login(page: Page, next = '/payments'): Promise<void> {
  await page.goto(`${ADMIN_URL}/login?next=${encodeURIComponent(next)}`);
  await page.fill('input[name="phoneOrEmail"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(url => url.pathname === next.split('?')[0], {
    timeout: 60_000,
  });
}

/**
 * Deletes the session cookie by visiting the logout route after server
 * logout. (Logout is POSTed via the sidebar dropdown when available.)
 */
export async function logout(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.context().clearCookies();
}

/**
 * Creates a payment through the real gateway (`POST /api/payments/init`).
 * No API key header needed while `GATEWAY_API_KEYS_REQUIRED` is unset —
 * exactly the documented default.
 *
 * A notification URL on a reserved port guarantees the first outbound
 * delivery fails fast (ECONNREFUSED) without touching the network.
 */
export const UNREACHABLE_NOTIFICATION_URL = 'http://127.0.0.1:9/gateway-e2e-target';

export interface InitResult {
  reference: string;
  amount: number;
  currency: string;
  response: Response;
}

export async function initGatewayPayment(options?: {
  reference?: string;
  amount?: number;
  currency?: string;
  notificationUrl?: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<InitResult> {
  const suffix = uniqueSuffix();
  const reference = options?.reference ?? `e2e-${suffix}`;
  const amount = options?.amount ?? 500;
  const currency = options?.currency ?? 'ETB';
  const response = await fetch(`${CHECKOUT_URL}/api/payments/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      currency,
      merchant_reference: reference,
      customer: {
        name: options?.customerName ?? 'E2E Shopper',
        email: options?.customerEmail ?? `e2e-${suffix}@example.test`,
        phone: '+251900000000',
      },
      notification_url: options?.notificationUrl ?? UNREACHABLE_NOTIFICATION_URL,
      return_url: `${CHECKOUT_URL}/payment/bridge`,
      cancel_url: `${CHECKOUT_URL}/payment/bridge`,
    }),
  });
  expect(response.ok).toBe(true);
  return { reference, amount, currency, response };
}

/** Accept every browser-native confirm() (rotate / revoke / cancel). */
export function acceptDialogs(page: Page): void {
  page.on('dialog', dialog => dialog.accept());
}

/**
 * Creates a staff user through the users page (admin only) and returns the
 * credentials, so RBAC steps can sign back in with them.
 */
export async function createStaffUser(
  page: Page,
  options?: { role?: 'operator' | 'viewer'; email?: string; name?: string; password?: string }
): Promise<{ email: string; name: string; password: string; role: string }> {
  const role = options?.role ?? 'operator';
  const email = options?.email ?? `staff-${uniqueSuffix()}@freegateway.test`;
  const name = options?.name ?? 'Staff User';
  const password = options?.password ?? `E2eStaff!${uniqueSuffix().slice(0, 6)}1A`;

  await page.goto(`${ADMIN_URL}/users`);
  await page.getByRole('button', { name: 'Add user' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Role').selectOption(role);
  await page.getByLabel('Initial password').fill(password);
  await page.getByRole('button', { name: 'Create user' }).last().click();
  await expect(page.getByRole('status')).toContainText(email, { timeout: 30_000 });

  return { email, name, password, role };
}
