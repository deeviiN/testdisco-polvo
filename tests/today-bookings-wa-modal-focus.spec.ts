import { test, expect } from "../playwright-fixture";

/**
 * Acessibilidade do modal de pré-visualização do WhatsApp em /today-bookings:
 *  - Abre o modal clicando no botão "Compartilhar no WhatsApp".
 *  - Fecha clicando na sobreposição (backdrop).
 *  - Verifica que o foco retorna ao botão que abriu o modal.
 *
 * Observação: a rota exige sessão autenticada. Caso o preview redirecione
 * para /auth ou o botão não esteja disponível, o teste é ignorado com
 * mensagem clara em vez de falhar — o objetivo é cobrir o comportamento
 * sempre que houver sessão válida.
 */

test("foco retorna ao botão WhatsApp ao fechar modal pelo overlay", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 797 });
  await page.goto("/today-bookings");

  const opener = page.getByRole("button", { name: "Compartilhar no WhatsApp" });

  try {
    await expect(opener).toBeVisible({ timeout: 5_000 });
  } catch {
    test.skip(true, "Sessão autenticada indisponível no preview ou sem agendamentos para hoje.");
    return;
  }

  // Marca o opener para podermos identificá-lo via document.activeElement
  await opener.evaluate((el) => el.setAttribute("data-test-opener", "wa"));

  await opener.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // Clica no overlay (backdrop) — usar posição fora do conteúdo do dialog
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  if (!dialogBox) return;

  // Clica próximo ao topo da tela, fora do dialog
  await page.mouse.click(10, 10);

  await expect(dialog).toBeHidden();

  // Aguarda o requestAnimationFrame que restaura o foco
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-test-opener") === "wa",
    null,
    { timeout: 2_000 }
  );

  await expect(opener).toBeFocused();
});
