import { expect, test } from '@playwright/test';
import { acceptDialogs, initGatewayPayment, login } from './helpers';

/**
 * Workflow 3 — Payments workspace: server-side pagination, filtering,
 * search, detail drill-down and the audit-recorded "verify now" action.
 */
test.describe('payments workspace', () => {
  let reference: string;

  test.beforeEach(async () => {
    reference = (await initGatewayPayment({ amount: 750, currency: 'USD' })).reference;
  });

  test('list, filter, search, drill down and verify a real payment', async ({ page }) => {
    acceptDialogs(page);
    await login(page, '/payments');

    await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();

    // Search finds the freshly initialized payment (server-side SQL LIKE).
    await page.getByLabel('Search').fill(reference);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('tbody tr', { hasText: reference })).toHaveCount(1);

    // Status filter narrows to pending (fresh init is pending).
    await page.getByLabel('Search').fill('');
    await page.getByLabel('Status').selectOption('pending');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('tbody tr', { hasText: reference })).toHaveCount(1);

    // Detail page: real timeline appears after the admin "verify now" hit.
    await page.getByRole('link', { name: reference }).first().click();
    await expect(page).toHaveURL(new RegExp(reference));
    await expect(page.getByRole('heading', { name: reference, level: 1 })).toBeVisible();

    const eventsBefore = await page
      .getByRole('heading', { name: 'Event timeline' })
      .locator('..')
      .locator('li')
      .count();

    await page.getByRole('button', { name: 'Verify now' }).click();
    await expect(
      page.getByRole('heading', { name: 'Event timeline' }).locator('..').locator('li')
    ).toHaveCount(eventsBefore + 1);
    await expect(page.getByText('admin_verified_by')).toBeVisible();

    // Amount/currency are shown per-currency, no FX conversion.
    await expect(page.getByText('750.00')).toBeVisible();
    await expect(page.getByText('USD')).toBeVisible();
  });

  test('filters survive navigation to another page', async ({ page }) => {
    await login(page, '/payments');
    await initGatewayPayment({ amount: 1, currency: 'ETB' });

    // Deep link into page 2 with the pending filter — filters must be
    // preserved by whichever pagination control is used.
    await page.goto('/payments?status=pending&page=2');
    await expect(page.getByLabel('Status')).toHaveValue('pending');
    await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();

    // Any visible row carries an e2e payment or an existing pending one —
    // but never a different status than the applied filter.
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/pending/);
    }
  });
});
