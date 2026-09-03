import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["line"]] : "line",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4317",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node scripts/build-ui-fixture.mjs && node scripts/serve-ui-fixture.mjs",
    url: "http://127.0.0.1:4317/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
