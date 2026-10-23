import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Multi-environment loading.
 * Expects NODE_ENV to be 'dev' or 'staging'. Defaults to 'dev'.
 */
const isCI = !!process.env.CI;
const environment = process.env.NODE_ENV || 'dev';
dotenv.config({ path: path.resolve(__dirname, `.env.${environment}`), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env.example'), quiet: true });

const reporters: NonNullable<Parameters<typeof defineConfig>[0]['reporter']> = isCI
  ? [
      ['html', { open: 'never' }],
      ['list'],
      ['json', { outputFile: 'test-results/report.json' }],
    ]
  : [
      ['list'],
      ['html', { open: 'never' }],
      ['json', { outputFile: 'test-results/report.json' }],
    ];

export default defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup'),
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: reporters,
  use: {
    baseURL: process.env.BASE_URL || 'https://playwright.dev',
    testIdAttribute: 'data-qa',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      grep: /@smoke/,
    },
    {
      name: 'regression',
      use: { ...devices['Desktop Chrome'] },
      grep: /@regression/,
    },
  ],
});
