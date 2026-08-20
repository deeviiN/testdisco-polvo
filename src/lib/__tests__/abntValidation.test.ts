import { describe, it, expect } from "vitest";
import {
  validateAbntLayout,
  ABNT_CONTRACT_LAYOUT,
  type AbntLayout,
} from "@/lib/abntValidation";

const make = (overrides: Partial<AbntLayout> = {}): AbntLayout => ({
  ...ABNT_CONTRACT_LAYOUT,
  ...overrides,
});

describe("validateAbntLayout — contrato no padrão ABNT", () => {
  it("aprova o layout padrão do contrato (Times 12, A4, 3/3/2/2 cm, recuo 1,25 cm)", () => {
    const r = validateAbntLayout(ABNT_CONTRACT_LAYOUT);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("aceita Helvetica e Arial como fontes alternativas válidas", () => {
    expect(validateAbntLayout(make({ fontFamily: "helvetica" })).valid).toBe(true);
    expect(validateAbntLayout(make({ fontFamily: "Arial" })).valid).toBe(true);
  });

  it("tolera variações de até 0,5 mm em margens e recuo", () => {
    const r = validateAbntLayout(
      make({ marginLeftMm: 29.6, marginTopMm: 30.4, firstLineIndentMm: 12.2 }),
    );
    expect(r.valid).toBe(true);
  });

  it("reprova quando a página não é A4", () => {
    const r = validateAbntLayout(make({ pageWidthMm: 216, pageHeightMm: 279 })); // Carta
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/A4/);
  });

  it("reprova margem esquerda menor que 3 cm", () => {
    const r = validateAbntLayout(make({ marginLeftMm: 20 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /esquerda/i.test(e))).toBe(true);
  });

  it("reprova margem superior menor que 3 cm", () => {
    const r = validateAbntLayout(make({ marginTopMm: 25 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /superior/i.test(e))).toBe(true);
  });

  it("reprova margem direita menor que 2 cm", () => {
    const r = validateAbntLayout(make({ marginRightMm: 10 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /direita/i.test(e))).toBe(true);
  });

  it("reprova margem inferior menor que 2 cm", () => {
    const r = validateAbntLayout(make({ marginBottomMm: 10 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /inferior/i.test(e))).toBe(true);
  });

  it("reprova recuo de 1ª linha diferente de 1,25 cm", () => {
    expect(validateAbntLayout(make({ firstLineIndentMm: 0 })).valid).toBe(false);
    expect(validateAbntLayout(make({ firstLineIndentMm: 20 })).valid).toBe(false);
  });

  it("reprova tamanho de fonte fora de 12 pt", () => {
    expect(validateAbntLayout(make({ fontSizePt: 10 })).valid).toBe(false);
    expect(validateAbntLayout(make({ fontSizePt: 14 })).valid).toBe(false);
  });

  it("reprova espaçamento entre linhas fora de 1,5", () => {
    expect(validateAbntLayout(make({ lineSpacing: 1 })).valid).toBe(false);
    expect(validateAbntLayout(make({ lineSpacing: 2 })).valid).toBe(false);
  });

  it("reprova fonte não recomendada", () => {
    const r = validateAbntLayout(make({ fontFamily: "courier" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Fonte/i.test(e))).toBe(true);
  });

  it("acumula múltiplos erros simultaneamente", () => {
    const r = validateAbntLayout(
      make({
        pageWidthMm: 100,
        pageHeightMm: 150,
        marginLeftMm: 5,
        fontSizePt: 8,
        lineSpacing: 1.0,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("reprova área útil inválida (margens maiores que a página)", () => {
    const r = validateAbntLayout(make({ marginLeftMm: 150, marginRightMm: 150 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Área útil/i.test(e))).toBe(true);
  });
});

describe("validateAbntLayout — contratos diferentes", () => {
  it.each([
    { name: "Contrato mensal R$ 79,90", layout: ABNT_CONTRACT_LAYOUT },
    { name: "Contrato anual com Helvetica", layout: make({ fontFamily: "helvetica" }) },
    { name: "Contrato bilateral admin/gestor", layout: make({ marginTopMm: 30, marginLeftMm: 30 }) },
  ])("$name passa na validação ABNT", ({ layout }) => {
    expect(validateAbntLayout(layout).valid).toBe(true);
  });
});
