import { test, expect } from "@playwright/test";

test("WA modal: with editor expanded, Tab/Shift+Tab navigation then close returns focus to opener", async ({
  page,
}) => {
  await page.goto("/today-bookings");

  const opener = page.getByRole("button", { name: /Compartilhar no WhatsApp/i }).first();
  try {
    await opener.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    test.skip(true, "Opener button not visible on /today-bookings");
  }

  // Tag opener to identify it later
  await opener.evaluate((el) => el.setAttribute("data-test-opener", "wa"));
  await opener.focus();
  await opener.click();

  // Wait for dialog
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.evaluate((el) => el.setAttribute("data-test-dialog", "wa"));

  // Expand <details> "Editar mensagem antes de enviar"
  await page.evaluate(() => {
    const dlg = document.querySelector('[data-test-dialog="wa"]');
    const details = dlg?.querySelector("details");
    if (details && !details.open) details.open = true;
  });

  const textarea = dialog.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 3000 });

  // Navigate forward and back through focusable elements
  for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");

  // Confirm focus is still inside dialog
  const focusInside = await page.evaluate(() => {
    const dlg = document.querySelector('[data-test-dialog="wa"]');
    return !!dlg && !!document.activeElement && dlg.contains(document.activeElement);
  });
  expect(focusInside).toBe(true);

  // Close via Escape
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 3000 });

  // Focus should return to original opener
  const focusReturned = await page.evaluate(() => {
    return document.activeElement?.getAttribute("data-test-opener") === "wa";
  });
  expect(focusReturned).toBe(true);
});
