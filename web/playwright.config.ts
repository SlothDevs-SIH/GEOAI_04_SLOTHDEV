import { defineConfig } from "@playwright/test";

// Smoke test against the production build (npm run build first). Basemap tiles may be blocked; the scene images are local.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173/",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/", reuseExistingServer: true },
});
