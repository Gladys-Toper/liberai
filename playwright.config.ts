import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Auth setup — creates storageState for authenticated tests
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // Unauthenticated tests don't depend on setup
    {
      name: 'unauthenticated',
      testMatch: /.*\.unauth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Dev server already running via preview_start, don't launch another
  webServer: process.env.CI
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
})
