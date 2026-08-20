import { supabase } from "@/integrations/supabase/client";

export type PlanoTipo = "mensal" | "anual";
export type MetodoPagamento = "pix" | "boleto" | "cartao";

export interface PayerInput {
  email: string;
  first_name?: string;
  last_name?: string;
  identification?: { type: "CPF" | "CNPJ"; number: string };
}

export interface CriarPagamentoParams {
  plano: PlanoTipo;
  metodo: MetodoPagamento;
  payer: PayerInput;
  token?: string;
  installments?: number;
  payment_method_id?: string;
  issuer_id?: number;
}

export interface CriarPagamentoResponse {
  pagamento_id: string;
  status?: string;
  // PIX / Boleto / Card (Transparent)
  mp_payment_id?: string;
  qr_code?: string;
  qr_code_base64?: string;
  ticket_url?: string | null;
  expires_at?: string;
  barcode?: string | null;
  // Card (Pro)
  mp_preference_id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

export class PaymentsUnavailableError extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "PaymentsUnavailableError";
    this.reason = reason;
  }
}

// Regex de validação de email (RFC simplificado)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  return String(email).trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) return false;
  return EMAIL_REGEX.test(normalized);
}

export async function criarPagamentoMP(
  params: CriarPagamentoParams
): Promise<CriarPagamentoResponse> {
  // 1) Validação obrigatória de campos antes de chamar o backend
  if (!params?.plano) throw new Error("Plano é obrigatório.");
  if (!params?.metodo) throw new Error("Método de pagamento é obrigatório.");
  if (!params?.payer) throw new Error("Dados do pagador são obrigatórios.");

  // 2) Normaliza e valida o email do pagador
  const normalizedEmail = normalizeEmail(params.payer.email);
  if (!isValidEmail(normalizedEmail)) {
    console.error("[criarPagamentoMP] email inválido recebido:", params.payer.email);
    throw new Error("Digite um email válido para continuar.");
  }

  const safeParams: CriarPagamentoParams = {
    ...params,
    payer: {
      ...params.payer,
      email: normalizedEmail,
      first_name: params.payer.first_name?.trim() || undefined,
      last_name: params.payer.last_name?.trim() || undefined,
    },
  };

  console.log("[criarPagamentoMP] email recebido:", params.payer.email);
  console.log("[criarPagamentoMP] email enviado ao Mercado Pago:", normalizedEmail);
  console.log("[criarPagamentoMP] payload final:", {
    plano: safeParams.plano,
    metodo: safeParams.metodo,
    payer: { ...safeParams.payer, identification: safeParams.payer.identification ? "***" : undefined },
  });

  try {
    const { data, error } = await supabase.functions.invoke<CriarPagamentoResponse | { error: string; reason?: string; message?: string }>(
      "criar-pagamento-mp",
      { body: safeParams }
    );
    // Edge function 503 surfaces here as { error: 'payments_unavailable', reason, message }
    if (data && (data as any).error === "payments_unavailable") {
      const d = data as { reason?: string; message?: string };
      throw new PaymentsUnavailableError(d.reason ?? "unknown", d.message ?? "Pagamentos indisponíveis");
    }
    if (error) throw new Error(error.message ?? "Falha ao criar pagamento");
    if (!data) throw new Error("Resposta vazia do backend de pagamento");
    if ((data as any).error) {
      throw new Error((data as any).message ?? (data as any).error ?? "Falha ao criar pagamento");
    }
    return data as CriarPagamentoResponse;
  } catch (err: any) {
    if (err instanceof PaymentsUnavailableError) throw err;
    console.error("[criarPagamentoMP] erro ao criar pagamento:", err);
    throw new Error(err?.message || "Ocorreu um erro inesperado ao criar o pagamento. Tente novamente.");
  }
}

export interface MpConfigStatus {
  secrets: Record<string, { present: boolean; masked?: string; value?: string }>;
  active_mode: "test" | "prod" | null;
  active_status: { ok: boolean; reason?: string; cached?: boolean } | null;
  webhook_url: string;
  payments_enabled: boolean;
  force_test_mode?: boolean;
}

export async function setMpForceTestMode(enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_mp_force_test_mode", { _enabled: enabled });
  if (error) throw new Error(error.message ?? "Falha ao alterar modo de teste");
  return data === true;
}

export async function getMpConfigStatus(): Promise<MpConfigStatus> {
  const { data, error } = await supabase.functions.invoke<MpConfigStatus>("mp-config-status");
  if (error) throw new Error(error.message ?? "Falha ao consultar status do Mercado Pago");
  if (!data) throw new Error("Resposta vazia");
  return data;
}

export async function testMpCredentials(mode?: "test" | "prod"): Promise<{
  ok: boolean;
  mode: "test" | "prod" | null;
  reason: string | null;
  account: { nickname?: string; site_id?: string; email?: string } | null;
}> {
  const { data, error } = await supabase.functions.invoke("mp-credentials-check", {
    body: mode ? { mode } : {},
  });
  if (error) throw new Error(error.message ?? "Falha ao testar credenciais");
  return data as any;
}

export interface MpWebhookTestResult {
  ok: boolean;
  http_status?: number;
  elapsed_ms?: number;
  webhook_url?: string;
  request_id?: string;
  upstream_request_id?: string | null;
  signature?: { ts: string; v1_preview: string; manifest: string };
  response?: unknown;
  reason?: string | null;
  detail?: string;
}

export async function testMpWebhook(): Promise<MpWebhookTestResult> {
  const { data, error } = await supabase.functions.invoke<MpWebhookTestResult>("mp-test-webhook", { body: {} });
  if (error) throw new Error(error.message ?? "Falha ao testar webhook");
  if (!data) throw new Error("Resposta vazia");
  return data;
}

export interface PagamentoRow {
  id: string;
  status: string;
  metodo: MetodoPagamento;
  plano: PlanoTipo;
  valor: number;
  data_inicio: string | null;
  data_fim: string | null;
  approved_at: string | null;
  expires_at: string | null;
  ticket_url: string | null;
}

/** Consulta o status atual de um pagamento (polling no frontend). */
export async function getPagamentoStatus(pagamentoId: string): Promise<PagamentoRow | null> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select(
      "id,status,metodo,plano,valor,data_inicio,data_fim,approved_at,expires_at,ticket_url"
    )
    .eq("id", pagamentoId)
    .maybeSingle();
  if (error) throw error;
  return (data as PagamentoRow | null) ?? null;
}

/** 
 * Força a sincronização do status com o Mercado Pago.
 * Útil para o botão "Já paguei" ou quando o polling detecta demora.
 */
export async function confirmarPagamentoMP(pagamentoId: string): Promise<{
  status: string;
  approved: boolean;
  released: boolean;
}> {
  const { data, error } = await supabase.functions.invoke("confirmar-pagamento-mp", {
    body: { pagamento_id: pagamentoId },
  });
  if (error) throw new Error(error.message ?? "Falha ao confirmar pagamento");
  return data;
}

export interface AssinaturaRow {
  id: string;
  school_id: string;
  status: "ativo" | "inativo" | "cancelado";
  tipo: PlanoTipo;
  validade: string;
}

/** Lê a assinatura ativa da escola do usuário logado. */
export async function getMinhaAssinatura(): Promise<AssinaturaRow | null> {
  const { data, error } = await supabase.rpc("get_my_assinatura");
  if (error) throw error;
  if (!data) return null;
  return data as unknown as AssinaturaRow;
}
