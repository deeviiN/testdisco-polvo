// Validação de formato das credenciais Mercado Pago.
// Não chama API externa — apenas verifica prefixo, tamanho e coerência
// entre o nome do secret (PROD/TEST) e o prefixo do token/chave.
//
// Regras oficiais do MP:
//   - ACCESS_TOKEN de produção: começa com "APP_USR-"
//   - ACCESS_TOKEN de teste:    começa com "TEST-"
//   - PUBLIC_KEY  de produção:  começa com "APP_USR-"
//   - PUBLIC_KEY  de teste:     começa com "TEST-"
// Tamanho mínimo razoável: 40 caracteres.

export type MpSecretName =
  | "MERCADOPAGO_ACCESS_TOKEN_PROD"
  | "MERCADOPAGO_ACCESS_TOKEN_TEST"
  | "MERCADOPAGO_PUBLIC_KEY_PROD"
  | "MERCADOPAGO_PUBLIC_KEY_TEST";

export interface MpCredentialIssue {
  level: "error" | "warning";
  message: string;
}

const MIN_LENGTH = 40;

/**
 * Valida o formato de uma credencial MP a partir do nome do secret e do
 * valor (mascarado para ACCESS_TOKEN, completo para PUBLIC_KEY).
 *
 * Retorna `null` se está OK, ou um objeto descrevendo o problema.
 */
export function validateMpSecretFormat(
  name: MpSecretName,
  rawValue: string | null | undefined,
  present: boolean
): MpCredentialIssue | null {
  if (!present || !rawValue) {
    return {
      level: "error",
      message: "Credencial ausente. Configure o valor nos Secrets do backend.",
    };
  }

  const value = rawValue.trim();
  const isProd = name.endsWith("_PROD");
  const expectedPrefix = isProd ? "APP_USR-" : "TEST-";
  const wrongPrefix = isProd ? "TEST-" : "APP_USR-";

  // Para ACCESS_TOKEN o backend devolve mascarado (ex: "APP_USR-****3a2f").
  // Conseguimos validar apenas o prefixo. Para PUBLIC_KEY validamos tudo.
  const masked = value.includes("****");

  if (value.startsWith(wrongPrefix)) {
    return {
      level: "error",
      message: isProd
        ? "Esta é uma credencial de TESTE (prefixo TEST-) salva no campo de PRODUÇÃO. Substitua pela credencial de produção (APP_USR-)."
        : "Esta é uma credencial de PRODUÇÃO (prefixo APP_USR-) salva no campo de TESTE. Substitua pela credencial de sandbox (TEST-).",
    };
  }

  if (!value.startsWith(expectedPrefix)) {
    return {
      level: "error",
      message: `Formato inválido. A credencial deve começar com "${expectedPrefix}". Verifique se você copiou o valor correto no painel do Mercado Pago.`,
    };
  }

  if (!masked && value.length < MIN_LENGTH) {
    return {
      level: "error",
      message: `Credencial muito curta (${value.length} caracteres). O valor parece incompleto — copie a credencial inteira.`,
    };
  }

  // Heurística: caractere visivelmente inválido (espaços ou quebras no meio).
  if (/\s/.test(value)) {
    return {
      level: "error",
      message: "Credencial contém espaços ou quebras de linha. Cole o valor sem espaços.",
    };
  }

  return null;
}

/**
 * Valida o MERCADOPAGO_WEBHOOK_SECRET. O backend não devolve o valor por
 * segurança — apenas `present` e `length`.
 */
export function validateMpWebhookSecret(
  present: boolean,
  length: number | null | undefined
): MpCredentialIssue | null {
  if (!present) {
    return {
      level: "error",
      message:
        "Webhook secret ausente. Sem ele as notificações do Mercado Pago não são autenticadas e podem ser rejeitadas. Configure MERCADOPAGO_WEBHOOK_SECRET nos Secrets do backend.",
    };
  }
  const len = typeof length === "number" ? length : 0;
  if (len < 16) {
    return {
      level: "error",
      message: `Webhook secret muito curto (${len} caracteres). Use o segredo completo gerado no painel do Mercado Pago em Notificações → Webhooks (mínimo 16 caracteres).`,
    };
  }
  if (len < 32) {
    return {
      level: "warning",
      message: `Webhook secret tem apenas ${len} caracteres. Recomendamos 32+ para maior segurança.`,
    };
  }
  return null;
}
