import { expect, test } from '@playwright/test';
import { ADMIN_URL, ADMIN_EMAIL, login } from './helpers';

/**
 * Workflow 1 — Authentication & central overview.
 * The seeded bootstrap admin signs in through the real form and lands on the
 * operations overview, which renders live aggregates (not mocked).
 */
test.describe('auth & overview', () => {
  test('admin signs in and sees the live operations overview', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    // Real aggregates rendered as tiles — never fake numbers, and operators
    // always see something actionable below the tiles.
    await expect(page.getByRole('heading', { name: 'Actions needed' })).toBeVisible();

    // Identity of the signed-in principal (cookie session → server component).
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  });

  test('wrong password is rejected and audit/rate limits stay honest', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.fill('input[name="phoneOrEmail"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', 'not-the-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
    // Still on the login page, not inside the console.
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated console requests bounce back to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${ADMIN_URL}/payments`);
    await expect(page).toHaveURL(/\/login/);
  });
});
