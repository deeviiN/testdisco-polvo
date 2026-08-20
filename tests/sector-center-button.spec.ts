import { test, expect } from "../playwright-fixture";

/**
 * Visual layout regression for the central "Lab. Ciências" button on /sectors.
 *
 * Verifies, across mobile widths 320 / 375 / 428 px, that:
 *  - the icon, label and "Breve" badge are horizontally centered (within tolerance)
 *    relative to the central circular button,
 *  - none of these elements visually touch or overflow the viewport edges.
 */

const VIEWPORTS = [
  { name: "iPhone SE (320px)", width: 320, height: 568 },
  { name: "iPhone X (375px)",  width: 375, height: 812 },
  { name: "iPhone 14+ (428px)", width: 428, height: 926 },
];

const CENTER_TOLERANCE_PX = 1.5; // sub-pixel rounding tolerance
const EDGE_SAFE_MARGIN_PX = 4;   // must keep this much from viewport edges

for (const vp of VIEWPORTS) {
  test(`central button stays centered & inside viewport @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/sectors");

    // The central button is the round button containing the FlaskConical icon
    // and the label "Lab. de Ciências" / "Lab. Ciências".
    const centerButton = page
      .locator("button.rounded-full")
      .filter({ hasText: /Lab\.?\s*(de\s*)?Ci[êe]ncias/i })
      .first();

    await expect(centerButton).toBeVisible({ timeout: 10_000 });

    const buttonBox = await centerButton.boundingBox();
    expect(buttonBox, "central button should have a bounding box").not.toBeNull();
    if (!buttonBox) return;

    // Resolve children via the button's locator
    const icon = centerButton.locator("svg").first();
    const label = centerButton.locator("span", { hasText: /Lab\.?\s*(de\s*)?Ci[êe]ncias/i }).first();

    await expect(icon).toBeVisible();
    await expect(label).toBeVisible();

    const iconBox = await icon.boundingBox();
    const labelBox = await label.boundingBox();
    expect(iconBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    if (!iconBox || !labelBox) return;

    const buttonCenterX = buttonBox.x + buttonBox.width / 2;
    const iconCenterX = iconBox.x + iconBox.width / 2;
    const labelCenterX = labelBox.x + labelBox.width / 2;

    // 1) Horizontal centering of icon + label inside the button
    expect(
      Math.abs(iconCenterX - buttonCenterX),
      `icon should be horizontally centered (Δ=${Math.abs(iconCenterX - buttonCenterX).toFixed(2)}px)`,
    ).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);

    expect(
      Math.abs(labelCenterX - buttonCenterX),
      `label should be horizontally centered (Δ=${Math.abs(labelCenterX - buttonCenterX).toFixed(2)}px)`,
    ).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);

    // 2) Icon + label must sit fully inside the button (no clipping by inner padding)
    expect(iconBox.x).toBeGreaterThanOrEqual(buttonBox.x);
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(buttonBox.x + buttonBox.width);
    expect(labelBox.x).toBeGreaterThanOrEqual(buttonBox.x);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(buttonBox.x + buttonBox.width);

    // 3) "Breve" badge — centered above the button and inside the viewport
    const badge = page.locator("text=/^Breve$/i").last();
    if (await badge.count()) {
      await expect(badge).toBeVisible();
      const badgeBox = await badge.boundingBox();
      expect(badgeBox).not.toBeNull();
      if (badgeBox) {
        const badgeCenterX = badgeBox.x + badgeBox.width / 2;
        expect(
          Math.abs(badgeCenterX - buttonCenterX),
          `badge should be horizontally centered above button (Δ=${Math.abs(badgeCenterX - buttonCenterX).toFixed(2)}px)`,
        ).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);

        // No overlap with the icon (badge sits ABOVE the button)
        expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(iconBox.y);

        // Inside viewport with safe margin on both sides
        expect(badgeBox.x).toBeGreaterThanOrEqual(EDGE_SAFE_MARGIN_PX);
        expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(vp.width - EDGE_SAFE_MARGIN_PX);
        expect(badgeBox.y).toBeGreaterThanOrEqual(0);
      }
    }

    // 4) Whole central cluster (button + badge area) inside viewport
    expect(buttonBox.x).toBeGreaterThanOrEqual(EDGE_SAFE_MARGIN_PX);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(vp.width - EDGE_SAFE_MARGIN_PX);
  });
}
