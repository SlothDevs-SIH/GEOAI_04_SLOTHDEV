import { expect, test } from "@playwright/test";

const ignorable = (t: string) => /openstreetmap|ERR_|Failed to load resource/.test(t);

test("demo flow: scenes → result → toggle → select → confirm → permalink", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !ignorable(m.text()) && errors.push(m.text()));

  await page.goto("./");
  await expect(page.getByTestId("scene-card")).toHaveCount(7);
  await page.getByText("Navi Mumbai airport build-out").click();
  await expect(page.getByTestId("counter")).toHaveText("2,185 raw detections → 265 real changes");
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(2);
  // the map containers must have real size (maplibre CSS once collapsed them to 0 px)
  const box = await page.locator(".maplibregl-map").first().boundingBox();
  expect(box?.height).toBeGreaterThan(200);

  await page.getByTestId("change-row").first().click();
  await expect(page.getByTestId("reason")).toContainText("Why:");
  await expect(page).toHaveURL(/sel=1/);
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("confirm")).toContainText("Confirmed");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("filter-toggle").click();
  await expect(page.getByTestId("counter")).toHaveText("Filter off: 2,185 raw detections");

  // switching scenes in the same page must not break the map
  await page.goto("./#/scene/assam-flood-2016");
  await expect(page.getByTestId("scene-eval")).toBeVisible();
  await expect(page.getByTestId("counter")).toContainText("37 real changes");

  await page.goto("./#/scene/pune-hinjewadi?sel=1&filter=off");
  await expect(page.getByTestId("counter")).toContainText("Filter off");
  await expect(page.getByTestId("change-card")).toBeVisible();
  expect(errors).toEqual([]);
});

test("accuracy, analyse and about pages load", async ({ page }) => {
  await page.goto("./#/accuracy");
  await expect(page.getByTestId("acc-m8")).toBeVisible();
  await expect(page.getByTestId("acc-ablation")).toBeVisible();
  await page.goto("./#/analyse");
  await expect(page.getByTestId("analyse-offline")).toBeVisible();
  await page.goto("./#/about");
  await expect(page.getByText("How it works")).toBeVisible();
});

test("phone width has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/scene/season-control");
  await expect(page.getByTestId("counter")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
