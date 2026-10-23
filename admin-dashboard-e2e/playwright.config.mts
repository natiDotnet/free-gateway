import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * This gateway is a two-app setup:
 *  - checkout (public gateway API + hosted checkout) on :3000
 *  - admin-dashboard (console under test) on :3001
 *
 * BASE_URL / ADMIN_URL can point CI at deployed instances; locally both dev
 * servers are started (reused when already running).
 */
const checkoutURL = process.env['BASE_URL'] || 'http://localhost:3000';
const adminURL = process.env['ADMIN_URL'] || 'http://localhost:3001';

/**
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  testMatch: ['**/*.spec.ts'],
  testIgnore: ['**/example.spec.ts'],
  /* Next dev compiles routes lazily — give first navigation generous time */
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: adminURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npx nx run @org/checkout:dev',
      url: checkoutURL,
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:admin-dashboard',
      url: adminURL,
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Firefox/WebKit are listed for CI (they follow the same flows); enable
     * them once the first chromium run is green in CI:
     * {
     *   name: 'firefox',
     *   use: { ...devices['Desktop Firefox'] },
     * },
     * {
     *   name: 'webkit',
     *   use: { ...devices['Desktop Safari'] },
     * }, */
  ],
});
