import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/globalTeardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 120_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      /**
       * Phone-width layout coverage.
       *
       * A plain chromium project with an explicit viewport rather than
       * `devices['Pixel 7']`: the device descriptor also swaps the user agent
       * and enables full mobile emulation, which changes what
       * `detectIsTouch()` and the device-tier heuristics see. Keeping those
       * under our own control means a failure here is a layout failure, not a
       * tier-detection one. Tests that need the touch path opt in explicitly
       * via `?e2e=1&touch=1`.
       */
      name: 'mobile-chrome',
      testMatch: /(layout|editlock|menu|onboarding)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: false,
      },
    },
  ],
  webServer: {
    // The wrapper closes Vite through its JS API when globalTeardown drops a
    // cache sentinel. This avoids Playwright's hanging Windows taskkill path.
    command: 'node ./scripts/playwright-server.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
