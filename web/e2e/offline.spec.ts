import { expect, test } from "@playwright/test";

test("the demo opens with no network after the first visit", async ({ page, context }) => {
  await page.goto("./");
  await expect(page.getByTestId("scene-card")).toHaveCount(7);
  // wait until the service worker is active and has cached the site and the demo scenes
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 60; i++) {
      const keys = await caches.keys();
      if (keys.length) {
        const n = (await (await caches.open(keys[0])).keys()).length;
        if (n > 100) return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("the offline cache was not filled in time");
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("scene-card")).toHaveCount(7);
  await expect(page.getByTestId("offline-badge")).toBeVisible();

  await page.getByText("Navi Mumbai airport build-out").click();
  await expect(page.getByTestId("counter")).toHaveText("2,185 raw detections → 265 real changes");
  await page.getByTestId("change-row").first().click();
  await expect(page.getByTestId("reason")).toContainText("Why:");
  // the live sensitivity lab works offline too, and agrees with the server at the default settings
  await expect(page.getByTestId("lab-count")).toContainText("265 changes");
  await page.getByTestId("lab-threshold").fill("0.95");
  await expect(page.getByTestId("lab-count")).not.toContainText("265 changes");

  // live analysis is honestly unavailable offline, not a blank page
  await page.goto("./#/analyse");
  await expect(page.getByTestId("analyse-offline")).toBeVisible();
});
