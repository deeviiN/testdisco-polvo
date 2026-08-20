import { test, expect } from "../playwright-fixture";

/**
 * Robustez do focus-trap do modal WhatsApp em /today-bookings ao fechar
 * clicando na sobreposição (backdrop), em múltiplas aberturas consecutivas:
 *  - Abre, fecha clicando fora do dialog, e confirma o foco no opener.
 *  - Repete o ciclo várias vezes para garantir cleanup correto do useEffect
 *    e do requestAnimationFrame de restauração de foco.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

const CYCLES = 5;

test("foco retorna ao opener após múltiplas aberturas consecutivas (overlay)", async ({ page }) => {
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

  for (let i = 1; i <= CYCLES; i++) {
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog, `ciclo ${i}: dialog deve abrir`).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // Clica no overlay fora do dialog (canto superior esquerdo da viewport)
    await page.mouse.click(10, 10);

    await expect(dialog, `ciclo ${i}: dialog deve fechar`).toBeHidden();

    // Aguarda restauração de foco via requestAnimationFrame
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-test-opener") === "wa",
      null,
      { timeout: 2_000 }
    );

    await expect(opener, `ciclo ${i}: foco deve retornar ao opener`).toBeFocused();
  }
});
