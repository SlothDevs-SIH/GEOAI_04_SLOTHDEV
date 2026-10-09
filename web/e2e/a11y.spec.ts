import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility audit (axe-core, WCAG 2.0/2.1 A and AA rules) of every page, on a desktop and a phone viewport.
// Automated rules find only part of the problems (roughly a third); this does not replace a screen-reader check.
const PAGES: [string, string][] = [
  ["scenes", "./"],
  ["result (optical)", "./#/scene/navi-mumbai-airport"],
  ["result (radar)", "./#/scene/assam-flood-2016"],
  ["result (regional)", "./#/scene/delhi-ncr"],
  ["analyse (offline state)", "./#/analyse"],
  ["accuracy", "./#/accuracy"],
  ["about", "./#/about"],
];
const VIEWPORTS = [{ name: "desktop", width: 1280, height: 900 }, { name: "phone", width: 390, height: 844 }];

for (const vp of VIEWPORTS) {
  for (const [name, url] of PAGES) {
    test(`a11y ${vp.name}: ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(url);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(800);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // the basemap tiles are third-party and blocked offline; the map canvas itself is covered by the swipe handle labels
        .exclude(".maplibregl-canvas").analyze();
      const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      console.log(`${vp.name} ${name}: ${r.violations.length} violations (${serious.length} serious/critical), ${r.passes.length} rules passed` +
        r.violations.map((v) => `\n   - ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} elements)`).join(""));
      expect(serious, serious.map((v) => v.id).join(", ")).toEqual([]);
    });
  }
}
