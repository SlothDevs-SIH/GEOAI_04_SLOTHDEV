import { expect, test } from "@playwright/test";

test("service worker precaches; a visited demo scene opens with the network off, and the lab works", async ({ page, context }) => {
  await page.goto("/scene/bengaluru");
  await expect(page.getByTestId("counter")).toContainText("272 real", { timeout: 15000 });
  await expect(page.getByTestId("lab-count")).toContainText("changes", { timeout: 15000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // now controlled by the worker, which caches what loads
  await expect(page.getByTestId("counter")).toContainText("272 real", { timeout: 15000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("counter")).toContainText("272 real", { timeout: 15000 });
  await expect(page.getByTestId("lab-count")).toContainText("changes", { timeout: 15000 });
  await context.setOffline(false);
});
