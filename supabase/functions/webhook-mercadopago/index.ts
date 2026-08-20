// Edge Function: webhook-mercadopago
// Recebe notificações do Mercado Pago, valida a assinatura HMAC v2,
// valida o payload, busca o pagamento via API, atualiza o registro local
// em `pagamentos` e — se aprovado — chama `liberar_assinatura`.
//
// Mercado Pago envia em formatos variados:
//   - query: ?type=payment&data.id=123 ou ?topic=payment&id=123
//   - body : { type: "payment", data: { id: 123 }, action: "payment.updated" }
//
// Validação de assinatura (MP v2):
//   header `x-signature: ts=...,v1=...`
//   header `x-request-id: <uuid>`
//   manifest = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
//   v1 = HMAC_SHA256(secret, manifest)  (hex lowercase)
//
// Se MERCADOPAGO_WEBHOOK_SECRET estiver definido, assinatura é OBRIGATÓRIA.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { pickMpCredentialsAsync } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ------- Validação de payload -------

// Aceita data.id como string OU number e normaliza para string
const idCoerce = z.union([z.string().min(1), z.number().int().positive()])
  .transform((v) => String(v));

const WebhookBodySchema = z.object({
  type: z.string().optional(),
  topic: z.string().optional(),
  action: z.string().optional(),
  id: idCoerce.optional(),
  data: z.object({ id: idCoerce.optional() }).optional(),
}).passthrough();

type WebhookBody = z.infer<typeof WebhookBodySchema>;

function extractPaymentId(url: URL, body: WebhookBody | null): string | null {
  const q = url.searchParams;
  const fromQuery = q.get("data.id") ?? q.get("id");
  if (fromQuery && fromQuery.trim().length > 0) return fromQuery;
  if (body?.data?.id) return body.data.id;
  if (body?.id) return body.id;
  return null;
}

function extractType(url: URL, body: WebhookBody | null): string {
  return url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type ?? body?.topic ?? "";
}

// ------- Validação HMAC v2 -------

function parseSignatureHeader(h: string): { ts?: string; v1?: string } {
  const out: Record<string, string> = {};
  for (const part of h.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k && v) out[k] = v;
  }
  return { ts: out.ts, v1: out.v1 };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMpSignature(
  req: Request, url: URL, body: WebhookBody | null, secret: string,
): Promise<{ valid: boolean; reason?: string }> {
  const sigHeader = req.headers.get("x-signature");
  const reqId = req.headers.get("x-request-id");
  if (!sigHeader || !reqId) return { valid: false, reason: "missing_signature_headers" };

  const { ts, v1 } = parseSignatureHeader(sigHeader);
  if (!ts || !v1) return { valid: false, reason: "malformed_signature" };

  const dataId = url.searchParams.get("data.id") ?? body?.data?.id ?? "";
  if (!dataId) return { valid: false, reason: "missing_data_id" };

  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  return timingSafeEqualHex(expected, v1.toLowerCase())
    ? { valid: true }
    : { valid: false, reason: "signature_mismatch" };
}

// ------- Handler -------

export const handleWebhook = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Correlation id: usa o x-request-id do MP quando presente, senão gera um.
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const startedAt = Date.now();

  // Logger estruturado em JSON, sempre incluindo o request_id para correlação.
  const log = (level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) => {
    const entry = {
      ts: new Date().toISOString(),
      level,
      fn: "webhook-mercadopago",
      request_id: requestId,
      event,
      ...fields,
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };

  // Resposta com header X-Request-Id para o cliente correlacionar.
  const reply = (body: Record<string, unknown>, status = 200) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    });
  };

  log("info", "request_received", { method: req.method, path: new URL(req.url).pathname });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mpCreds = await pickMpCredentialsAsync();
  const MP_TOKEN = mpCreds?.accessToken;
  const MP_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    log("error", "config_missing", { reason: "supabase_env" });
    return reply({ error: "Supabase env ausente", request_id: requestId }, 500);
  }
  if (!MP_TOKEN) {
    log("error", "config_missing", { reason: "mp_token" });
    return reply({ error: "MP token ausente", request_id: requestId }, 500);
  }

  const url = new URL(req.url);

  // 1. Parse + validação do payload
  let body: WebhookBody | null = null;
  if (req.method === "POST") {
    let raw = "";
    try { raw = await req.text(); } catch { raw = ""; }
    if (raw.length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        log("warn", "payload_rejected", {
          status: 400, reason: "invalid_json", raw_size: raw.length,
        });
        return reply({ error: "invalid_json", reason: "invalid_json", request_id: requestId }, 400);
      }
      const result = WebhookBodySchema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.flatten();
        log("warn", "payload_rejected", {
          status: 400, reason: "invalid_payload", issues,
        });
        return reply({
          error: "invalid_payload", reason: "invalid_payload",
          details: issues, request_id: requestId,
        }, 400);
      }
      body = result.data;
    }
  }

  // 2. Validação de assinatura (se secret configurado)
  if (MP_WEBHOOK_SECRET) {
    const check = await verifyMpSignature(req, url, body, MP_WEBHOOK_SECRET);
    if (!check.valid) {
      log("warn", "signature_rejected", {
        status: 401, reason: check.reason,
        has_x_signature: req.headers.has("x-signature"),
        has_x_request_id: req.headers.has("x-request-id"),
      });
      return reply({
        error: "invalid_signature", reason: check.reason, request_id: requestId,
      }, 401);
    }
    log("info", "signature_verified");
  }

  const type = extractType(url, body);
  const isPaymentEvent = type.toLowerCase().includes("payment");
  const paymentId = extractPaymentId(url, body);

  // Eventos que não são de pagamento são apenas ignorados (200).
  if (!isPaymentEvent) {
    log("info", "event_ignored", { reason: "not_payment_event", type });
    return reply({ ignored: true, reason: "not_payment_event", type, request_id: requestId });
  }

  // Evento DE pagamento sem data.id é um payload inválido → 400.
  // Evita uma chamada desnecessária à API do Mercado Pago.
  if (!paymentId) {
    log("warn", "payload_rejected", {
      status: 400, reason: "missing_payment_id", type,
      has_query_data_id: url.searchParams.has("data.id"),
      has_query_id: url.searchParams.has("id"),
      has_body_data_id: Boolean(body?.data?.id),
    });
    return reply({
      error: "missing_payment_id",
      reason: "missing_payment_id",
      message: "Evento de pagamento sem data.id",
      request_id: requestId,
    }, 400);
  }

  log("info", "payment_lookup_start", { mp_payment_id: paymentId });

  // 3. Consulta o pagamento na API do MP
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  const mpData = await mpRes.json();
  if (!mpRes.ok) {
    log("error", "mp_fetch_failed", {
      status: 502, mp_status: mpRes.status, mp_payment_id: paymentId, mp_error: mpData,
    });
    return reply({
      error: "Falha ao consultar MP", reason: "mp_fetch_failed",
      details: mpData, request_id: requestId,
    }, 502);
  }

  const externalRef = mpData.external_reference as string | null;
  const status = (mpData.status as string) ?? "pending";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  // 4. Processamento atômico via RPC: idempotência + update + liberar_assinatura
  // executados em uma única transação. Retentativas concorrentes do MP que
  // colidirem no UNIQUE (mp_payment_id, status) recebem duplicate=true e
  // não reaplicam efeitos colaterais (sem crédito duplicado).
  const { data: rpcData, error: rpcErr } = await admin.rpc("process_mp_webhook_event", {
    _mp_payment_id: String(paymentId),
    _status: status,
    _mp_raw: mpData,
    _request_id: requestId,
  });

  if (rpcErr) {
    log("error", "process_event_failed", { db_error: rpcErr, mp_payment_id: paymentId });
    return reply({
      error: "process_event_failed", reason: "process_event_failed",
      details: rpcErr, request_id: requestId,
    }, 500);
  }

  const result = (rpcData ?? {}) as {
    found?: boolean;
    duplicate?: boolean;
    pagamento_id?: string;
    school_id?: string;
    user_id?: string;
    plano?: string;
    status_before?: string;
    released?: boolean;
  };

  if (!result.found) {
    log("warn", "pagamento_not_found", {
      reason: "no_local_record", mp_payment_id: paymentId, external_reference: externalRef,
    });
    return reply({ ignored: true, reason: "no_local_record", request_id: requestId });
  }

  if (result.duplicate) {
    log("info", "event_duplicate_ignored", {
      mp_payment_id: String(paymentId), status, pagamento_id: result.pagamento_id,
      request_id: requestId,
    });
    // Auditoria persistente da duplicata (best-effort)
    await admin.from("payment_integration_logs").insert({
      pagamento_id: result.pagamento_id,
      mp_payment_id: String(paymentId),
      event_type: "webhook_duplicate",
      status_before: status,
      status_after: status,
      payload: {
        duplicate: true,
        webhook_action: body?.action ?? "updated",
        request_id: requestId,
        type,
      },
    });
    return reply({
      received: true, duplicate: true, status,
      pagamento_id: result.pagamento_id, request_id: requestId,
    });
  }

  // Auditoria + log de integração (best-effort, fora da transação crítica)
  await admin.from("audit_logs").insert({
    action: "mp_payment_webhook",
    table_name: "pagamentos",
    record_id: result.pagamento_id,
    new_data: {
      mp_payment_id: String(paymentId),
      status,
      request_id: requestId,
      event_type: type,
      action: body?.action ?? "updated",
    },
  });

  await admin.from("payment_integration_logs").insert({
    pagamento_id: result.pagamento_id,
    mp_payment_id: String(paymentId),
    event_type: "webhook",
    status_before: result.status_before ?? null,
    status_after: status,
    payload: {
      webhook_action: body?.action ?? "updated",
      request_id: requestId,
      mp_data: mpData,
    },
  });

  if (result.released) {
    log("info", "subscription_released", {
      pagamento_id: result.pagamento_id, school_id: result.school_id, plano: result.plano,
    });

    // Notificação best-effort
    try {
      const { data: profile } = await admin
        .from("profiles").select("full_name").eq("user_id", result.user_id).maybeSingle();
      const { data: school } = await admin
        .from("schools").select("name").eq("id", result.school_id).maybeSingle();

      await admin.from("audit_logs").insert({
        action: "mp_payment_approved_notification",
        table_name: "pagamentos",
        record_id: result.pagamento_id,
        new_data: {
          message: `Pagamento aprovado para ${profile?.full_name || "Usuário"} (${school?.name || "Escola"})`,
          plano: result.plano,
        },
      });
      log("info", "payment_notification_sent", { pagamento_id: result.pagamento_id });
    } catch (notifyErr) {
      log("warn", "notification_failed", { error: notifyErr });
    }
  }

  log("info", "request_completed", {
    status: 200, pagamento_id: result.pagamento_id, payment_status: status,
    duration_ms: Date.now() - startedAt,
  });

  return reply({
    received: true, status, pagamento_id: result.pagamento_id, request_id: requestId,
  });
};

Deno.serve(handleWebhook);
