/**
 * Utilitários de contraste para garantir legibilidade mínima (WCAG AA)
 * sobre qualquer cor de brilho/destaque escolhida pelo usuário.
 *
 * Trabalha com strings HSL no formato "H S% L%" (sem o wrapper hsl()).
 */

export type HSL = { h: number; s: number; l: number };

/** Faz parsing tolerante de "H S% L%" ou "H, S%, L%" */
export function parseHsl(input: string): HSL | null {
  if (!input) return null;
  const cleaned = input.replace(/,/g, " ").replace(/%/g, "").trim();
  const parts = cleaned.split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [h, s, l] = parts;
  return { h, s, l };
}

/** Lê um HSL de uma CSS variable (ex.: "--primary") do :root */
export function readCssHsl(varName: string): HSL | null {
  if (typeof window === "undefined") return null;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return parseHsl(raw);
}

/** Conversão HSL → RGB (0-255) */
function hslToRgb({ h, s, l }: HSL): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Luminância relativa (WCAG) */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/** Razão de contraste WCAG entre dois HSL */
export function contrastRatio(a: HSL, b: HSL): number {
  const La = relativeLuminance(hslToRgb(a));
  const Lb = relativeLuminance(hslToRgb(b));
  const [hi, lo] = La > Lb ? [La, Lb] : [Lb, La];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: HSL = { h: 0, s: 0, l: 100 };
const BLACK: HSL = { h: 0, s: 0, l: 0 };

/**
 * Decide texto branco ou preto com base na cor de fundo,
 * priorizando o que oferecer maior contraste (mín. WCAG AA = 4.5).
 */
export function pickReadableText(bg: HSL): {
  color: "white" | "black";
  shadow: "dark" | "light";
  ratio: number;
} {
  const cWhite = contrastRatio(bg, WHITE);
  const cBlack = contrastRatio(bg, BLACK);
  if (cWhite >= cBlack) {
    return { color: "white", shadow: "dark", ratio: cWhite };
  }
  return { color: "black", shadow: "light", ratio: cBlack };
}

/**
 * Retorna classes/estilos prontos para aplicar em texto sobre uma cor primária,
 * com fallback automático para garantir contraste mínimo AA.
 */
export function readableOnPrimary(primary: HSL | null): {
  textColor: string; // valor CSS (ex.: "#fff")
  textShadow: string; // valor CSS para text-shadow
  dropShadowClass: string; // classe utilitária Tailwind
} {
  // Fallback: assume primary média se não conseguir ler
  const bg = primary ?? { h: 220, s: 60, l: 50 };
  const { color } = pickReadableText(bg);
  if (color === "white") {
    return {
      textColor: "#ffffff",
      textShadow: "0 1px 2px rgba(0,0,0,0.75), 0 0 6px rgba(0,0,0,0.5)",
      dropShadowClass: "drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]",
    };
  }
  return {
    textColor: "#0a0a0a",
    textShadow: "0 1px 2px rgba(255,255,255,0.85), 0 0 6px rgba(255,255,255,0.6)",
    dropShadowClass: "drop-shadow-[0_1px_2px_rgba(255,255,255,0.85)]",
  };
}
