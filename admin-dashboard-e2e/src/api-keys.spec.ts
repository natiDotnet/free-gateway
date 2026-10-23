import { expect, test } from '@playwright/test';
import { acceptDialogs, login, uniqueSuffix } from './helpers';

/**
 * Workflow 2 — API-key lifecycle with a one-time secret.
 *
 * The gateway enforces keys only when GATEWAY_API_KEYS_REQUIRED=true, but the
 * secret-handling contract is always active: SHA-256 hash storage, one-time
 * reveal, rotate = revoke + linked replacement, and revoke is immediate.
 */
test.describe('api keys', () => {
  test('create → one-time reveal → rotate → revoke, secret never shown twice', async ({
    page,
  }) => {
    const name = `e2e storefront ${uniqueSuffix()}`;
    acceptDialogs(page);
    await login(page, '/keys');

    await expect(page.getByRole('heading', { name: /API keys/i })).toBeVisible();

    // Create
    await page.getByRole('button', { name: 'Create API key' }).click();
    await page.getByLabel('Key name').fill(name);
    await page.getByRole('button', { name: 'Create key' }).click();

    // One-time reveal dialog carries a fgk_ secret exactly once.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const secret = await dialog.locator('code').first().textContent();
    expect(secret).toMatch(/^fgk_[0-9a-f]{64}$/);
    await dialog.getByRole('button', { name: 'I saved it — close' }).click();
    await expect(dialog).toBeHidden();

    // Row exists; the plaintext secret is gone from the page entirely.
    const row = page.locator('tr', { hasText: name }).first();
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(secret!);

    // Rotate: secret replaced; the old prefix row becomes revoked + rotated.
    await row.getByRole('button', { name: 'Rotate' }).click();
    const rotatedDialog = page.getByRole('dialog');
    await expect(rotatedDialog).toBeVisible();
    const newSecret = await rotatedDialog.locator('code').first().textContent();
    expect(newSecret).toMatch(/^fgk_[0-9a-f]{64}$/);
    expect(newSecret).not.toEqual(secret);
    await expect(page.locator('tr', { hasText: name })).toContainText('rotated');
    await rotatedDialog.getByRole('button', { name: 'I saved it — close' }).click();
    await expect(rotatedDialog).toBeHidden();

    // Revoke: every remaining row for this key name is revoked (old + child).
    await page.getByRole('button', { name: 'Revoke' }).first().click();
    // The row list refreshes after rotate/revoke; poll until all rows agree.
    await expect
      .poll(
        async () => {
          const rows = page.locator('tbody tr', { hasText: name.split(' ')[0] }).filter({
            hasText: name,
          });
          const count = await rows.count();
          if (count === 0) return 0;
          const statuses: string[] = [];
          for (let i = 0; i < count; i++) {
            statuses.push((await rows.nth(i).textContent()) ?? '');
          }
          return statuses.every(status => status.includes('✕ revoked')) ? count : 0;
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
    await expect(page.locator('tbody tr', { hasText: name }).first()).not.toContainText(
      secret!
    );
  });
});
