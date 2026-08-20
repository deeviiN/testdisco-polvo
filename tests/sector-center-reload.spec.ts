import { test, expect } from "../playwright-fixture";

/**
 * After a full page reload (F5) on /sectors, the central round button must remain:
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

async function assertCentered(page: import("@playwright/test").Page, label: string) {
  const centerButton = page
    .locator("button.rounded-full")
    .filter({ hasText: /Lab\.?\s*(de\s*)?Ci[êe]ncias/i })
    .first();
  await expect(centerButton, `${label}: center button visible`).toBeVisible({ timeout: 10_000 });

  const outerButtons = page.locator("div.grid.grid-cols-3.grid-rows-2 > button");
  await expect(outerButtons, `${label}: 6 outer buttons`).toHaveCount(6);

  const outerBoxes = await outerButtons.evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = (n as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  const centroidX = outerBoxes.reduce((a, b) => a + b.x + b.w / 2, 0) / outerBoxes.length;
  const centroidY = outerBoxes.reduce((a, b) => a + b.y + b.h / 2, 0) / outerBoxes.length;

  const cBox = await centerButton.boundingBox();
  expect(cBox, `${label}: bbox`).not.toBeNull();
  if (!cBox) return;
  const cx = cBox.x + cBox.width / 2;
  const cy = cBox.y + cBox.height / 2;

  expect(
    Math.abs(cx - centroidX),
    `${label}: X off-center by ${Math.abs(cx - centroidX).toFixed(2)}px`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(
    Math.abs(cy - centroidY),
    `${label}: Y off-center by ${Math.abs(cy - centroidY).toFixed(2)}px`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);

  // Perfect circle
  expect(Math.abs(cBox.width - cBox.height)).toBeLessThanOrEqual(0.5);

  // Halo / ring co-centered
  const wrapper = centerButton.locator("xpath=ancestor::div[contains(@class,'absolute')][1]");
  const decorativeLayers = wrapper.locator("div.rounded-full.pointer-events-none");
  const n = await decorativeLayers.count();
  for (let i = 0; i < n; i++) {
    const lb = await decorativeLayers.nth(i).boundingBox();
    if (!lb) continue;
    const lx = lb.x + lb.width / 2;
    const ly = lb.y + lb.height / 2;
    expect(
      Math.abs(lx - cx),
      `${label}: layer #${i} X off-center by ${Math.abs(lx - cx).toFixed(2)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(
      Math.abs(ly - cy),
      `${label}: layer #${i} Y off-center by ${Math.abs(ly - cy).toFixed(2)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
  }
}

for (const vp of VIEWPORTS) {
  test(`central button stays centered after page reload @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/sectors");
    await assertCentered(page, "initial load");

    // Full reload (equivalent to pressing F5)
    await page.reload({ waitUntil: "load" });
    await assertCentered(page, "after reload #1");

    // Second reload to catch any layout drift across consecutive refreshes
    await page.reload({ waitUntil: "load" });
    await assertCentered(page, "after reload #2");
  });
}
