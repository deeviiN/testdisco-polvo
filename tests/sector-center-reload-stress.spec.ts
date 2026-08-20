import { test, expect, type Page } from "../playwright-fixture";

/**
 * Stress test: 8 consecutive page.reload() cycles on /sectors.
 * Fails if the central round button OR any halo/ring drifts more than 1.5px
 * from the geometric centroid of the 6 outer buttons, in 320/375/428px viewports.
 */

const VIEWPORTS = [
  { name: "iPhone SE (320px)", width: 320, height: 568 },
  { name: "iPhone X (375px)",  width: 375, height: 812 },
  { name: "iPhone 14+ (428px)", width: 428, height: 926 },
];

const TOLERANCE_PX = 1.5;
const RELOAD_CYCLES = 8;

async function measure(page: Page, label: string) {
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
  if (!cBox) throw new Error("no bbox");
  const cx = cBox.x + cBox.width / 2;
  const cy = cBox.y + cBox.height / 2;

  expect(
    Math.abs(cx - centroidX),
    `${label}: button X off-center by ${Math.abs(cx - centroidX).toFixed(2)}px`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(
    Math.abs(cy - centroidY),
    `${label}: button Y off-center by ${Math.abs(cy - centroidY).toFixed(2)}px`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);

  // Perfect circle
  expect(Math.abs(cBox.width - cBox.height)).toBeLessThanOrEqual(0.5);

  // Halo / decorative ring co-centered with the button
  const wrapper = centerButton.locator("xpath=ancestor::div[contains(@class,'absolute')][1]");
  const layers = wrapper.locator("div.rounded-full.pointer-events-none");
  const n = await layers.count();
  for (let i = 0; i < n; i++) {
    const lb = await layers.nth(i).boundingBox();
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

  return { cx, cy, w: cBox.width, h: cBox.height };
}

for (const vp of VIEWPORTS) {
  test(`central button survives ${RELOAD_CYCLES} reload cycles @ ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/sectors");

    const baseline = await measure(page, "baseline");

    for (let i = 1; i <= RELOAD_CYCLES; i++) {
      await page.reload({ waitUntil: "load" });
      const m = await measure(page, `reload #${i}`);

      // Drift vs baseline must also stay within tolerance
      expect(
        Math.abs(m.cx - baseline.cx),
        `reload #${i}: X drift vs baseline = ${Math.abs(m.cx - baseline.cx).toFixed(2)}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(
        Math.abs(m.cy - baseline.cy),
        `reload #${i}: Y drift vs baseline = ${Math.abs(m.cy - baseline.cy).toFixed(2)}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(
        Math.abs(m.w - baseline.w),
        `reload #${i}: width drift = ${Math.abs(m.w - baseline.w).toFixed(2)}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(
        Math.abs(m.h - baseline.h),
        `reload #${i}: height drift = ${Math.abs(m.h - baseline.h).toFixed(2)}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
    }
  });
}
