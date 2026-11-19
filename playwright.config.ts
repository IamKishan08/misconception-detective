import { defineConfig, devices } from '@playwright/test';

const PORT = 8097;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  // In CI keep an HTML report and traces so a red run can be diagnosed from the uploaded artifact, not just an exit code.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  // Every test runs at a desktop and a phone-sized viewport; layout tests branch on the project name.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Runs the production build with no API key, so the built-in fallback path is exercised. Every test shares one client
  // address, so the per-minute limit is raised here; the limit itself is covered by the API tests.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'node dist/server/server/index.js', env: { PORT: String(PORT), GEMINI_API_KEY: '', RATE_LIMIT_PER_MINUTE: '600' }, port: PORT, reuseExistingServer: false },
});
