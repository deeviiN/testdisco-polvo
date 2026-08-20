/**
 * Validates that a subject/topic field contains coherent text,
 * rejecting random characters, repeated letters, or gibberish.
 */

// Checks if text is mostly repeated single characters like "xxxx", "ççççç", "ddddd"
function hasRepeatedCharPattern(text: string): boolean {
  // Match 3+ consecutive identical characters
  return /(.)\1{2,}/i.test(text);
}

// Checks if text contains only special characters or numbers (no real words)
function hasNoLetterWords(text: string): boolean {
  // Remove numbers, punctuation, spaces — check if any real letter sequence remains
  const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  return letters.length < 3;
}

// Checks if the text has at least one word with 3+ letters
function hasRealWord(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.some((w) => {
    const clean = w.replace(/[^a-zA-ZÀ-ÿ]/g, "");
    return clean.length >= 3;
  });
}

// Checks for keyboard-mashing patterns (same char repeated in every word)
function isKeyboardMash(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return true;
  const mashWords = words.filter((w) => {
    const clean = w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, "");
    if (clean.length < 2) return false;
    // All same character
    if (new Set(clean.toLowerCase().split("")).size === 1) return true;
    // 3+ repeated chars
    if (/(.)\1{2,}/i.test(clean)) return true;
    return false;
  });
  // If most words are mash, reject
  return mashWords.length > words.length / 2;
}

export interface SubjectValidation {
  valid: boolean;
  message?: string;
}

export function validateSubject(value: string): SubjectValidation {
  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: false, message: "Preencha o assunto para continuar" };
  }

  if (trimmed.length < 3) {
    return { valid: false, message: "O assunto deve ter pelo menos 3 caracteres" };
  }

  if (hasNoLetterWords(trimmed)) {
    return { valid: false, message: "Digite um assunto válido com palavras reais" };
  }

  if (!hasRealWord(trimmed)) {
    return { valid: false, message: "Digite um assunto válido com pelo menos uma palavra" };
  }

  if (hasRepeatedCharPattern(trimmed) || isKeyboardMash(trimmed)) {
    return { valid: false, message: "Digite um assunto coerente (ex: Reunião pedagógica)" };
  }

  return { valid: true };
}
