import { defineConfig } from '@playwright/test'

// Full-stack: front-end dev server pointed at the test API (fake Google verification, SQLite).
export default defineConfig({
  testDir: './e2e-sync',
  workers: 1,
  use: { baseURL: 'http://localhost:5174' },
  webServer: [
    {
      command: 'uv run python -m tests.e2e_server',
      cwd: '../back-end',
      url: 'http://localhost:8001/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 5174',
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:8001' },
      reuseExistingServer: false,
    },
  ],
})
