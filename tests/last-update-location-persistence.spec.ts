import { test, expect } from "../playwright-fixture";

/**
 * E2E: persistência de "Onde exibir Última atualização".
 *
 * Fluxo:
 *  1. Acessa a fixture /preview/last-update-location (renderiza o card admin
 *     + um slot/badge para cada local possível).
 *  2. Altera a preferência via o <Select> do card.
 *  3. Recarrega a página.
 *  4. Verifica que o badge reaparece exatamente no slot escolhido e não
 *     aparece nos demais.
 */

const STORAGE_KEY = "sala-vida:last-update-location";
const TARGETS = ["header", "footer", "version_card", "home"] as const;

const LABEL_BY_VALUE: Record<(typeof TARGETS)[number], RegExp> = {
  header: /^Cabeçalho$/,
  footer: /^Rodapé$/,
  version_card: /^Card de versão$/,
  home: /^Página inicial$/,
};

test.describe("Última atualização — persistência da preferência", () => {
  test.beforeEach(async ({ page }) => {
    // Garante estado limpo antes de cada cenário
    await page.addInitScript((key) => {
      try { window.localStorage.removeItem(key); } catch { /* noop */ }
    }, STORAGE_KEY);
  });

  for (const target of TARGETS) {
    test(`escolha "${target}" persiste após reload e badge reaparece no slot correto`, async ({ page }) => {
      await page.goto("/preview/last-update-location");
      await expect(page.getByTestId("last-update-preview-root")).toBeVisible();

      // Abre o Select e escolhe o valor desejado
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: LABEL_BY_VALUE[target] }).click();

      // localStorage atualizado imediatamente
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      expect(stored).toBe(target);

      // Reload — simula o usuário reabrindo a página
      await page.reload();
      await expect(page.getByTestId("last-update-preview-root")).toBeVisible();

      // Badge correspondente aparece (texto "Última atualização: ...")
      const activeBadge = page.getByTestId(`badge-${target}`);
      await expect(activeBadge).toContainText(/Última atualização/);

      // Outros slots não devem renderizar badge
      for (const other of TARGETS) {
        if (other === target) continue;
        const otherBadge = page.getByTestId(`badge-${other}`);
        await expect(otherBadge).toHaveText("");
      }
    });
  }

  test('escolha "Não exibir" oculta o badge em todos os slots após reload', async ({ page }) => {
    await page.goto("/preview/last-update-location");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /^Não exibir$/ }).click();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBe("off");

    await page.reload();
    await expect(page.getByTestId("last-update-preview-root")).toBeVisible();

    for (const other of TARGETS) {
      await expect(page.getByTestId(`badge-${other}`)).toHaveText("");
    }
  });
});
