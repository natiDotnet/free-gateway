import { expect, test } from '@playwright/test';
import { acceptDialogs, initGatewayPayment, login } from './helpers';

/**
 * Workflow 6 — Outbound webhook deliveries & manual retry.
 *
 * Every payment here ships an unreachable notification URL, so `verify`
 * produces a genuinely failed delivery; the retry endpoint attempts a real
 * HTTP call (fails again) and the UI reports it exactly — no fake success.
 */
test.describe('webhook deliveries', () => {
  test('failed delivery appears, retry is attempted honestly, attempts increment', async ({
    page,
  }) => {
    acceptDialogs(page);
    const { reference } = await initGatewayPayment({ amount: 42, currency: 'ETB' });

    // Server-side re-verify triggers the outbound notification attempt for
    // the stored notification_url (the payment has one from init).
    await login(page, '/payments');
    await page.getByLabel('Search').fill(reference);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByRole('link', { name: reference }).first().click();
    await page.getByRole('button', { name: 'Verify now' }).click();
    await expect(page.getByRole('button', { name: 'Verify now' })).toBeDisabled();

    await page.goto('/webhooks');
    await expect(page.getByRole('heading', { name: /webhooks/i, level: 1 })).toBeVisible();

    const deliveryRow = page.locator('tbody tr', { hasText: reference }).first();
    await expect(deliveryRow).toBeVisible({ timeout: 30_000 });
    await expect(deliveryRow).toContainText(/failed/);

    const attemptsBefore = parseInt(
      (await deliveryRow.locator('td').nth(3).textContent())?.match(/\d+/)?.[0] ?? '0',
      10
    );

    await deliveryRow.getByRole('button', { name: 'Retry' }).click();
    // The retry really connects to 127.0.0.1:9 — it must be reported as a
    // failure, not manufactured into success.
    await expect(page.getByText(/failed|unreachable|error|ECONN|refused/i).first())
      .toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const row = page.locator('tbody tr', { hasText: reference }).first();
          return parseInt(
            (await row.locator('td').nth(3).textContent())?.match(/\d+/)?.[0] ?? '0',
            10
          );
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(attemptsBefore);

    // The row still shows a failure state after retry.
    await expect(page.locator('tbody tr', { hasText: reference }).first()).toContainText(
      /failed/
    );
  });

  test('inbound provider events are listed alongside outbound attempts', async ({
    page,
  }) => {
    await login(page, '/webhooks');
    // The page distinguishes outbound deliveries from inbound provider events.
    await expect(page.getByText(/outbound/i).first()).toBeVisible();
    await expect(page.getByText(/inbound/i).first()).toBeVisible();
  });
});
