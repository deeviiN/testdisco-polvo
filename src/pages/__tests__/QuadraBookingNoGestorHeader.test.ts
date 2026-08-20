import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Garantia estrutural: a página /booking/quadra (QuadraBooking.tsx) NUNCA pode
 * renderizar o cabeçalho dourado do gestor (GestorPremiumHeader / GestorThemeShell),
 * independentemente do perfil do usuário. Esta é uma tela compartilhada por todos
 * os perfis (professor, coord, supervisor, gestor, etc.) e o cabeçalho dourado é
 * exclusivo do painel do gestor.
 *
 * Validamos via análise estática do arquivo fonte: se algum dia alguém adicionar
 * o import ou o uso desses componentes em QuadraBooking, este teste falha — mesmo
 * que o uso esteja atrás de um `if (role === 'gestor_pedagogico')`.
 */
describe("QuadraBooking (/booking/quadra) — cabeçalho dourado", () => {
  const source = readFileSync(
    resolve(__dirname, "../QuadraBooking.tsx"),
    "utf8",
  );

  it("não importa GestorPremiumHeader nem GestorThemeShell", () => {
    expect(source).not.toMatch(/GestorPremiumHeader/);
    expect(source).not.toMatch(/GestorThemeShell/);
  });

  it("não referencia o caminho do shell dourado do gestor", () => {
    expect(source).not.toMatch(/gestor\/GestorThemeShell/);
  });
});
