import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/master-recording.recording.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results-master",
  reporter: [["html", { outputFolder: "playwright-report-master", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: "on",
  },
  webServer: {
    command: "RIVER_E2E_BYPASS_AUTH=1 VITE_E2E_LOCAL_ONLY=1 PORT=8793 RIVER_API_PORT=8793 RIVER_DB_PATH=.data/e2e.sqlite pnpm exec concurrently -k -n web,api \"vite --port 5183 --strictPort\" \"tsx watch server/index.ts\"",
    url: "http://127.0.0.1:5183",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
