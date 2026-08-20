/**
 * Utilidades para validação de cartão de crédito.
 */

export function maskCardNumber(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 16);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function maskExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export function isValidLuhn(number: string): boolean {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits.charAt(i));
    if (shouldDouble) {
      if ((d *= 2) > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function isValidExpiry(expiry: string): boolean {
  const clean = expiry.replace(/\D/g, "");
  if (clean.length !== 4) return false;
  
  const month = parseInt(clean.slice(0, 2));
  const year = parseInt(clean.slice(2));
  
  if (month < 1 || month > 12) return false;
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear() % 100;
  
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  
  return true;
}

/**
 * Detecta a bandeira do cartão localmente a partir do BIN.
 * Cobre as principais bandeiras aceitas no Brasil (Mercado Pago).
 * Retorna o ID compatível com `payment_method_id` da MP.
 */
export function getCardBrand(number: string): string | null {
  const n = number.replace(/\D/g, "");
  if (n.length < 4) return null;

  // Elo (precisa vir antes de Visa/Master por sobreposição de prefixos)
  const eloPrefixes = [
    "401178", "401179", "438935", "457631", "457632", "431274",
    "451416", "457393", "504175", "506699", "5067", "509",
    "627780", "636297", "636368", "650", "6516", "6550",
  ];
  if (eloPrefixes.some((p) => n.startsWith(p))) return "elo";

  // Hipercard
  if (/^(606282|3841)/.test(n)) return "hipercard";

  // Visa
  if (/^4/.test(n)) return "visa";
  // Mastercard (51-55 e 2221-2720)
  if (/^5[1-5]/.test(n)) return "master";
  if (/^2(2[2-9][1-9]|2[3-9]\d{2}|[3-6]\d{3}|7[01]\d{2}|720\d)/.test(n)) return "master";
  // American Express
  if (/^3[47]/.test(n)) return "amex";
  // Diners
  if (/^3(0[0-5]|095|6|8|9)/.test(n)) return "diners";
  // Discover
  if (/^6(011|5|4[4-9])/.test(n)) return "discover";
  // JCB
  if (/^35(2[89]|[3-8]\d)/.test(n)) return "jcb";

  return null;
}

/** Nome amigável da bandeira para exibição em UI. */
export function getCardBrandLabel(brandId: string | null): string {
  switch (brandId) {
    case "visa": return "Visa";
    case "master": return "Mastercard";
    case "amex": return "American Express";
    case "elo": return "Elo";
    case "hipercard": return "Hipercard";
    case "diners": return "Diners";
    case "discover": return "Discover";
    case "jcb": return "JCB";
    default: return "";
  }
}
