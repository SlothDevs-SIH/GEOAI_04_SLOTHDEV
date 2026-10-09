import { expect, test } from "@playwright/test";

const PAGES = ["/", "/scene/bengaluru", "/scene/assam-flood-2016", "/accuracy", "/about", "/analyse"];
for (const [w, h] of [[360, 740], [1280, 800]]) {
  for (const path of PAGES) {
    test(`no horizontal scroll at ${w}px on ${path}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto(path);
      await page.waitForTimeout(2000);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await ctx.close();
    });
  }
}
