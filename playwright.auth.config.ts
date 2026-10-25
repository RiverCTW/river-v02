import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /session-auth\.live\.spec\.ts/,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5184",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "PORT=8794 RIVER_API_PORT=8794 RIVER_DB_PATH=.data/e2e-auth-v021.sqlite pnpm exec concurrently -k -n web,api \"vite --port 5184 --strictPort\" \"tsx watch server/index.ts\"",
    url: "http://127.0.0.1:5184",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
