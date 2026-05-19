import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for ReferenzMaß frontend E2E tests.
 *
 * These tests run against the Vite dev server (pnpm dev) and exercise
 * the real Svelte + Konva UI. Native Tauri dialogs and Rust commands
 * are not driven (they are out of scope for the current macOS-friendly
 * frontend E2E suite).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add more browsers later if desired:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});