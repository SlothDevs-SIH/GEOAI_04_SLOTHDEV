import { expect, test } from "@playwright/test";

test("scenes -> flood scene -> swipe -> filter toggle -> counter -> export -> accuracy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scene-card").first()).toBeVisible();
  expect(await page.getByTestId("scene-card").count()).toBeGreaterThanOrEqual(7);
  await page.getByTestId("scene-card").filter({ hasText: "Bengaluru" }).click();
  await expect(page).toHaveURL(/\/scene\/bengaluru/);
  await expect(page.getByTestId("counter")).toContainText("raw detections → 272 real changes", { timeout: 15000 });
  const map = page.getByTestId("compare-map");
  await expect(map).toBeVisible();

  // keyboard swipe: arrows move 2%, shift 10%
  const handle = page.getByTestId("swipe-handle");
  await handle.focus();
  await expect(handle).toHaveAttribute("aria-valuenow", "50");
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "52");
  await handle.press("Shift+ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "42");
  await expect(page).toHaveURL(/swipe=42/, { timeout: 5000 });

  // filter toggle changes the counter
  await page.getByTestId("filter-toggle").click();
  await expect(page.getByTestId("counter")).toContainText("Filter off: 6,117 raw detections");
  await expect(page).toHaveURL(/filter=off/, { timeout: 5000 });
  await page.getByTestId("filter-toggle").click();
  await expect(page.getByTestId("counter")).toContainText("272 real changes");

  // select a row -> change card, confirm
  await page.getByTestId("change-row").first().click();
  await expect(page.getByTestId("reason")).toBeVisible();
  await page.getByTestId("btn-confirm").click();
  await expect(page.getByTestId("tab-confirmed")).toContainText("(1)");

  // sensitivity lab matches the server count at default
  await expect(page.getByTestId("lab-count")).toContainText("changes", { timeout: 15000 });
  await expect(page.getByTestId("export-changes.geojson")).toBeVisible();

  await page.getByTestId("tab-accuracy").click();
  await expect(page.getByTestId("acc-oscd")).toBeVisible();
  await expect(page.getByTestId("acc-levir")).toBeVisible();
  await expect(page.getByTestId("acc-not-measured")).toBeVisible();
});

test("deep link restores selection, filter and divider", async ({ page }) => {
  await page.goto("/scene/bengaluru?sel=1&filter=off&swipe=70");
  await expect(page.getByTestId("counter")).toContainText("Filter off", { timeout: 15000 });
  await expect(page.getByTestId("swipe-handle")).toHaveAttribute("aria-valuenow", "70");
});

test("radar scene shows expert-label toggle and no sensitivity lab", async ({ page }) => {
  await page.goto("/scene/assam-flood-2016");
  await expect(page.getByTestId("labels-toggle")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("sensitivity-lab")).toHaveCount(0);
  await expect(page.getByTestId("scene-eval")).toBeVisible();
});

test("theme toggle switches palette", async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("analyse page: offline notice when no API is configured", async ({ page }) => {
  await page.goto("/analyse");
  await expect(page.getByTestId("analyse-offline")).toBeVisible();
});
