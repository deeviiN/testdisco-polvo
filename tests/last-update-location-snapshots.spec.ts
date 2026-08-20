import { test, expect } from "../playwright-fixture";

/**
 * Snapshots visuais do badge "Última atualização" em cada local possível.
 *
 * Usa a mesma fixture /preview/last-update-location, que renderiza um slot
 * por local. Para cada cenário definimos a preferência via localStorage
 * antes do load, recarregamos e tiramos screenshot apenas do slot ativo,
 * garantindo um snapshot estável e isolado por local.
 *
 * Para regenerar baselines: `playwright test --update-snapshots`.
 */

const STORAGE_KEY = "sala-vida:last-update-location";
const LOCATIONS = ["header", "footer", "version_card", "home"] as const;

// Mascara o texto da data/hora para evitar diff entre execuções.
const MASK_STYLE = `
  [data-testid^="badge-"] span:last-child {
    color: transparent !important;
    background: hsl(var(--muted)) !important;
    border-radius: 4px;
  }
`;

test.describe("Snapshots — badge 'Última atualização' por local", () => {
  for (const loc of LOCATIONS) {
    test(`layout estável no slot "${loc}"`, async ({ page }) => {
      await page.addInitScript(
        ({ key, value }) => {
          try { window.localStorage.setItem(key, value); } catch { /* noop */ }
        },
        { key: STORAGE_KEY, value: loc },
      );

      await page.setViewportSize({ width: 414, height: 800 });
      await page.goto("/preview/last-update-location");
      await page.addStyleTag({ content: MASK_STYLE });

      const slot = page.getByTestId(`slot-${loc}`);
      await expect(slot).toBeVisible();

      // Garante que o badge realmente renderizou antes do snapshot.
      await expect(page.getByTestId(`badge-${loc}`)).toContainText(/Última atualização/);

      await expect(slot).toHaveScreenshot(`last-update-${loc}.png`, {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
