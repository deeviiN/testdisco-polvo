import { test, expect } from "../playwright-fixture";

/**
 * Verifica que o focus-trap do modal WhatsApp em /today-bookings mantém o
 * foco dentro do dialog ao navegar com Tab e Shift+Tab — incluindo o wrap
 * (último → primeiro e primeiro → último), sem permitir saída para fora
 * enquanto o modal estiver aberto.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

const TAB_PRESSES = 12; // > nº de focáveis no modal — força o wrap várias vezes

test("focus-trap mantém o foco dentro do dialog em Tab e Shift+Tab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 797 });
  await page.goto("/today-bookings");

  const opener = page.getByRole("button", { name: "Compartilhar no WhatsApp" });

  try {
    await expect(opener).toBeVisible({ timeout: 5_000 });
  } catch {
    test.skip(true, "Sessão autenticada indisponível no preview ou sem agendamentos para hoje.");
    return;
  }

  await opener.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // Marca o dialog para identificá-lo via document
  await dialog.evaluate((el) => el.setAttribute("data-test-dialog", "wa"));

  const focusIsInsideDialog = async () =>
    page.evaluate(() => {
      const dlg = document.querySelector('[data-test-dialog="wa"]');
      const active = document.activeElement;
      return !!dlg && !!active && active !== document.body && dlg.contains(active);
    });

  // Foco inicial deve estar dentro do dialog
  expect(await focusIsInsideDialog(), "foco inicial deve estar dentro do dialog").toBe(true);

  // Tab forward — múltiplas vezes para forçar wrap
  for (let i = 0; i < TAB_PRESSES; i++) {
    await page.keyboard.press("Tab");
    expect(
      await focusIsInsideDialog(),
      `Tab #${i + 1}: foco deve permanecer dentro do dialog`
    ).toBe(true);
  }

  // Shift+Tab backward — múltiplas vezes para forçar wrap reverso
  for (let i = 0; i < TAB_PRESSES; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await focusIsInsideDialog(),
      `Shift+Tab #${i + 1}: foco deve permanecer dentro do dialog`
    ).toBe(true);
  }

  // Dialog ainda visível (nenhum atalho fechou indevidamente)
  await expect(dialog).toBeVisible();
});
