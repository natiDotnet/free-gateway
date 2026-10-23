import { expect, test } from '@playwright/test';
import { acceptDialogs, initGatewayPayment, login } from './helpers';

/**
 * Workflow 4 — Admin cancellation of an open payment (permission-guarded,
 * audited, merchant notification attempted) and the honest "not
 * cancellable" path for final-status payments.
 */
test.describe('payment cancel', () => {
  test('cancels an open payment and records it everywhere', async ({ page }) => {
    acceptDialogs(page);
    const { reference } = await initGatewayPayment({ amount: 320.75, currency: 'ETB' });
    await login(page, '/payments');

    await page.getByLabel('Search').fill(reference);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByRole('link', { name: reference }).first().click();

    await page.getByRole('button', { name: 'Cancel payment' }).click();
    // window.confirm accepted automatically (acceptDialogs), UI refreshes.
    await expect(
      page.locator('header span', { hasText: 'cancelled' })
    ).toBeVisible({ timeout: 30_000 });

    // Action buttons disappear once the payment is a final state.
    await expect(page.getByRole('button', { name: 'Cancel payment' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Verify now' })).toBeHidden();

    // Payment event + audit trail recorded with the previous status.
    await expect(page.getByText('payment.cancelled')).toBeVisible();
    await expect(page.getByText('cancelled_by')).toBeVisible();
  });

  test('final-status payments cannot be cancelled twice (server-enforced)', async ({
    page,
  }) => {
    acceptDialogs(page);
    const { reference } = await initGatewayPayment({ amount: 10, currency: 'ETB' });
    await login(page, '/payments');

    await page.getByLabel('Search').fill(reference);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByRole('link', { name: reference }).first().click();
    await page.getByRole('button', { name: 'Cancel payment' }).click();
    await expect(page.locator('header span', { hasText: 'cancelled' })).toBeVisible({
      timeout: 30_000,
    });

    // Continue-against-the-rules: the backend must still refuse.
    const response = await page.request.post(
      `/api/payments/${encodeURIComponent(reference)}/cancel`,
      { headers: { 'x-requested-with': 'fetch' } }
    );
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(String(body.message)).toMatch(/cannot be cancelled|already/i);
  });
});
