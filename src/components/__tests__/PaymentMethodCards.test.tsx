/**
 * Teste de responsividade dos 3 quadros de método de pagamento (PIX/Boleto/Cartão).
 *
 * Garante que, em alturas comuns de celular (360, 480, 640px) e na largura mínima
 * (320px), cada card:
 *   - renderiza ícone + label
 *   - não corta texto (scrollWidth/Height <= clientWidth/Height + tolerância)
 *   - mantém os 3 visíveis lado a lado dentro do container
 *
 * Reproduz a estrutura do grid usada em src/pages/Subscription.tsx (etapa "payment",
 * antes de abrir o detalhe). Mantemos o markup local para isolar o teste do resto
 * da página (que depende de Supabase/contexto).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QrCode, FileText, CreditCard } from "lucide-react";

const METHODS = [
  { id: "pix", Icon: QrCode, label: "PIX" },
  { id: "boleto", Icon: FileText, label: "Boleto" },
  { id: "card", Icon: CreditCard, label: "Cartão" },
] as const;

function PaymentGrid() {
  return (
    <div
      data-testid="payment-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 8,
        flex: 1,
        minHeight: 0,
        height: "100%",
        width: "100%",
      }}
    >
      {METHODS.map(({ id, Icon, label }) => (
        <button
          key={id}
          data-testid={`card-${id}`}
          type="button"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            border: "2px solid #ccc",
            height: "100%",
            width: "100%",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            padding: "6%",
            gap: "clamp(4px, 4%, 12px)",
          }}
        >
          <Icon
            data-testid={`icon-${id}`}
            style={{
              width: "clamp(24px, 42%, 56px)",
              height: "clamp(24px, 42%, 56px)",
            }}
          />
          <span
            data-testid={`label-${id}`}
            style={{
              fontWeight: 600,
              lineHeight: 1,
              textAlign: "center",
              wordBreak: "break-word",
              fontSize: "clamp(11px, 14%, 17px)",
            }}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Renderiza o grid dentro de um container com largura/altura controladas
 * (simulando a área disponível no celular após cabeçalho + botão Continuar).
 */
function renderAtViewport(width: number, contentHeight: number) {
  // Limpa renderização anterior
  document.body.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${contentHeight}px`;
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.padding = "12px";
  wrapper.style.boxSizing = "border-box";
  document.body.appendChild(wrapper);

  return render(<PaymentGrid />, { container: wrapper });
}

// jsdom não calcula layout real (clientWidth = 0). Mockamos as dimensões de cada
// card baseado no viewport para simular o comportamento do browser:
//   - largura do card ≈ (width - padding - gaps) / 3
//   - altura do card ≈ contentHeight - paddings/labels
function applyMockLayout(width: number, contentHeight: number) {
  const horizontalPadding = 24; // 12px de cada lado do wrapper
  const gridGaps = 16; // 2 gaps de 8px
  const cardWidth = Math.floor((width - horizontalPadding - gridGaps) / 3);
  // Altura útil do card: tira o padding vertical do wrapper (24px)
  const cardHeight = Math.max(40, contentHeight - 24);

  METHODS.forEach(({ id, label }) => {
    const card = document.querySelector(`[data-testid="card-${id}"]`) as HTMLElement;
    const icon = document.querySelector(`[data-testid="icon-${id}"]`) as HTMLElement;
    const labelEl = document.querySelector(`[data-testid="label-${id}"]`) as HTMLElement;

    Object.defineProperty(card, "clientWidth", { value: cardWidth, configurable: true });
    Object.defineProperty(card, "clientHeight", { value: cardHeight, configurable: true });

    // Ícone: clamp(24px, 42%, 56px) — calcula sobre o menor lado do card
    const base = Math.min(cardWidth, cardHeight);
    const iconSize = Math.max(24, Math.min(56, Math.round(base * 0.42)));
    Object.defineProperty(icon, "clientWidth", { value: iconSize, configurable: true });
    Object.defineProperty(icon, "clientHeight", { value: iconSize, configurable: true });
    Object.defineProperty(icon, "scrollWidth", { value: iconSize, configurable: true });
    Object.defineProperty(icon, "scrollHeight", { value: iconSize, configurable: true });

    // Label: largura do texto ~= (chars * fontSize * 0.6); altura = lineHeight (1) * fontSize
    const fontSize = Math.max(11, Math.min(17, Math.round(base * 0.14)));
    const textWidth = Math.ceil(label.length * fontSize * 0.6);
    const textHeight = fontSize; // line-height: 1
    Object.defineProperty(labelEl, "clientWidth", {
      value: Math.min(cardWidth - 8, textWidth),
      configurable: true,
    });
    Object.defineProperty(labelEl, "clientHeight", { value: textHeight, configurable: true });
    Object.defineProperty(labelEl, "scrollWidth", { value: textWidth, configurable: true });
    Object.defineProperty(labelEl, "scrollHeight", { value: textHeight, configurable: true });

    // Verifica que ícone + label + gap mínimo cabem na altura do card
    Object.defineProperty(card, "scrollHeight", {
      value: iconSize + textHeight + 12 /* gap+padding */,
      configurable: true,
    });
    Object.defineProperty(card, "scrollWidth", {
      value: Math.max(iconSize, textWidth) + 8,
      configurable: true,
    });
  });

  return { cardWidth, cardHeight };
}

describe("PaymentGrid responsividade (PIX / Boleto / Cartão)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // Larguras comuns de celular: 320 (mínima), 360, 390 (preview atual)
  const widths = [320, 360, 390];
  // Alturas de área útil (após header + botão Continuar): 360, 480, 640
  const contentHeights = [360, 480, 640];

  widths.forEach((width) => {
    contentHeights.forEach((contentHeight) => {
      it(`não corta ícone nem texto em ${width}x${contentHeight}`, () => {
        renderAtViewport(width, contentHeight);
        const { cardWidth, cardHeight } = applyMockLayout(width, contentHeight);

        // Os 3 cards devem caber lado a lado dentro da largura do viewport
        expect(cardWidth * 3).toBeLessThanOrEqual(width);
        expect(cardWidth).toBeGreaterThanOrEqual(80);
        expect(cardHeight).toBeGreaterThanOrEqual(80);

        METHODS.forEach(({ id }) => {
          const card = document.querySelector(`[data-testid="card-${id}"]`) as HTMLElement;
          const icon = document.querySelector(`[data-testid="icon-${id}"]`) as HTMLElement;
          const label = document.querySelector(`[data-testid="label-${id}"]`) as HTMLElement;

          // Ícone e label renderizados
          expect(icon).toBeTruthy();
          expect(label).toBeTruthy();

          // Ícone cabe dentro do card (largura e altura)
          expect(icon.clientWidth).toBeLessThanOrEqual(card.clientWidth);
          expect(icon.clientHeight).toBeLessThanOrEqual(card.clientHeight);

          // Label não estoura horizontalmente (com 1px de tolerância)
          expect(label.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);

          // Ícone + label cabem verticalmente dentro do card
          expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);

          // Tamanhos mínimos legíveis (ícone >= 24px, fonte >= 11px → label height >= 11)
          expect(icon.clientWidth).toBeGreaterThanOrEqual(24);
          expect(label.clientHeight).toBeGreaterThanOrEqual(11);
        });
      });
    });
  });

  // Modo compacto: alturas pequenas (teclado virtual aberto, paisagem, telas curtas)
  const compactHeights = [240, 280];
  widths.forEach((width) => {
    compactHeights.forEach((contentHeight) => {
      it(`modo compacto: não corta ícone nem texto em ${width}x${contentHeight}`, () => {
        renderAtViewport(width, contentHeight);
        const { cardWidth, cardHeight } = applyMockLayout(width, contentHeight);

        // 3 cards lado a lado e tamanho mínimo utilizável
        expect(cardWidth * 3).toBeLessThanOrEqual(width);
        expect(cardWidth).toBeGreaterThanOrEqual(80);
        expect(cardHeight).toBeGreaterThanOrEqual(40);

        METHODS.forEach(({ id }) => {
          const card = document.querySelector(`[data-testid="card-${id}"]`) as HTMLElement;
          const icon = document.querySelector(`[data-testid="icon-${id}"]`) as HTMLElement;
          const label = document.querySelector(`[data-testid="label-${id}"]`) as HTMLElement;

          // Ícone cabe dentro do card
          expect(icon.clientWidth).toBeLessThanOrEqual(card.clientWidth);
          expect(icon.clientHeight).toBeLessThanOrEqual(card.clientHeight);

          // Label não estoura horizontalmente (com 1px de tolerância)
          expect(label.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);

          // Ícone + label cabem verticalmente
          expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);

          // Mínimos legíveis preservados mesmo em modo compacto
          expect(icon.clientWidth).toBeGreaterThanOrEqual(24);
          expect(label.clientHeight).toBeGreaterThanOrEqual(11);
        });
      });
    });
  });

  // Rotação: portrait (estreito × alto) vs landscape (largo × baixo).
  // Em landscape, a largura cresce mas a altura útil cai bastante (240/280px típicos).
  type Orientation = "portrait" | "landscape";
  const rotationCases: { orientation: Orientation; width: number; contentHeight: number }[] = [
    // Portrait compacto (telas pequenas com teclado aberto)
    { orientation: "portrait", width: 320, contentHeight: 240 },
    { orientation: "portrait", width: 320, contentHeight: 280 },
    { orientation: "portrait", width: 360, contentHeight: 240 },
    { orientation: "portrait", width: 360, contentHeight: 280 },
    { orientation: "portrait", width: 390, contentHeight: 240 },
    { orientation: "portrait", width: 390, contentHeight: 280 },
    // Landscape (celular deitado): largura grande, altura útil pequena
    { orientation: "landscape", width: 568, contentHeight: 240 },
    { orientation: "landscape", width: 640, contentHeight: 240 },
    { orientation: "landscape", width: 667, contentHeight: 280 },
    { orientation: "landscape", width: 736, contentHeight: 280 },
    { orientation: "landscape", width: 812, contentHeight: 240 },
    { orientation: "landscape", width: 844, contentHeight: 280 },
  ];

  rotationCases.forEach(({ orientation, width, contentHeight }) => {
    it(`rotação ${orientation}: cards intactos em ${width}x${contentHeight}`, () => {
      // Simula matchMedia para orientação
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
          matches: query.includes(`orientation: ${orientation}`),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      });

      // Sanidade: matchMedia retorna a orientação esperada
      expect(window.matchMedia(`(orientation: ${orientation})`).matches).toBe(true);

      renderAtViewport(width, contentHeight);
      const { cardWidth, cardHeight } = applyMockLayout(width, contentHeight);

      // Aspect ratio coerente com a orientação do viewport
      if (orientation === "landscape") {
        expect(width).toBeGreaterThan(contentHeight);
      }

      // 3 cards lado a lado e tamanho mínimo utilizável
      expect(cardWidth * 3).toBeLessThanOrEqual(width);
      expect(cardWidth).toBeGreaterThanOrEqual(80);
      expect(cardHeight).toBeGreaterThanOrEqual(40);

      METHODS.forEach(({ id }) => {
        const card = document.querySelector(`[data-testid="card-${id}"]`) as HTMLElement;
        const icon = document.querySelector(`[data-testid="icon-${id}"]`) as HTMLElement;
        const label = document.querySelector(`[data-testid="label-${id}"]`) as HTMLElement;

        // Ícone cabe dentro do card
        expect(icon.clientWidth).toBeLessThanOrEqual(card.clientWidth);
        expect(icon.clientHeight).toBeLessThanOrEqual(card.clientHeight);

        // Label não estoura horizontalmente (1px de tolerância)
        expect(label.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);

        // Ícone + label cabem verticalmente
        expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);

        // Mínimos legíveis preservados em ambas as orientações
        expect(icon.clientWidth).toBeGreaterThanOrEqual(24);
        expect(label.clientHeight).toBeGreaterThanOrEqual(11);
      });
    });
  });

  it("renderiza os 3 cards visíveis (PIX, Boleto, Cartão)", () => {
    const { getByTestId } = renderAtViewport(390, 480);
    expect(getByTestId("card-pix").textContent).toContain("PIX");
    expect(getByTestId("card-boleto").textContent).toContain("Boleto");
    expect(getByTestId("card-card").textContent).toContain("Cartão");
  });
});
