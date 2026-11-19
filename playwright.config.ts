import { defineConfig, devices } from '@playwright/test';

const PORT = 8097;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  // Every test runs at a desktop and a phone-sized viewport; layout tests branch on the project name.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Runs the production build with no API key, so the built-in fallback path is exercised.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'node dist/server/server/index.js', env: { PORT: String(PORT), GEMINI_API_KEY: '' }, port: PORT, reuseExistingServer: false },
});
