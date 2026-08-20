import { describe, it, expect } from "vitest";
import { enforceFiveLines } from "./generateGestorCommunique";

const ctx = {
  sector: "Quadra Escolar",
  dateBR: "15/05/2025",
  horario: "08:00 - 10:00",
  solicitante: "João Silva",
};

describe("enforceFiveLines", () => {
  it("retorna texto inalterado quando já tem ≤ 5 linhas", () => {
    const input =
      `Prezado(a) Gestor(a),\n` +
      `João Silva solicita a liberação do ambiente "Quadra Escolar" no dia 15/05/2025, das 08:00 - 10:00.\n` +
      `Assunto: Treino.\n` +
      `Aguardo deferimento.`;
    const out = enforceFiveLines(input, ctx);
    expect(out.split("\n").length).toBeLessThanOrEqual(5);
    expect(out).toContain("Prezado(a) Gestor(a),");
    expect(out).toContain("João Silva");
    expect(out).toContain("Quadra Escolar");
    expect(out).toContain("15/05/2025");
    expect(out).toContain("08:00");
    expect(out).toContain("Aguardo deferimento.");
  });

  it("nunca ultrapassa 5 linhas mesmo com entrada longa", () => {
    const input = [
      "Prezado(a) Gestor(a),",
      'João Silva solicita a liberação do ambiente "Quadra Escolar" no dia 15/05/2025, das 08:00 - 10:00, para uso externo.',
      "Assunto: Evento esportivo da comunidade.",
      "Justificativa: integração com famílias do bairro.",
      "Observação extra 1.",
      "Observação extra 2.",
      "Observação extra 3.",
      "Observação extra 4.",
      "Aguardo deferimento.",
    ].join("\n");
    const out = enforceFiveLines(input, ctx);
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it("preserva saudação, essenciais e encerramento ao truncar", () => {
    const input = [
      "Prezado(a) Gestor(a),",
      'João Silva solicita a liberação do ambiente "Quadra Escolar" no dia 15/05/2025, das 08:00 - 10:00, para uso externo.',
      "Assunto: Festa.",
      "Justificativa A.",
      "Justificativa B.",
      "Justificativa C.",
      "Atenciosamente.",
    ].join("\n");
    const out = enforceFiveLines(input, ctx);
    expect(out.split("\n")[0]).toMatch(/Prezad[ao]\(a\)\s*Gestor/i);
    expect(out).toContain("João Silva");
    expect(out).toContain("Quadra Escolar");
    expect(out).toContain("15/05/2025");
    expect(out).toContain("08:00");
    expect(out.split("\n").pop()).toMatch(
      /(deferimento|atenciosamente|aguardo|grato|obrigad)/i,
    );
  });

  it("insere saudação padrão se ausente e exceder 5 linhas", () => {
    const input = [
      'João Silva solicita a liberação do ambiente "Quadra Escolar" no dia 15/05/2025, das 08:00 - 10:00.',
      "Linha extra 1.",
      "Linha extra 2.",
      "Linha extra 3.",
      "Linha extra 4.",
      "Aguardo deferimento.",
    ].join("\n");
    const out = enforceFiveLines(input, ctx);
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[0]).toBe("Prezado(a) Gestor(a),");
  });

  it("insere encerramento padrão se ausente e exceder 5 linhas", () => {
    const input = [
      "Prezado(a) Gestor(a),",
      'João Silva solicita a liberação do ambiente "Quadra Escolar" no dia 15/05/2025, das 08:00 - 10:00.',
      "Detalhe 1.",
      "Detalhe 2.",
      "Detalhe 3.",
      "Detalhe 4.",
    ].join("\n");
    const out = enforceFiveLines(input, ctx);
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[lines.length - 1]).toMatch(
      /(deferimento|atenciosamente|aguardo|grato|obrigad)/i,
    );
  });

  it("ignora linhas em branco e remove espaços", () => {
    const input = `\n  Prezado(a) Gestor(a),  \n\n  João Silva solicita a liberação do ambiente "Quadra Escolar" no dia 15/05/2025, das 08:00 - 10:00.  \n\n  Aguardo deferimento.  \n`;
    const out = enforceFiveLines(input, ctx);
    const lines = out.split("\n");
    expect(lines.every((l) => l === l.trim())).toBe(true);
    expect(lines.every((l) => l.length > 0)).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(5);
  });
});
