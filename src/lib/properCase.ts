/**
 * Máscara de capitalização para nomes próprios, assuntos e endereços.
 * - Primeira letra de cada palavra em maiúscula
 * - Restante minúsculo
 * - Conectivos ("de", "da", "do", "das", "dos", "e", "di", "du", "del", "della",
 *   "von", "van", "la", "le", "lo", "los", "las", "y") sempre minúsculos,
 *   exceto se forem a primeira palavra
 * - Preserva múltiplos espaços enquanto digita, mas colapsa espaços no final
 * - Mantém apóstrofos e hifens (ex.: D'Ávila, Vitória-Régia)
 */
const CONNECTORS = new Set([
  "de", "da", "do", "das", "dos", "e",
  "di", "du", "del", "della", "delle",
  "von", "van", "der", "den",
  "la", "le", "lo", "los", "las", "y",
  "of", "the",
]);

function capWord(w: string, isFirst: boolean): string {
  if (!w) return w;
  const lower = w.toLocaleLowerCase("pt-BR");
  if (!isFirst && CONNECTORS.has(lower)) return lower;
  // Capitaliza após hífen e apóstrofo também
  return lower.replace(/(^|[\s'’\-])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase("pt-BR"));
}

export function toProperCase(input: string): string {
  if (!input) return input;
  // Preserva espaço final (caso o usuário esteja digitando próxima palavra)
  const trailing = /\s$/.test(input) ? " " : "";
  const parts = input.split(/\s+/).filter(Boolean);
  return parts.map((p, i) => capWord(p, i === 0)).join(" ") + trailing;
}
