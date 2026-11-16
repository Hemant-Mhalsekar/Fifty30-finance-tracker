import { defineConfig, devices } from '@playwright/test'

// Browser tests run the real frontend (Vite dev server) against e2e/mock-api.mjs on port 8080,
// which is where vite.config.ts proxies /api. Stop a locally running backend first.
const MOCK_API = 'http://localhost:8080'
const APP = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // The mock API holds one shared state that each test resets, so tests must not run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP,
    trace: 'retain-on-failure',
    // Lets a machine with a preinstalled Chromium reuse it instead of downloading one.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    // Most use is on a phone, so the main suite runs at phone size.
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'node e2e/mock-api.mjs',
      url: `${MOCK_API}/api/ping`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: APP,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
