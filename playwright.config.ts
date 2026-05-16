import { defineConfig, devices } from '@playwright/test';

/**
 * URL do SPA sob teste. Sobrescreva com `PLAYWRIGHT_BASE_URL` (ex.: em CI ou
 * quando o dev server roda em outra porta/host).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3002';

/** Variáveis mínimas para o Vite subir sem `.env` local (smoke E2E). */
const webServerEnv: Record<string, string> = {
  VITE_SYSTEM_ID:
    process.env.VITE_SYSTEM_ID ?? '00000000-0000-0000-0000-000000000000',
  VITE_AUTH_API_BASE_URL:
    process.env.VITE_AUTH_API_BASE_URL ?? 'http://127.0.0.1:8080/api/v1',
  PORT: process.env.PORT ?? '3002',
  HOST: '127.0.0.1',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3002',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webServerEnv,
  },
});
