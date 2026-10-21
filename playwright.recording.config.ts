import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/master-recording.recording.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results-master",
  reporter: [["html", { outputFolder: "playwright-report-master", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: "on",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
