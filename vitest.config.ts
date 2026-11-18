import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/{engine,api,web}/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/web/main.tsx', 'src/server/index.ts'] },
  },
});
