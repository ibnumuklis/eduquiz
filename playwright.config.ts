import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", channel: process.env.PW_CHANNEL ?? "chrome" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "chrome" } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, hasTouch: true, channel: process.env.PW_CHANNEL ?? "chrome" } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, channel: process.env.PW_CHANNEL ?? "chrome" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next start -p 3100", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
