import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const SINK_PORT = 3299;

// Runs against the production build (`npm run test:e2e` builds first). Flags come from the
// real Flagsmith environment; events go to a local sink so tests can assert them and the
// real experiment is never polluted.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `node e2e/events-sink.mjs ${SINK_PORT}`,
      url: `http://127.0.0.1:${SINK_PORT}/`,
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/`,
      env: { FLAGSMITH_EVENTS_API_URL: `http://127.0.0.1:${SINK_PORT}/` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
