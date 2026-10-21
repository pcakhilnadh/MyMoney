import { defineConfig } from '@playwright/test'

// Runs against the production build so the service worker is active.
export default defineConfig({
  testDir: './e2e-pwa',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
