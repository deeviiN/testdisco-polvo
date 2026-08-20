import { test, expect } from "../playwright-fixture";

/**
 * Verifica a ordem de tabulação dentro do modal WhatsApp em /today-bookings.
 *
 * Ordem esperada (com o <details> "Editar mensagem" fechado):
 *   1. Botão "Fechar" (X)
 *   2. <summary> "Editar mensagem antes de enviar"
 *   3. Botão "Copiar"
 *   4. Botão "Compartilhar"
 *
 * - Tab percorre na ordem direta e dá wrap do último para o primeiro.
 * - Shift+Tab percorre na ordem reversa e dá wrap do primeiro para o último.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

type Step = { tag: string; name: string };

// Identifica o elemento focado de forma estável independente de classes/ids
async function describeActive(page: import("@playwright/test").Page): Promise<Step> {
  return await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "none", name: "" };
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute("aria-label") ?? "";
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    return { tag, name: aria || text };
  });
}

const EXPECTED_ORDER: Step[] = [
  { tag: "button", name: "Fechar" },
  { tag: "summary", name: "Editar mensagem antes de enviar" },
  { tag: "button", name: "Copiar" },
  { tag: "button", name: "Compartilhar" },
];

test("Tab/Shift+Tab percorrem o modal WhatsApp na ordem correta", async ({ page }) => {
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

  // Foco inicial deve estar no primeiro elemento esperado
  const initial = await describeActive(page);
  expect(initial, "foco inicial deve estar no primeiro focável (Fechar)").toEqual(EXPECTED_ORDER[0]);

  // ---------- Tab forward na ordem esperada ----------
  for (let i = 1; i < EXPECTED_ORDER.length; i++) {
    await page.keyboard.press("Tab");
    const step = await describeActive(page);
    expect(step, `Tab #${i}: deve focar ${EXPECTED_ORDER[i].name}`).toEqual(EXPECTED_ORDER[i]);
  }

  // Wrap: do último volta para o primeiro
  await page.keyboard.press("Tab");
  const wrapForward = await describeActive(page);
  expect(wrapForward, "Tab após o último deve voltar ao primeiro").toEqual(EXPECTED_ORDER[0]);

  // ---------- Shift+Tab reverso na ordem esperada ----------
  const reverse = [...EXPECTED_ORDER].reverse();
  // Estamos no primeiro → Shift+Tab leva ao último
  for (let i = 0; i < reverse.length; i++) {
    await page.keyboard.press("Shift+Tab");
    const step = await describeActive(page);
    expect(step, `Shift+Tab #${i + 1}: deve focar ${reverse[i].name}`).toEqual(reverse[i]);
  }

  // Dialog continua aberto durante toda a navegação
  await expect(dialog).toBeVisible();
});
