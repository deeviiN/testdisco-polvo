import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Garante que nenhum botão do Painel do Gestor aplique transform/scale
 * em hover, active ou focus. Os botões devem permanecer fixos ao clicar.
 */
describe("GestorPanel — sem transform/scale em hover/active/focus", () => {
  const source = readFileSync(
    resolve(__dirname, "../GestorPanel.tsx"),
    "utf-8",
  );

  const forbiddenPatterns: Array<{ name: string; regex: RegExp }> = [
    { name: "hover:scale-*", regex: /hover:scale-\[?[\d.]+\]?/ },
    { name: "active:scale-*", regex: /active:scale-\[?[\d.]+\]?/ },
    { name: "focus:scale-*", regex: /focus:scale-\[?[\d.]+\]?/ },
    { name: "focus-visible:scale-*", regex: /focus-visible:scale-\[?[\d.]+\]?/ },
    { name: "hover:translate-*", regex: /hover:translate-[xy]-\[?[-\d.]+\]?/ },
    { name: "active:translate-*", regex: /active:translate-[xy]-\[?[-\d.]+\]?/ },
    { name: "hover:-translate-*", regex: /hover:-translate-[xy]-\[?[\d.]+\]?/ },
    { name: "active:-translate-*", regex: /active:-translate-[xy]-\[?[\d.]+\]?/ },
    { name: "hover:rotate-*", regex: /hover:rotate-\[?[-\d.]+\]?/ },
    { name: "active:rotate-*", regex: /active:rotate-\[?[-\d.]+\]?/ },
  ];

  for (const { name, regex } of forbiddenPatterns) {
    it(`não deve conter ${name}`, () => {
      const matches = source.match(new RegExp(regex, "g"));
      expect(matches, `Encontrado: ${matches?.join(", ")}`).toBeNull();
    });
  }
});
