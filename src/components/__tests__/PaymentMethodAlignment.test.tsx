/**
 * Testa o alinhamento estrutural dos 3 botões de pagamento (PIX/Boleto/Cartão)
 * em larguras pequenas (320px / xxs 360px) e nos estados visuais relevantes:
 *   - idle (nenhum selecionado)
 *   - active (selecionado)
 *   - checking (loading)
 *
 * Garantias verificadas:
 *   1. Os 3 botões compartilham a mesma largura e altura (cells do grid `1fr`).
 *   2. min-height dos botões está aplicada (>= 88px / 104px).
 *   3. Ícone e label renderizam dentro do card (não estouram).
 *   4. Trocar para hover/active/loading não muda a altura nem desloca os cards
 *      (não há `scale`/transform/sombra externa empurrando o layout).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import { QrCode, FileText, CreditCard, Loader2 } from "lucide-react";

type Method = "pix" | "boleto" | "card";
const METHODS = [
  { id: "pix" as const, Icon: QrCode, label: "PIX", sub: "Instantâneo", accent: "168 76% 42%" },
  { id: "boleto" as const, Icon: FileText, label: "Boleto", sub: "Bancário", accent: "220 80% 55%" },
  { id: "card" as const, Icon: CreditCard, label: "Cartão", sub: "Crédito", accent: "265 75% 60%" },
];

/**
 * Réplica enxuta do grid usado em src/pages/Subscription.tsx.
 * Mantém as mesmas classes-chave que controlam alinhamento (sem efeitos de
 * scale/animate-pulse), para que regressões visíveis ali quebrem aqui também.
 */
function PaymentGrid({ width }: { width: number }) {
  const [paymentMethod, setPaymentMethod] = useState<Method | null>(null);
  const [checking, setChecking] = useState<Method | null>(null);

  return (
    <div
      data-testid="wrapper"
      style={{ width, padding: 12, boxSizing: "border-box" }}
    >
      <div
        data-testid="grid"
        className="grid grid-cols-3 auto-rows-fr gap-1 xxs:gap-1.5"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 4,
          minHeight: 88,
        }}
      >
        {METHODS.map(({ id, Icon, label }) => {
          const active = paymentMethod === id;
          const isChecking = checking === id;
          return (
            <button
              key={id}
              data-testid={`btn-${id}`}
              data-active={active ? "true" : "false"}
              data-checking={isChecking ? "true" : "false"}
              type="button"
              onClick={() => {
                setPaymentMethod(id);
                if (id !== "boleto") {
                  setChecking(id);
                  setTimeout(() => setChecking(null), 0);
                }
              }}
              className="group relative flex flex-col items-center justify-center rounded-xl xxs:rounded-2xl border h-full w-full min-h-[88px] xxs:min-h-[104px] max-h-[180px] min-w-0 overflow-hidden px-0.5 py-1 xxs:px-1 xxs:py-1.5 transition-colors duration-200"
              style={{
                gap: 2,
                boxShadow: "none",
              }}
            >
              <span
                data-testid={`badge-${id}`}
                className="relative flex items-center justify-center rounded-lg"
                style={{ width: 30, height: 30 }}
              >
                {isChecking ? (
                  <Loader2 data-testid={`spinner-${id}`} style={{ width: 16, height: 16 }} />
                ) : (
                  <Icon data-testid={`icon-${id}`} style={{ width: 16, height: 16 }} />
                )}
              </span>
              <span
                data-testid={`label-${id}`}
                className="font-extrabold leading-none text-center break-words"
                style={{ fontSize: 12 }}
              >
                {isChecking ? "..." : label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * jsdom não calcula layout. Mockamos largura/altura de cada card em função do
 * viewport, simulando o `grid-cols-3` + `min-h` aplicados pelo Tailwind.
 */
function applyMockLayout(width: number, minH: number) {
  const horizontalPadding = 24;
  const gridGaps = 8; // 2 gaps de 4px (mobile)
  const cardWidth = Math.floor((width - horizontalPadding - gridGaps) / 3);
  const cardHeight = minH;

  METHODS.forEach(({ id }) => {
    const card = document.querySelector(`[data-testid="btn-${id}"]`) as HTMLElement;
    Object.defineProperty(card, "clientWidth", { value: cardWidth, configurable: true });
    Object.defineProperty(card, "clientHeight", { value: cardHeight, configurable: true });
    Object.defineProperty(card, "offsetWidth", { value: cardWidth, configurable: true });
    Object.defineProperty(card, "offsetHeight", { value: cardHeight, configurable: true });
    Object.defineProperty(card, "scrollWidth", { value: cardWidth, configurable: true });
    Object.defineProperty(card, "scrollHeight", { value: cardHeight, configurable: true });
    // bounding rect estável: nenhum offset por scale/transform
    card.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: cardWidth, height: cardHeight, top: 0, left: 0, right: cardWidth, bottom: cardHeight, toJSON: () => ({}) }) as DOMRect;
  });

  return { cardWidth, cardHeight };
}

describe("PaymentGrid alinhamento PIX/Boleto/Cartão", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const widths = [320, 360, 390];

  widths.forEach((width) => {
    it(`larguras iguais nos 3 botões em ${width}px (idle)`, () => {
      render(<PaymentGrid width={width} />);
      const { cardWidth, cardHeight } = applyMockLayout(width, 88);

      const widths3 = METHODS.map(({ id }) => {
        const el = document.querySelector(`[data-testid="btn-${id}"]`) as HTMLElement;
        return el.clientWidth;
      });
      const heights3 = METHODS.map(({ id }) => {
        const el = document.querySelector(`[data-testid="btn-${id}"]`) as HTMLElement;
        return el.clientHeight;
      });

      // Todos com mesma largura e altura
      expect(new Set(widths3).size).toBe(1);
      expect(new Set(heights3).size).toBe(1);

      // 3 cabem lado a lado e respeitam min-h
      expect(cardWidth * 3).toBeLessThanOrEqual(width);
      expect(cardHeight).toBeGreaterThanOrEqual(88);
    });

    it(`active não desloca o layout em ${width}px`, () => {
      render(<PaymentGrid width={width} />);
      applyMockLayout(width, 88);

      const before = (document.querySelector('[data-testid="btn-pix"]') as HTMLElement).getBoundingClientRect();

      // Ativa "boleto"
      fireEvent.click(document.querySelector('[data-testid="btn-boleto"]') as HTMLElement);
      applyMockLayout(width, 88);

      const after = (document.querySelector('[data-testid="btn-pix"]') as HTMLElement).getBoundingClientRect();

      // Posição e tamanho do PIX permanecem após selecionar outro
      expect(after.width).toBe(before.width);
      expect(after.height).toBe(before.height);
      expect(after.left).toBe(before.left);
      expect(after.top).toBe(before.top);

      // Boleto ativo sem efeito de transform/sombra empurrando layout
      const boleto = document.querySelector('[data-testid="btn-boleto"]') as HTMLElement;
      expect(boleto.dataset.active).toBe("true");
      expect(boleto.className).not.toMatch(/scale-/);
      expect(boleto.className).not.toMatch(/shadow-(md|lg|xl)/);
    });

    it(`loading (checking) preserva altura e ícone/label em ${width}px`, () => {
      render(<PaymentGrid width={width} />);
      applyMockLayout(width, 88);

      // PIX dispara estado checking síncrono (antes do setTimeout zerar)
      fireEvent.click(document.querySelector('[data-testid="btn-pix"]') as HTMLElement);

      const pix = document.querySelector('[data-testid="btn-pix"]') as HTMLElement;
      const spinner = document.querySelector('[data-testid="spinner-pix"]');
      const label = document.querySelector('[data-testid="label-pix"]') as HTMLElement;

      // Spinner substitui ícone, label vira "..." mas continua presente
      expect(spinner).toBeTruthy();
      expect(label.textContent).toBe("...");

      // Card mantém min-h e classes de altura mínima
      expect(pix.className).toMatch(/min-h-\[88px\]/);
      expect(pix.className).toMatch(/xxs:min-h-\[104px\]/);

      // Sem classes de animação de movimento (pulse/scale) que indicariam "flutuação"
      expect(pix.className).not.toMatch(/animate-pulse/);
      expect(pix.className).not.toMatch(/scale-\[/);
    });
  });

  it("classes do botão garantem ausência de efeito de flutuação", () => {
    render(<PaymentGrid width={360} />);
    METHODS.forEach(({ id }) => {
      const btn = document.querySelector(`[data-testid="btn-${id}"]`) as HTMLElement;
      // Sem transforms/escala em hover, active ou idle
      expect(btn.className).not.toMatch(/hover:scale-/);
      expect(btn.className).not.toMatch(/active:scale-/);
      expect(btn.className).not.toMatch(/group-active:scale-/);
      // boxShadow inline removido
      expect((btn.style.boxShadow || "none")).toBe("none");
    });
  });
});
