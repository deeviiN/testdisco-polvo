import { test, expect } from "../playwright-fixture";

/**
 * Verifica a ordem de tabulação dentro do modal WhatsApp em /today-bookings
 * COM o <details> "Editar mensagem antes de enviar" EXPANDIDO.
 *
 * Ordem esperada (details aberto):
 *   1. Botão "Fechar" (X)
 *   2. <summary> "Editar mensagem antes de enviar"
 *   3. <textarea> de edição da mensagem
 *   4. Botão "Copiar"
 *   5. Botão "Compartilhar"
 *
 * - Tab percorre na ordem direta e dá wrap do último para o primeiro.
 * - Shift+Tab percorre na ordem reversa.
 *
 * Caso a sessão autenticada não esteja disponível no preview ou não haja
 * agendamentos para hoje, o teste é ignorado com mensagem clara.
 */

type Step = { tag: string; name: string };

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
  { tag: "textarea", name: "" },
  { tag: "button", name: "Copiar" },
  { tag: "button", name: "Compartilhar" },
];

test("Tab/Shift+Tab percorrem o modal WhatsApp na ordem correta com editor expandido", async ({ page }) => {
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

  // Expande o <details> "Editar mensagem antes de enviar"
  const summary = dialog.locator("summary", { hasText: "Editar mensagem antes de enviar" });
  await expect(summary).toBeVisible();
  await summary.evaluate((el) => {
    const details = el.closest("details") as HTMLDetailsElement | null;
    if (details && !details.open) details.open = true;
  });

  // Garante que o textarea agora é focável/visível
  const textarea = dialog.locator("textarea");
  await expect(textarea).toBeVisible();

  // Reposiciona o foco no primeiro elemento esperado para começar a sequência
  await dialog.getByRole("button", { name: "Fechar" }).focus();

  const initial = await describeActive(page);
  expect(initial, "foco inicial deve estar em Fechar").toEqual(EXPECTED_ORDER[0]);

  // ---------- Tab forward ----------
  for (let i = 1; i < EXPECTED_ORDER.length; i++) {
    await page.keyboard.press("Tab");
    const step = await describeActive(page);
    expect(step, `Tab #${i}: deve focar ${EXPECTED_ORDER[i].name || EXPECTED_ORDER[i].tag}`).toEqual(
      EXPECTED_ORDER[i],
    );
  }

  // Wrap: do último volta para o primeiro
  await page.keyboard.press("Tab");
  const wrapForward = await describeActive(page);
  expect(wrapForward, "Tab após o último deve voltar ao primeiro").toEqual(EXPECTED_ORDER[0]);

  // ---------- Shift+Tab reverso ----------
  const reverse = [...EXPECTED_ORDER].reverse();
  for (let i = 0; i < reverse.length; i++) {
    await page.keyboard.press("Shift+Tab");
    const step = await describeActive(page);
    expect(step, `Shift+Tab #${i + 1}: deve focar ${reverse[i].name || reverse[i].tag}`).toEqual(
      reverse[i],
    );
  }

  // Dialog continua aberto durante toda a navegação
  await expect(dialog).toBeVisible();
});
