import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MigrationQuoteCard, type MigrationQuote } from "@/components/MigrationQuoteCard";

/**
 * Garante que o card de migração com `meses_restantes === 0`
 * renderiza EXATAMENTE o mesmo HTML em mobile (390px),
 * tablet (768px) e desktop (1280px).
 *
 * Se algum dia alguém adicionar uma classe responsiva
 * (`sm:`, `md:`, `lg:`...) que mude o layout do card,
 * este teste falha.
 */
const setViewport = (width: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      // Suporta apenas o padrão `(min-width: NNNpx)` usado pelo Tailwind.
      const match = query.match(/min-width:\s*(\d+)px/);
      const matches = match ? width >= Number(match[1]) : false;
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
};

const QUOTE_ZERO: MigrationQuote = {
  valor_mensal: 169.9,
  meses_ciclo: 12,
  meses_pagos: 12,
  meses_restantes: 0,
  valor_total: 0,
};

const renderAt = (width: number) => {
  setViewport(width);
  const { container } = render(<MigrationQuoteCard quote={QUOTE_ZERO} />);
  return container.innerHTML;
};

describe("MigrationQuoteCard — meses_restantes=0 sem variação entre breakpoints", () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it("HTML é idêntico em mobile (390), tablet (768) e desktop (1280)", () => {
    const mobile = renderAt(390);
    cleanup();
    const tablet = renderAt(768);
    cleanup();
    const desktop = renderAt(1280);

    expect(tablet).toBe(mobile);
    expect(desktop).toBe(mobile);
  });

  it("contém a copy de ciclo quitado e oculta o botão PIX", () => {
    setViewport(390);
    const { container, queryByRole } = render(<MigrationQuoteCard quote={QUOTE_ZERO} />);
    expect(container.textContent).toContain("Ciclo anual já quitado");
    expect(container.textContent).toContain("Restam 0 meses — nada a pagar agora.");
    expect(queryByRole("button")).toBeNull();
  });

  it("não usa nenhuma classe responsiva (sm:/md:/lg:/xl:) no markup", () => {
    setViewport(390);
    const { container } = render(<MigrationQuoteCard quote={QUOTE_ZERO} />);
    expect(container.innerHTML).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
  });

  it("snapshot estável do card com meses_restantes=0", () => {
    setViewport(390);
    const { container } = render(<MigrationQuoteCard quote={QUOTE_ZERO} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
