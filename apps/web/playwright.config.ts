// /apps/web/playwright.config.ts

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html"]] : "html",
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
  // Playwright owns the frontend dev server. The backend (uvicorn) is the
  // runner's responsibility — start it externally with FRAMEBOARD_TEST_MODE=1
  // before running these tests. CI does this in the workflow job.
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !isCI,
  },
});
