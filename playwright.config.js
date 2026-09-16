import { defineConfig } from '@playwright/test'
import { PORT, contextOptions } from './e2e/env.js'

// Browser tests against the production build. e2e/serve.mjs builds the client,
// prepares a throwaway DATA_DIR with two venues and starts the server on a
// spare port; see docs/plans/e2e.md.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The server holds the whole floor in memory, so the specs run one at a time
  // and each uses its own table numbers.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...contextOptions,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
