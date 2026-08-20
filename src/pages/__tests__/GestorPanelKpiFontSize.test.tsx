import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Garante que os botões de atalho do gestor (KpiShortcut e botões centrais
 * "Cadastros" / "Agendar agora") mantêm fontSize fixo de 13px, sem variação
 * responsiva (mobile/desktop).
 */
describe("GestorPanel — fontSize dos atalhos do gestor", () => {
  const source = readFileSync(
    resolve(__dirname, "../GestorPanel.tsx"),
    "utf-8",
  );

  it("usa fontSize: '13px' fixo em todos os labels de atalho", () => {
    const matches = source.match(/fontSize:\s*["']13px["']/g) ?? [];
    // 4 ocorrências esperadas: Cadastros, Agendar agora, KpiShortcut top, KpiShortcut center
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it("não usa calc() ou variáveis CSS para escalar a fonte dos atalhos", () => {
    expect(source).not.toMatch(/fontSize:\s*[`"']?calc\(.*var\(--gfs/);
    expect(source).not.toMatch(/fontSize:\s*[`"']?var\(--gfs/);
  });

  it("não aplica classes responsivas (sm:text-*) ao label dos KpiShortcut", () => {
    // Bloco do KpiShortcut começa em "const KpiShortcut"
    const idx = source.indexOf("const KpiShortcut");
    expect(idx).toBeGreaterThan(0);
    const kpiBlock = source.slice(idx);
    // Não pode haver text-[Xpx] sm:text-[Ypx] dentro dos spans de label
    expect(kpiBlock).not.toMatch(/className="[^"]*sm:text-\[\d+px\][^"]*"[\s\S]{0,80}\{label\}/);
  });
});
