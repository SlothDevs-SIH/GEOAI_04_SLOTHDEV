import { expect, test, type Page } from "@playwright/test";
import { startServer } from "./staticServer";

// Scenes are cached when first opened or when "Save for offline" is pressed; the shell is precached.
// the lab is lazy: its data loads once the card is near the viewport
const reachLab = (page: Page) => page.getByTestId("sensitivity-loading").or(page.getByTestId("sensitivity-lab")).first().scrollIntoViewIfNeeded();

async function workerControlsPage(page: Page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();   // after a reload the active worker controls the page, so later requests go through its caches
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test("a scene opened online still opens with no network, lab included; one never opened says so plainly", async ({ page }) => {
  const srv = await startServer();
  await page.goto(srv.url);
  await expect(page.getByTestId("scene-card").first()).toBeVisible();
  await workerControlsPage(page);

  await page.goto(srv.url + "#/scene/navi-mumbai-airport");
  await expect(page.getByTestId("counter")).toHaveText("2,185 raw detections → 265 real changes");
  await reachLab(page);
  await expect(page.getByTestId("lab-count")).toContainText("265 changes", { timeout: 15000 });
  await page.getByTestId("change-row").first().click();   // fetches that change's crops, which are cached too

  srv.setDown(true);   // the network is gone
  await page.reload();
  await expect(page.getByTestId("counter")).toHaveText("2,185 raw detections → 265 real changes");
  await reachLab(page);
  await expect(page.getByTestId("lab-count")).toContainText("265 changes", { timeout: 15000 });
  await page.getByTestId("lab-threshold").fill("0.95");
  await expect(page.getByTestId("lab-count")).not.toContainText("265 changes");

  await page.goto(srv.url + "#/scene/guwahati");           // never opened, never saved
  await page.reload();
  await expect(page.getByTestId("scene-not-saved")).toContainText("not saved for offline use");
  await expect(page.getByTestId("error-state")).toBeVisible();

  await page.goto(srv.url + "#/analyse");                  // live analysis is honestly unavailable offline
  await expect(page.getByTestId("analyse-offline")).toBeVisible();
  await srv.close();
});

test("Save for offline caches the whole scene, which then opens with the network off", async ({ page }) => {
  const srv = await startServer();
  await page.goto(srv.url);
  await expect(page.getByTestId("scene-card").first()).toBeVisible();
  await workerControlsPage(page);

  await page.goto(srv.url + "#/scene/pune-hinjewadi");
  await expect(page.getByTestId("counter")).toBeVisible();
  await page.getByTestId("save-offline").click();
  await expect(page.getByTestId("save-offline-status")).toContainText("Saved on this device", { timeout: 40000 });
  await expect(page.getByTestId("save-offline")).toContainText("Saved for offline");

  srv.setDown(true);
  await page.goto(srv.url + "#/scene/season-control");
  await page.goto(srv.url + "#/scene/pune-hinjewadi");
  await page.reload();
  await expect(page.getByTestId("counter")).toBeVisible();
  await reachLab(page);
  await expect(page.getByTestId("lab-count")).toBeVisible({ timeout: 15000 });
  await srv.close();
});
