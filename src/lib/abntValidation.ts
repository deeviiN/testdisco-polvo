// Validador de conformidade ABNT (NBR 14724) para contratos em PDF.
// Regras: A4 (210x297mm), margens sup/esq 3cm, inf/dir 2cm,
// recuo de 1ª linha 1,25cm, fonte Times/Arial 12pt, espaçamento 1,5.

export interface AbntLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  firstLineIndentMm: number;
  fontFamily: string;
  fontSizePt: number;
  lineSpacing: number;
}

export interface AbntValidationResult {
  valid: boolean;
  errors: string[];
}

const TOLERANCE_MM = 0.5;
const ALLOWED_FONTS = ["times", "helvetica", "arial"];

export function validateAbntLayout(layout: AbntLayout): AbntValidationResult {
  const errors: string[] = [];

  if (
    Math.abs(layout.pageWidthMm - 210) > TOLERANCE_MM ||
    Math.abs(layout.pageHeightMm - 297) > TOLERANCE_MM
  ) {
    errors.push(
      `Tamanho da página fora do A4 (210x297 mm). Atual: ${layout.pageWidthMm.toFixed(1)}x${layout.pageHeightMm.toFixed(1)} mm.`,
    );
  }
  if (layout.marginLeftMm < 30 - TOLERANCE_MM)
    errors.push(`Margem esquerda < 3 cm (${layout.marginLeftMm} mm).`);
  if (layout.marginTopMm < 30 - TOLERANCE_MM)
    errors.push(`Margem superior < 3 cm (${layout.marginTopMm} mm).`);
  if (layout.marginRightMm < 20 - TOLERANCE_MM)
    errors.push(`Margem direita < 2 cm (${layout.marginRightMm} mm).`);
  if (layout.marginBottomMm < 20 - TOLERANCE_MM)
    errors.push(`Margem inferior < 2 cm (${layout.marginBottomMm} mm).`);
  if (Math.abs(layout.firstLineIndentMm - 12.5) > TOLERANCE_MM)
    errors.push(`Recuo da 1ª linha diferente de 1,25 cm (atual: ${layout.firstLineIndentMm} mm).`);
  if (layout.fontSizePt < 11.5 || layout.fontSizePt > 12.5)
    errors.push(`Tamanho de fonte fora de 12 pt (atual: ${layout.fontSizePt}).`);
  if (layout.lineSpacing < 1.4 || layout.lineSpacing > 1.6)
    errors.push(`Espaçamento entre linhas fora de 1,5 (atual: ${layout.lineSpacing}).`);
  if (!ALLOWED_FONTS.includes(layout.fontFamily.toLowerCase()))
    errors.push(`Fonte "${layout.fontFamily}" não recomendada pela ABNT.`);

  const usableWidth = layout.pageWidthMm - layout.marginLeftMm - layout.marginRightMm;
  const usableHeight = layout.pageHeightMm - layout.marginTopMm - layout.marginBottomMm;
  if (usableWidth <= 0) errors.push(`Área útil inválida (largura ${usableWidth} mm).`);
  if (usableHeight <= 0) errors.push(`Área útil inválida (altura ${usableHeight} mm).`);

  return { valid: errors.length === 0, errors };
}

export const ABNT_CONTRACT_LAYOUT: AbntLayout = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginTopMm: 30,
  marginBottomMm: 20,
  marginLeftMm: 30,
  marginRightMm: 20,
  firstLineIndentMm: 12.5,
  fontFamily: "times",
  fontSizePt: 12,
  lineSpacing: 1.5,
};
