// Edge Function: mp-test-pix
// Admin-only utility. Cria um pagamento PIX de R$ 0,01 no Mercado Pago usando
// as credenciais ativas (respeitando a flag mp_settings.force_test_mode) para
// validar end-to-end o checkout PIX. Não persiste nada na tabela pagamentos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentialsAsync, validateMpToken, maskToken, fetchMp } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Admin-only
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ error: "forbidden" }, 403);

  // Pick creds (respects force_test_mode)
  const creds = await pickMpCredentialsAsync();
  if (!creds) return json({ error: "no_credentials" }, 503);
  const probe = await validateMpToken(creds.accessToken, { skipCache: true });
  if (!probe.ok) {
    return json({
      error: "invalid_credentials",
      mode: creds.mode,
      reason: probe.reason,
      token: maskToken(creds.accessToken),
    }, 503);
  }

  // Optional flag from request body
  let includeBase64 = false;
  try {
    const reqBody = await req.json().catch(() => ({}));
    includeBase64 = reqBody?.include_base64 === true;
  } catch { /* ignore */ }

  // Build PIX payment payload
  const idempotencyKey = crypto.randomUUID();
  // Email montado em runtime para evitar ofuscação de e-mail por proxies (CF email obfuscation)
  const payerEmail = ["pagador", "teste"].join(".") + "@" + ["gmail", "com"].join(".");
  const body = {
    transaction_amount: 0.01,
    description: "Teste PIX (sandbox) — Agendamento Escolar",
    payment_method_id: "pix",
    payer: {
      email: payerEmail,
      first_name: "Test",
      last_name: "User",
      identification: { type: "CPF", number: "19119119100" },
    },
  };

  let mpRes: Response;
  try {
    mpRes = await fetchMp("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    const isAbort = e?.name === "AbortError";
    console.error("[mp-test-pix] fetch failed:", e?.message ?? e);
    return json({
      ok: false,
      mode: creds.mode,
      token: maskToken(creds.accessToken),
      error: isAbort ? "mp_timeout" : "mp_network_error",
      reason: isAbort
        ? "A API do Mercado Pago não respondeu em tempo hábil (timeout)."
        : `Falha de rede ao chamar Mercado Pago: ${e?.message ?? "erro desconhecido"}`,
    }, 502);
  }

  const text = await mpRes.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* keep raw */ }

  if (!mpRes.ok) {
    console.error("[mp-test-pix] MP error", mpRes.status, text.slice(0, 800));
  }

  return json({
    mode: creds.mode,
    token: maskToken(creds.accessToken),
    http_status: mpRes.status,
    ok: mpRes.ok,
    reason: mpRes.ok ? undefined : (data?.message ?? data?.error ?? `mp_status_${mpRes.status}`),
    payment: data
      ? {
          id: data.id,
          status: data.status,
          status_detail: data.status_detail,
          qr_code: data?.point_of_interaction?.transaction_data?.qr_code ?? null,
          qr_code_base64_present: !!data?.point_of_interaction?.transaction_data?.qr_code_base64,
          ticket_url: data?.point_of_interaction?.transaction_data?.ticket_url ?? null,
          date_of_expiration: data?.date_of_expiration ?? null,
        }
      : null,
    qr_code_base64: includeBase64
      ? (data?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null)
      : undefined,
    error_raw: mpRes.ok ? null : (data ?? text),
  });
});
