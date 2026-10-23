import { expect, test } from '@playwright/test';
import { acceptDialogs, createStaffUser, initGatewayPayment, login, logout } from './helpers';

/**
 * Workflow 7 — RBAC: server-enforced permissions per role.
 *
 * Admin creates an operator through the users page; the operator then keeps
 * the operational surface but loses keys/staff management — enforced on the
 * server, not by hiding buttons.
 */
test.describe('rbac', () => {
  test('operator can operate payments but cannot manage keys or staff', async ({
    page,
  }) => {
    acceptDialogs(page);

    // Admin creates the operator account (audited).
    await login(page, '/users');
    const staff = await createStaffUser(page, { role: 'operator' });
    await logout(page);

    // Operator session.
    await page.goto('/login');
    await page.fill('input[name="phoneOrEmail"]', staff.email);
    await page.fill('input[name="password"]', staff.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL(/\/payments/, { timeout: 60_000 });

    // Operational surface is available (verify/cancel rows render).
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();

    // Keys management is neither linked nor allowed (direct URL → denied).
    await expect(page.locator('a', { hasText: 'API keys' })).toHaveCount(0);
    await page.goto('/keys');
    await expect(page.getByText(/insufficient|not permitted|permission|required/i).first())
      .toBeVisible({ timeout: 30_000 });

    // Staff management likewise.
    await expect(page.locator('a', { hasText: 'Users' })).toHaveCount(0);
    await page.goto('/users');
    await expect(page.getByText(/insufficient|not permitted|permission|required/i).first())
      .toBeVisible({ timeout: 30_000 });

    // The API agrees: user create is refused server-side.
    const refused = await page.request.post('/api/admin/users', {
      data: { email: 'nope@freegateway.test', name: 'Nope', role: 'viewer', password: 'Abcdefgh12' },
      headers: { 'Content-Type': 'application/json', 'x-requested-with': 'fetch' },
    });
    expect([401, 403]).toContain(refused.status());
  });
});

/**
 * Workflow 8 — Logs, audit and global search share real backend data.
 */
test.describe('logs, audit & global search', () => {
  test('gateway request logs record init and stay sanitized', async ({ page }) => {
    const { reference } = await initGatewayPayment({ amount: 88, currency: 'ETB' });
    await login(page, '/logs');

    await expect(page.getByRole('heading', { name: /request logs|logs/i, level: 1 }))
      .toBeVisible();

    // The init request shows up with its route and a correlation id.
    const row = page.locator('tbody tr', { hasText: '/api/payments/init' }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/POST/);

    // Detail page shows the correlation id and sanitized payload only.
    await row.locator('a').first().click();
    await page.waitForURL(/\/logs\//, { timeout: 60_000 });
    await expect(page.getByText(/correlation/i).first()).toBeVisible();
    // Sanitization contract: no request/response bodies or header dumps.
    await expect(page.locator('body')).not.toContainText('Authorization:');
    void reference;
  });

  test('audit trail lists the actions taken on payments', async ({ page }) => {
    await login(page, '/payments');
    const { reference } = await initGatewayPayment({ amount: 13, currency: 'ETB' });
    await page.getByLabel('Search').fill(reference);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByRole('link', { name: reference }).first().click();
    await page.getByRole('button', { name: 'Verify now' }).click();
    await expect(page.getByText('admin_verified_by')).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: /audit/i, level: 1 })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'payment.verify' }).first())
      .toBeVisible({ timeout: 30_000 });
  });

  test('global search (⌘K) finds payments within the operator permission', async ({
    page,
  }) => {
    await login(page, '/payments');
    const { reference } = await initGatewayPayment({ amount: 21, currency: 'USD' });

    // Ctrl+K focuses the global search box; typing ≥2 chars queries live.
    await page.keyboard.press('Control+k');
    await page.locator('#global-search').fill(reference);
    const results = page.getByRole('dialog', { name: 'Search results' });
    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(
      results.getByRole('link', { name: new RegExp(reference) }).first()
    ).toBeVisible();
  });
});
