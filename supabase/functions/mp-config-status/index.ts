// Edge Function: mp-config-status
// Admin-only. Reports which Mercado Pago secrets are present (without exposing values),
// the webhook URL, and the last cached validation status. Never returns tokens.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentials, maskToken, validateMpToken } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // AuthN — opcional. Se houver sessão e for admin, devolve payload completo.
  // Caso contrário (anônimo ou usuário comum) devolve apenas a chave pública,
  // que é segura para expor e necessária para inicializar o checkout.
  const authHeader = req.headers.get("authorization") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let isAdmin = false;
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        isAdmin = !!roleRow;
      }
    } catch { /* ignore — segue como anônimo */ }
  }

  const genericTokenEarly = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? null;
  const genericPubEarly = Deno.env.get("MERCADO_PAGO_PUBLIC_KEY") ?? null;
  const genericIsTestEarly = genericTokenEarly?.trim().startsWith("TEST-") || genericPubEarly?.trim().startsWith("TEST-");
  const genericIsProdEarly = genericTokenEarly?.trim().startsWith("APP_USR-") || genericPubEarly?.trim().startsWith("APP_USR-");
  const prodPubEarly = (genericIsProdEarly ? genericPubEarly : null) ?? Deno.env.get("MERCADOPAGO_PUBLIC_KEY_PROD") ?? null;
  const testPubEarly = (genericIsTestEarly ? genericPubEarly : null) ?? Deno.env.get("MERCADOPAGO_PUBLIC_KEY_TEST") ?? null;

  if (!isAdmin) {
    let forceTest = false;
    try {
      const { data } = await admin.rpc("get_mp_force_test_mode");
      forceTest = data === true;
    } catch { /* ignore */ }
    const active = forceTest
      ? (pickMpCredentials("test") ?? pickMpCredentials())
      : pickMpCredentials();
    return json({
      secrets: {
        MERCADOPAGO_ACCESS_TOKEN_PROD: { present: false },
        MERCADOPAGO_ACCESS_TOKEN_TEST: { present: false },
        MERCADOPAGO_PUBLIC_KEY_PROD: { present: !!prodPubEarly, value: prodPubEarly },
        MERCADOPAGO_PUBLIC_KEY_TEST: { present: !!testPubEarly, value: testPubEarly },
        MERCADOPAGO_WEBHOOK_SECRET: { present: false, length: 0 },
      },
      active_mode: active?.mode ?? null,
      active_status: null,
      webhook_url: "",
      payments_enabled: !!active,
      force_test_mode: forceTest,
    });
  }

  const genericToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? null;
  const genericPub = Deno.env.get("MERCADO_PAGO_PUBLIC_KEY") ?? null;
  const genericIsTest = genericToken?.trim().startsWith("TEST-") || genericPub?.trim().startsWith("TEST-");
  const genericIsProd = genericToken?.trim().startsWith("APP_USR-") || genericPub?.trim().startsWith("APP_USR-");
  const prodToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN_PROD") ?? Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? (genericIsProd ? genericToken : null) ?? null;
  const testToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN_TEST") ?? (genericIsTest ? genericToken : null) ?? null;
  const prodPub = Deno.env.get("MERCADOPAGO_PUBLIC_KEY_PROD") ?? (genericIsProd ? genericPub : null) ?? null;
  const testPub = Deno.env.get("MERCADOPAGO_PUBLIC_KEY_TEST") ?? (genericIsTest ? genericPub : null) ?? null;
  const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") ?? Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET") ?? null;

  // Read force_test_mode flag
  let forceTestMode = false;
  try {
    const { data } = await admin.rpc("get_mp_force_test_mode");
    forceTestMode = data === true;
  } catch { /* default false */ }

  const active = forceTestMode
    ? (pickMpCredentials("test") ?? pickMpCredentials())
    : pickMpCredentials();

  // Quick (cached) probe of active token to feed UI status without forcing a remote call
  let activeProbe = null as null | { ok: boolean; reason?: string; cached?: boolean };
  if (active) {
    const r = await validateMpToken(active.accessToken);
    activeProbe = { ok: r.ok, reason: r.reason, cached: r.cached };
  }

  return json({
    secrets: {
      MERCADOPAGO_ACCESS_TOKEN_PROD: { present: !!prodToken, masked: maskToken(prodToken) },
      MERCADOPAGO_ACCESS_TOKEN_TEST: { present: !!testToken, masked: maskToken(testToken) },
      MERCADOPAGO_PUBLIC_KEY_PROD: { present: !!prodPub, value: prodPub },
      MERCADOPAGO_PUBLIC_KEY_TEST: { present: !!testPub, value: testPub },
      MERCADOPAGO_WEBHOOK_SECRET: {
        present: !!webhookSecret,
        length: webhookSecret ? webhookSecret.length : 0,
      },
    },
    active_mode: active?.mode ?? null,
    active_status: activeProbe,
    webhook_url: `${SUPABASE_URL}/functions/v1/webhook-mercadopago`,
    payments_enabled: !!active && !!activeProbe?.ok,
    force_test_mode: forceTestMode,
  });
});
