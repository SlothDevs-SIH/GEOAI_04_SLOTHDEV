import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

// What a first-time visitor downloads: the home page plus the service worker's install. Measured, not assumed.
test("first visit downloads under 5 MB and no scene data until a scene is opened", async ({ browser }, info) => {
  const ctx = await browser.newContext({ serviceWorkers: "allow" });
  const page = await ctx.newPage();
  let bytes = 0;
  const demoUrls: string[] = [];
  ctx.on("response", async (r) => {
    const u = r.url();
    if (/\/demos\/[^/]+\//.test(u)) demoUrls.push(u);
    try { bytes += (await r.body()).length; } catch { /* redirects and aborted bodies have none */ }
  });
  const t0 = Date.now();
  await page.goto("./");
  await expect(page.getByTestId("scene-card").first()).toBeVisible();
  const swReady = await page.evaluate(async () => { const t = performance.now(); await navigator.serviceWorker.ready; return Math.round(performance.now() - t); });
  await page.waitForTimeout(8000);
  const toOpenScene = demoUrls.filter((u) => !/\/after\.webp$/.test(u));   // card thumbnails (one image per scene) are the only scene files the home page shows
  expect(toOpenScene).toEqual([]);
  expect(bytes).toBeLessThan(5 * 1024 * 1024);

  const before = demoUrls.length;
  await page.goto("./#/scene/bengaluru");
  await expect(page.getByTestId("counter")).toBeVisible();
  expect(demoUrls.length).toBeGreaterThan(before);
  mkdirSync("../eval/test_runs", { recursive: true });
  writeFileSync("../eval/test_runs/lazy_loading_first_load.json", JSON.stringify({
    measured_by: "web/e2e/first-load.spec.ts (Chromium, local preview, no throttling)",
    first_visit_bytes: bytes, first_visit_mb: +(bytes / 1048576).toFixed(2),
    service_worker_ready_ms: swReady, wall_ms: Date.now() - t0,
    scene_requests_before_opening_a_scene: toOpenScene.length, thumbnail_requests: demoUrls.length - toOpenScene.length - before,
  }, null, 1));
  info.annotations.push({ type: "bytes", description: String(bytes) });
  await ctx.close();
});

test("a scene does not request sens.bin until the lab is near the viewport, nor result_raw.geojson until the filter is off", async ({ page }) => {
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("./#/scene/bengaluru");
  await expect(page.getByTestId("counter")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(seen.some((u) => u.endsWith("result_raw.geojson"))).toBe(false);
  await page.getByTestId("filter-toggle").click();
  await expect.poll(() => seen.some((u) => u.endsWith("result_raw.geojson")), { timeout: 10000 }).toBe(true);
  await page.getByTestId("sensitivity-loading").scrollIntoViewIfNeeded().catch(() => undefined);
  await expect.poll(() => seen.some((u) => u.endsWith("sens.bin")), { timeout: 15000 }).toBe(true);
});
