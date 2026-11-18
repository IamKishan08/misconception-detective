import { defineConfig, devices } from '@playwright/test';

const PORT = 8097;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`, ...devices['Pixel 7'] },
  // Runs the production build with no API key, so the offline fallback path is exercised.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'node dist/server/server/index.js', env: { PORT: String(PORT), GEMINI_API_KEY: '' }, port: PORT, reuseExistingServer: false },
});
