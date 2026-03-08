import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Simionic G1000 Custom Profiles UI tests.
 *
 * Tests are in ./tests/ui/ and cover AC-UI-01 through AC-UI-14.
 *
 * The test suite spins up a Next.js dev server automatically. A real MongoDB
 * is NOT required — every test mocks its own API calls via page.route().
 *
 * Environment variables used:
 *   NEXTAUTH_SECRET  – required by Next.js at startup (any string works for tests).
 *   MONGODB_URI      – set to a non-routable address; lazy connections mean it is
 *                      never actually opened because API routes are fully mocked.
 *   MONGODB_DB       – arbitrary name; same reason as above.
 *
 * Run with:
 *   npx playwright test
 *
 * Or to view the report afterwards:
 *   npx playwright show-report
 */
export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Start the Next.js dev server. A production build is not required.
    command: "npx next dev --port 3000",
    url: "http://localhost:3000",
    // Reuse an already-running server when developing locally to save time.
    reuseExistingServer: !process.env.CI,
    // Timeout for the server to become ready (ms).
    timeout: 120_000,
    env: {
      NEXTAUTH_SECRET: "playwright-test-secret-do-not-use-in-production",
      NEXTAUTH_URL: "http://localhost:3000",
      // MongoDB is never actually contacted because every test mocks API routes.
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_DB: "simionic-playwright-test",
      NODE_ENV: "test",
    },
  },
});
