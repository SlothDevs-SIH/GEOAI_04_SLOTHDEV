import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: "http://localhost:4173", launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" } },
  webServer: { command: "node scripts/serve.mjs", url: "http://localhost:4173", reuseExistingServer: true },
});
