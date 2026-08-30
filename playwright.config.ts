import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  expect: {
    timeout: 15_000,
  },
  timeout: 30_000,
  use: {
    trace: 'on-first-retry',
  },
});
