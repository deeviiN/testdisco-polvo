import { test, expect } from "../playwright-fixture";

/**
 * Acessibilidade do modal de pré-visualização do WhatsApp em /today-bookings:
 *  - Abre o modal clicando no botão "Compartilhar no WhatsApp".
 *  - Fecha pressionando a tecla Escape.
 *  - Verifica que o foco retorna ao botão que abriu o modal.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

test("foco retorna ao botão WhatsApp ao fechar modal com Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 797 });
  await page.goto("/today-bookings");

  const opener = page.getByRole("button", { name: "Compartilhar no WhatsApp" });

  try {
    await expect(opener).toBeVisible({ timeout: 5_000 });
  } catch {
    test.skip(true, "Sessão autenticada indisponível no preview ou sem agendamentos para hoje.");
    return;
  }

  // Marca o opener para identificá-lo via document.activeElement
  await opener.evaluate((el) => el.setAttribute("data-test-opener", "wa"));

  await opener.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // Fecha com a tecla Escape
  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();

  // Aguarda o requestAnimationFrame que restaura o foco
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-test-opener") === "wa",
    null,
    { timeout: 2_000 }
  );

  await expect(opener).toBeFocused();
});
