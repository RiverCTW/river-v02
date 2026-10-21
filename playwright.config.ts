import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5183",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "RIVER_E2E_BYPASS_AUTH=1 VITE_E2E_LOCAL_ONLY=1 PORT=8793 RIVER_API_PORT=8793 RIVER_DB_PATH=.data/e2e.sqlite pnpm exec concurrently -k -n web,api \"vite --port 5183 --strictPort\" \"tsx watch server/index.ts\"",
    url: "http://127.0.0.1:5183",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
