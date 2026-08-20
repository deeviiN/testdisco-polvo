/**
 * Runtime validator para o pipeline de PIX/Boletos.
 *
 * PIX/Boletos não passam por upload em Storage: são gerados pela edge function
 * `criar-pagamento-mp` e gravados na tabela `pagamentos`. Para garantir que o
 * que o admin enxerga em `/admin/documentos` é EXATAMENTE o mesmo conjunto que
 * o gestor enxerga na "Gaveta de Documentos", validamos em runtime, antes de
 * persistir o item no estado da página, que:
 *
 *  1. NÃO há `bucket`/`path` (boletos/pix nunca são objetos de Storage).
 *  2. NÃO há `signer_role` (esse campo é exclusivo de signed_contracts).
 *  3. O `status` se enquadra na lista canônica de PAGO ou em um estado pendente
 *     conhecido — evitando que o admin marque "PAGO" enquanto o gestor mostra
 *     "pending" (ou vice-versa) por divergência de normalização.
 *  4. A classificação `pix` vs `boleto` segue a MESMA regra dos dois leitores:
 *     `metodo` contém "pix" OU existe `qr_code`/`qr_code_base64`.
 *  5. Itens classificados como PIX expõem `qr_code` (copia-e-cola); itens
 *     classificados como BOLETO expõem `ticket_url`. Caso contrário o
 *     documento é "vazio" e não deve ser mostrado nem ao admin nem ao gestor.
 *
 * Em produção, divergências apenas geram um console.warn e o item é descartado
 * (não persistido / não mostrado). Em desenvolvimento ou testes, lance.
 */

export const PAID_STATUSES = new Set([
  "approved",
  "paid",
  "pago",
  "aprovado",
  "completed",
  "succeeded",
]);

export const PENDING_STATUSES = new Set([
  "pending",
  "in_process",
  "in_mediation",
  "authorized",
  "rejected",
  "cancelled",
  "canceled",
  "refunded",
  "charged_back",
  "expired",
]);

export type PaymentRow = {
  id: string;
  school_id: string;
  plano: string | null;
  valor: number | string | null;
  metodo: string | null;
  status: string | null;
  ticket_url: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  created_at: string;
  approved_at: string | null;
};

export type ValidatedPaymentDoc = {
  id: string;
  schoolId: string;
  kind: "pix" | "boleto";
  paid: boolean;
  status: string;
  url?: string;
  pixCode?: string;
  metodo: string;
  plano: string;
  valor: string;
  date: string;
  paidAt?: string;
};

export type ValidationIssue = {
  code:
    | "unexpected_bucket"
    | "unexpected_path"
    | "unexpected_signer_role"
    | "unknown_status"
    | "missing_pix_payload"
    | "missing_boleto_payload";
  message: string;
};

export class PaymentDocumentValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(`PaymentDocumentValidationError: ${issues.map((i) => i.code).join(",")}`);
    this.issues = issues;
  }
}

/**
 * Valida e normaliza UMA linha de `pagamentos` em um documento que será
 * mostrado tanto pelo admin quanto pelo gestor. Retorna `null` se o item
 * deve ser descartado (em modo "warn").
 */
export function validatePaymentDocument(
  row: PaymentRow & Record<string, unknown>,
  opts: { mode?: "warn" | "throw"; viewer: "admin" | "gestor" } = { viewer: "admin" },
): ValidatedPaymentDoc | null {
  const mode = opts.mode ?? "warn";
  const issues: ValidationIssue[] = [];

  // 1) Boletos/PIX nunca devem trazer bucket/path/signer_role.
  if ("bucket" in row && row.bucket) {
    issues.push({ code: "unexpected_bucket", message: `pagamento ${row.id} traz bucket=${String(row.bucket)}` });
  }
  if ("path" in row && row.path) {
    issues.push({ code: "unexpected_path", message: `pagamento ${row.id} traz path=${String(row.path)}` });
  }
  if ("signer_role" in row && row.signer_role) {
    issues.push({
      code: "unexpected_signer_role",
      message: `pagamento ${row.id} traz signer_role=${String(row.signer_role)} (campo exclusivo de signed_contracts)`,
    });
  }

  const rawStatus = String(row.status ?? "").toLowerCase();
  const manuallyPaid = !!(row as any).manually_marked_paid;
  const isPaid = PAID_STATUSES.has(rawStatus) || manuallyPaid;
  if (rawStatus && !PAID_STATUSES.has(rawStatus) && !PENDING_STATUSES.has(rawStatus)) {
    issues.push({
      code: "unknown_status",
      message: `pagamento ${row.id} status="${rawStatus}" não está na lista canônica`,
    });
  }

  const metodo = String(row.metodo ?? "").toLowerCase();
  const isPix = metodo.includes("pix") || !!row.qr_code || !!row.qr_code_base64;
  const kind: "pix" | "boleto" = isPix ? "pix" : "boleto";

  // 5) Coerência de payload por tipo.
  if (kind === "pix" && !row.qr_code && !row.qr_code_base64 && !row.ticket_url) {
    issues.push({
      code: "missing_pix_payload",
      message: `pagamento PIX ${row.id} sem qr_code nem ticket_url`,
    });
  }
  if (kind === "boleto" && !row.ticket_url) {
    issues.push({
      code: "missing_boleto_payload",
      message: `pagamento boleto ${row.id} sem ticket_url`,
    });
  }

  if (issues.length > 0) {
    if (mode === "throw") throw new PaymentDocumentValidationError(issues);
    // warn + descarta
    if (typeof console !== "undefined") {
      for (const i of issues) {
        // eslint-disable-next-line no-console
        console.warn(`[paymentDocumentValidator/${opts.viewer}] ${i.code}: ${i.message}`);
      }
    }
    return null;
  }

  const valor = typeof row.valor === "number" ? row.valor.toFixed(2) : String(row.valor ?? "");
  const paidAt = row.approved_at || (manuallyPaid ? ((row as any).marked_paid_at as string | undefined) : undefined);
  return {
    id: row.id,
    schoolId: row.school_id,
    kind,
    paid: isPaid,
    status: manuallyPaid && !PAID_STATUSES.has(rawStatus) ? "manually_marked_paid" : rawStatus,
    url: row.ticket_url ?? undefined,
    pixCode: kind === "pix" ? (row.qr_code ?? undefined) : undefined,
    metodo,
    plano: row.plano ?? "Plano",
    valor,
    date: paidAt || row.created_at,
    paidAt: paidAt ?? undefined,
  };
}

export type DiscardedPaymentLog = {
  id: string;
  schoolId: string | null;
  kindGuess: "pix" | "boleto";
  issues: ValidationIssue[];
  at: string;
};

/**
 * Itera linhas de `pagamentos`, devolve documentos válidos e captura uma lista
 * de descartes para exibição em UI (contador + log).
 */
export function validatePaymentBatch(
  rows: Array<PaymentRow & Record<string, unknown>>,
  viewer: "admin" | "gestor",
): { docs: ValidatedPaymentDoc[]; discards: DiscardedPaymentLog[] } {
  const docs: ValidatedPaymentDoc[] = [];
  const discards: DiscardedPaymentLog[] = [];
  const now = new Date().toISOString();
  for (const r of rows) {
    try {
      const doc = validatePaymentDocument(r, { viewer, mode: "throw" });
      if (doc) docs.push(doc);
    } catch (e) {
      if (e instanceof PaymentDocumentValidationError) {
        const metodo = String(r.metodo ?? "").toLowerCase();
        const kindGuess: "pix" | "boleto" =
          metodo.includes("pix") || r.qr_code || r.qr_code_base64 ? "pix" : "boleto";
        discards.push({
          id: r.id,
          schoolId: r.school_id ?? null,
          kindGuess,
          issues: e.issues,
          at: now,
        });
      } else {
        throw e;
      }
    }
  }
  return { docs, discards };
}

