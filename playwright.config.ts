import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT || '3001';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: `http://localhost:${port}/api/health`,
    env: { PORT: port, NODE_ENV: 'production', LUNA_ENABLED: 'false', OPENAI_API_KEY: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
