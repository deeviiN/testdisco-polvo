import { test, expect } from "../playwright-fixture";

/**
 * Fechar o modal WhatsApp em /today-bookings via Shift+Tab + Enter:
 *  - Abre o modal com Enter no botão "Compartilhar no WhatsApp".
 *  - Navega para trás (Shift+Tab) dentro do focus-trap até alcançar o
 *    botão "Fechar" (X).
 *  - Aciona com Enter e confirma que o foco volta ao opener.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

const MAX_SHIFT_TABS = 12;

test("foco retorna ao opener ao fechar via Shift+Tab até botão Fechar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 797 });
  await page.goto("/today-bookings");

  const opener = page.getByRole("button", { name: "Compartilhar no WhatsApp" });

  try {
    await expect(opener).toBeVisible({ timeout: 5_000 });
  } catch {
    test.skip(true, "Sessão autenticada indisponível no preview ou sem agendamentos para hoje.");
    return;
  }

  await opener.evaluate((el) => el.setAttribute("data-test-opener", "wa"));

  // Foca o opener via teclado e abre o modal com Enter
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // Shift+Tab até atingir o botão "Fechar" dentro do dialog
  let reached = false;
  for (let i = 0; i < MAX_SHIFT_TABS; i++) {
    const isClose = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && el.getAttribute("aria-label") === "Fechar";
    });
    if (isClose) {
      reached = true;
      break;
    }
    await page.keyboard.press("Shift+Tab");
  }
  expect(
    reached,
    `botão "Fechar" deve ser alcançável via Shift+Tab em até ${MAX_SHIFT_TABS} passos`
  ).toBe(true);

  // Aciona o "Fechar" com Enter
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();

  // Aguarda restauração de foco via requestAnimationFrame
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-test-opener") === "wa",
    null,
    { timeout: 2_000 }
  );

  await expect(opener).toBeFocused();
});
