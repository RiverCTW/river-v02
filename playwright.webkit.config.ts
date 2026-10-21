import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/webkit-smoke.webkit.ts"],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5183",
    browserName: "webkit",
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: "retain-on-failure",
  },
});
