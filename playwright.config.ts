import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/qa/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/qa/',
      env: {
        EMIFOOT_BASE_PATH: '/qa/',
        EMIFOOT_PUBLIC_URL: 'http://127.0.0.1:4173/qa/',
        VITE_MULTIPLAYER_WS_URL: 'ws://127.0.0.1:18789/ws',
      },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm build:server && pnpm start:server',
      url: 'http://127.0.0.1:18789/health',
      env: { HOST: '127.0.0.1', PORT: '18789', NODE_ENV: 'production' },
      reuseExistingServer: false,
    },
  ],
})
