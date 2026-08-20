import { test, expect } from "../playwright-fixture";

/**
 * Robustez do focus-trap do modal WhatsApp em /today-bookings após múltiplas
 * aberturas consecutivas:
 *  - Abre o modal, fecha com Escape e verifica que o foco volta ao opener.
 *  - Repete o ciclo várias vezes para garantir que cleanup do useEffect e
 *    o requestAnimationFrame de restauração de foco continuam corretos.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

const CYCLES = 5;

test("foco retorna ao opener após múltiplas aberturas consecutivas (Escape)", async ({ page }) => {
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

    await page.keyboard.press("Escape");

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
