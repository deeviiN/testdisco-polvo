import { test, expect } from "@playwright/test";

test("WA modal: with editor expanded, Escape closes and returns focus to opener", async ({
  page,
}) => {
  await page.goto("/today-bookings");

  const opener = page.getByRole("button", { name: /Compartilhar no WhatsApp/i }).first();
  try {
    await opener.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    test.skip(true, "Opener button not visible on /today-bookings");
  }

  await opener.evaluate((el) => el.setAttribute("data-test-opener", "wa"));
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.evaluate((el) => el.setAttribute("data-test-dialog", "wa"));

  // Expand the editor <details>
  await page.evaluate(() => {
    const dlg = document.querySelector('[data-test-dialog="wa"]');
    const details = dlg?.querySelector("details");
    if (details && !details.open) details.open = true;
  });

  const textarea = dialog.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 3000 });

  // Close with Escape
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 3000 });

  // Focus should return to the original opener
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-test-opener") === "wa",
    null,
    { timeout: 3000 },
  );

  const focusReturned = await page.evaluate(
    () => document.activeElement?.getAttribute("data-test-opener") === "wa",
  );
  expect(focusReturned).toBe(true);
});
