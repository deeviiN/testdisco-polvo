import { test, expect } from "../playwright-fixture";

/**
 * After scrolling on /sectors, the central round button must remain:
 *  - exactly at the geometric centroid of the 6 outer buttons,
 *  - co-centered with its decorative halo + ring,
 * across 320 / 375 / 428 px viewports.
 */

const VIEWPORTS = [
  { name: "iPhone SE (320px)", width: 320, height: 568 },
  { name: "iPhone X (375px)",  width: 375, height: 812 },
  { name: "iPhone 14+ (428px)", width: 428, height: 926 },
];

const TOLERANCE_PX = 1.5;
const SCROLL_STEPS = [0, 120, 280, 600];

for (const vp of VIEWPORTS) {
  test(`central button stays centered after scrolling @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/sectors");

    const centerButton = page
      .locator("button.rounded-full")
      .filter({ hasText: /Lab\.?\s*(de\s*)?Ci[êe]ncias/i })
      .first();
    await expect(centerButton).toBeVisible({ timeout: 10_000 });

    const outerButtons = page.locator("div.grid.grid-cols-3.grid-rows-2 > button");
    await expect(outerButtons).toHaveCount(6);

    const wrapper = centerButton.locator("xpath=ancestor::div[contains(@class,'absolute')][1]");
    const decorativeLayers = wrapper.locator("div.rounded-full.pointer-events-none");

    for (const scrollY of SCROLL_STEPS) {
      // Try scrolling both window and the inner app shell (the page uses h-dvh + overflow-hidden).
      await page.evaluate((y) => {
        window.scrollTo(0, y);
        document.querySelectorAll<HTMLElement>("main, .app-shell, .app-frame").forEach((el) => {
          el.scrollTop = y;
        });
      }, scrollY);
      await page.waitForTimeout(120);

      // Centroid of outer 6
      const outerBoxes = await outerButtons.evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = (n as HTMLElement).getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      const centroidX = outerBoxes.reduce((a, b) => a + b.x + b.w / 2, 0) / outerBoxes.length;
      const centroidY = outerBoxes.reduce((a, b) => a + b.y + b.h / 2, 0) / outerBoxes.length;

      const cBox = await centerButton.boundingBox();
      expect(cBox, `centre button bbox @ scroll=${scrollY}`).not.toBeNull();
      if (!cBox) continue;
      const cx = cBox.x + cBox.width / 2;
      const cy = cBox.y + cBox.height / 2;

      expect(
        Math.abs(cx - centroidX),
        `[scroll=${scrollY}] X off-center by ${Math.abs(cx - centroidX).toFixed(2)}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(
        Math.abs(cy - centroidY),
        `[scroll=${scrollY}] Y off-center by ${Math.abs(cy - centroidY).toFixed(2)}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);

      // Halos / rings co-centered with the round button
      const layerCount = await decorativeLayers.count();
      for (let i = 0; i < layerCount; i++) {
        const lb = await decorativeLayers.nth(i).boundingBox();
        if (!lb) continue;
        const lx = lb.x + lb.width / 2;
        const ly = lb.y + lb.height / 2;
        expect(
          Math.abs(lx - cx),
          `[scroll=${scrollY}] layer #${i} X off-center by ${Math.abs(lx - cx).toFixed(2)}px`,
        ).toBeLessThanOrEqual(TOLERANCE_PX);
        expect(
          Math.abs(ly - cy),
          `[scroll=${scrollY}] layer #${i} Y off-center by ${Math.abs(ly - cy).toFixed(2)}px`,
        ).toBeLessThanOrEqual(TOLERANCE_PX);
      }
    }
  });
}
