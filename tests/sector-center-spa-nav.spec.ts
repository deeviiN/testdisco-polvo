import { test, expect, type Page } from "../playwright-fixture";

/**
 * SPA navigation test: navigate /sectors → /subscription → back to /sectors
 * (using client-side router, no full page reload) and verify the central
 * round button and its halo/ring remain co-centered at 320/375/428px.
 */

const VIEWPORTS = [
  { name: "iPhone SE (320px)", width: 320, height: 568 },
  { name: "iPhone X (375px)",  width: 375, height: 812 },
  { name: "iPhone 14+ (428px)", width: 428, height: 926 },
];

const TOLERANCE_PX = 1.5;

async function assertCentered(page: Page, label: string) {
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

  // Halo/ring co-centered with button
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

/**
 * Push a new history entry on the client-side router without triggering
 * a full document reload — equivalent to clicking a <Link> in React Router.
 */
async function spaNavigate(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

for (const vp of VIEWPORTS) {
  test(`central button stays centered after SPA navigation @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/sectors");

    const baseline = await assertCentered(page, "initial /sectors");

    // Navigate away via the in-app router (no reload)
    await spaNavigate(page, "/subscription");
    await page.waitForFunction(() => window.location.pathname === "/subscription");
    // Give React Router a tick to render the new route
    await page.waitForTimeout(150);

    // Navigate back via history.back (still no full reload)
    await page.goBack({ waitUntil: "load" }).catch(async () => {
      // Fallback: explicit SPA navigation back to /sectors
      await spaNavigate(page, "/sectors");
    });
    await page.waitForFunction(() => window.location.pathname === "/sectors");

    const afterBack = await assertCentered(page, "after SPA back to /sectors");

    // Drift vs baseline must remain within tolerance
    expect(
      Math.abs(afterBack.cx - baseline.cx),
      `X drift after SPA round-trip = ${Math.abs(afterBack.cx - baseline.cx).toFixed(2)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(
      Math.abs(afterBack.cy - baseline.cy),
      `Y drift after SPA round-trip = ${Math.abs(afterBack.cy - baseline.cy).toFixed(2)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);

    // Second round-trip to catch state-leak bugs across multiple SPA transitions
    await spaNavigate(page, "/auth");
    await page.waitForFunction(() => window.location.pathname === "/auth");
    await page.waitForTimeout(150);
    await spaNavigate(page, "/sectors");
    await page.waitForFunction(() => window.location.pathname === "/sectors");

    await assertCentered(page, "after second SPA round-trip");
  });
}
