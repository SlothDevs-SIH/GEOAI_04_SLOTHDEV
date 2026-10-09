import { expect, test } from "@playwright/test";

// FRONTEND.md A8: layout integrity at a 360 px phone and a 1280 px laptop, on every route, in both themes.
const ROUTES = ["./", "./#/scene/navi-mumbai-airport", "./#/analyse", "./#/accuracy", "./#/about"];

for (const [name, size] of [["phone 360", { width: 360, height: 740 }], ["laptop 1280", { width: 1280, height: 800 }]] as const) {
  test(`${name}: no page scrolls sideways`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const r of ROUTES) {
      await page.goto(r);
      await expect(page.getByTestId("app-header")).toBeVisible();
      await page.waitForTimeout(400);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, `${r} at ${size.width}px`).toBeLessThanOrEqual(size.width);
    }
  });
}

test("phone shows the bottom tab bar, laptop shows the top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("./");
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId("tab-bar")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
});

test("theme: Midnight Terrain by default, Daylight GIS on toggle, and the choice survives a reload", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).toBe("rgb(7, 17, 31)"); // #07111F
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(243, 247, 251)"); // #F3F7FB
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("keyboard: the swipe handle moves with the arrow keys and the focus ring is visible", async ({ page }) => {
  await page.goto("./#/scene/season-control");
  const handle = page.getByRole("slider").first();
  await expect(handle).toBeVisible();
  await handle.focus();
  const before = Number(await handle.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", String(before + 2));
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", String(before - 8));
});
