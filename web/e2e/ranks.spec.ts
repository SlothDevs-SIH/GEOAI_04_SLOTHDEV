import { expect, test } from "@playwright/test";

// The map shows the ten highest-priority changes as numbered badges, and clicking a polygon or a badge explains it on the map itself.
test("numbered rank badges on the map, popup on select, badges follow the filter toggle", async ({ page }) => {
  await page.goto("./#/scene/pune-hinjewadi");
  await expect(page.getByTestId("counter")).toContainText("475 real changes");
  const badges = page.getByTestId("rank-marker");
  // one set per map (before and after), each side visible on its own half of the swipe divider
  await expect(badges).toHaveCount(20);
  const numbers = await page.locator(".maplibregl-map").nth(1).locator('[data-testid="rank-marker"]').allTextContents();
  expect(numbers.map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  await page.locator(".maplibregl-map").nth(1).locator('[data-testid="rank-marker"]').first().click({ force: true });
  await expect(page.getByTestId("rank")).toContainText("Rank 1 of 475 · Critical priority");
  await expect(page.getByTestId("map-popup")).toContainText("#1 of 475");
  await expect(page.getByTestId("map-popup")).toContainText("New construction");

  await page.getByTestId("filter-toggle").click();                     // raw candidates replace the filtered polygons: no badges
  await expect(page.getByTestId("rank-marker")).toHaveCount(0);
  await page.getByTestId("filter-toggle").click();
  await expect(page.getByTestId("rank-marker")).toHaveCount(20);
});

test("the report button downloads the full PDF", async ({ page, request }) => {
  await page.goto("./#/scene/assam-flood-2016");
  const link = page.getByTestId("export-report.pdf");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const r = await request.get(new URL(href as string, page.url()).toString());
  expect(r.status()).toBe(200);
  const body = await r.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(50_000);
});

test("the selected-change card keeps its height on a 1280x720 laptop screen (it once collapsed to 2 px and hid its buttons)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./#/scene/navi-mumbai-airport");
  await page.getByTestId("change-row").first().click();
  const card = await page.getByTestId("change-card").boundingBox();
  expect(card?.height).toBeGreaterThan(300);
  await page.getByTestId("confirm").click({ timeout: 5000 });
  await expect(page.getByTestId("confirm")).toContainText("Confirmed");
});
