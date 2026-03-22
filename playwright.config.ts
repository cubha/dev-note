import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3002/dev-note/',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3002/dev-note/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
