import { test, expect } from "../playwright-fixture";

/**
 * Verifies that the central round button on /sectors (and its decorative halo/ring)
 * sits EXACTLY in the geometric middle of the surrounding 3x2 grid of 6 sector buttons,
 * across 320 / 375 / 428 px viewports.
 */

const VIEWPORTS = [
  { name: "iPhone SE (320px)", width: 320, height: 568 },
  { name: "iPhone X (375px)",  width: 375, height: 812 },
  { name: "iPhone 14+ (428px)", width: 428, height: 926 },
];

const POSITION_TOLERANCE_PX = 1.5;

for (const vp of VIEWPORTS) {
  test(`central round button is centered between the 6 outer buttons @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/sectors");

    // The 6 outer buttons are square-ish (rounded-[18px]); the central one is rounded-full.
    const centerButton = page
      .locator("button.rounded-full")
      .filter({ hasText: /Lab\.?\s*(de\s*)?Ci[êe]ncias/i })
      .first();

    await expect(centerButton).toBeVisible({ timeout: 10_000 });

    // Outer buttons live in the 3x2 grid (siblings of the absolute center wrapper).
    const outerButtons = page.locator("div.grid.grid-cols-3.grid-rows-2 > button");
    await expect(outerButtons).toHaveCount(6);

    // 1) Geometric centroid of the 6 outer buttons
    const outerBoxes = await outerButtons.evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = (n as HTMLElement).getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const centroidX =
      outerBoxes.reduce((acc, b) => acc + b.x + b.w / 2, 0) / outerBoxes.length;
    const centroidY =
      outerBoxes.reduce((acc, b) => acc + b.y + b.h / 2, 0) / outerBoxes.length;

    // 2) Center of the round button
    const cBox = await centerButton.boundingBox();
    expect(cBox).not.toBeNull();
    if (!cBox) return;
    const cx = cBox.x + cBox.width / 2;
    const cy = cBox.y + cBox.height / 2;

    expect(
      Math.abs(cx - centroidX),
      `round button X off-center by ${Math.abs(cx - centroidX).toFixed(2)}px`,
    ).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
    expect(
      Math.abs(cy - centroidY),
      `round button Y off-center by ${Math.abs(cy - centroidY).toFixed(2)}px`,
    ).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);

    // 3) The button must also be a perfect circle (width === height)
    expect(Math.abs(cBox.width - cBox.height)).toBeLessThanOrEqual(0.5);

    // 4) Halo + decorative ring must be co-centered with the button
    const wrapper = centerButton.locator("xpath=ancestor::div[contains(@class,'absolute')][1]");
    const decorativeLayers = wrapper.locator("div.rounded-full.pointer-events-none");
    const layerCount = await decorativeLayers.count();
    for (let i = 0; i < layerCount; i++) {
      const lb = await decorativeLayers.nth(i).boundingBox();
      if (!lb) continue;
      const lx = lb.x + lb.width / 2;
      const ly = lb.y + lb.height / 2;
      expect(
        Math.abs(lx - cx),
        `decorative layer #${i} X off-center vs button by ${Math.abs(lx - cx).toFixed(2)}px`,
      ).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
      expect(
        Math.abs(ly - cy),
        `decorative layer #${i} Y off-center vs button by ${Math.abs(ly - cy).toFixed(2)}px`,
      ).toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
    }
  });
}
