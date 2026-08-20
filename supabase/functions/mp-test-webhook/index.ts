// Edge Function: mp-test-webhook
// Envia um evento sintético assinado para a função `webhook-mercadopago`
// e devolve o resultado, permitindo verificar a configuração do webhook
// (URL alcançável, MERCADOPAGO_WEBHOOK_SECRET correto, parsing do payload).
//
// Usa um evento type="test" com data.id sintético: a assinatura HMAC v2 é
// validada normalmente; o webhook responde 200 ignored:not_payment_event,
// o que confirma que a assinatura passou.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
    return reply({ ok: false, reason: "missing_env" }, 500);
  }

  // Auth: apenas admin pode disparar
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return reply({ ok: false, reason: "unauthorized" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return reply({ ok: false, reason: "unauthorized" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return reply({ ok: false, reason: "forbidden" }, 403);

  if (!SECRET) {
    return reply({
      ok: false,
      reason: "missing_secret",
      detail: "MERCADOPAGO_WEBHOOK_SECRET não configurado.",
    }, 200);
  }

  // Monta evento sintético + assinatura HMAC v2
  const ts = Math.floor(Date.now() / 1000).toString();
  const requestId = crypto.randomUUID();
  const dataId = `webhook-test-${ts}`;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = await hmacSha256Hex(SECRET, manifest);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-mercadopago?data.id=${encodeURIComponent(dataId)}&type=test`;
  const payload = { type: "test", action: "test.ping", data: { id: dataId } };

  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": requestId,
        "apikey": ANON,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return reply({
      ok: false,
      reason: "network_error",
      detail: e instanceof Error ? e.message : String(e),
      webhook_url: webhookUrl,
    }, 200);
  }

  const elapsed = Date.now() - startedAt;
  const text = await upstream.text();
  let bodyJson: unknown = null;
  try { bodyJson = JSON.parse(text); } catch { bodyJson = text; }

  // Sucesso = HTTP 200 e assinatura aceita (resposta tem ignored:true ou received:true).
  // 401 invalid_signature = secret não confere.
  const upstreamRequestId = upstream.headers.get("x-request-id");
  const ok = upstream.ok && typeof bodyJson === "object" && bodyJson !== null
    && (("ignored" in (bodyJson as Record<string, unknown>)) || ("received" in (bodyJson as Record<string, unknown>)));

  // Audit log
  try {
    await admin.from("audit_logs").insert({
      action: "mp_webhook_test",
      table_name: "webhook",
      new_data: {
        ok,
        http_status: upstream.status,
        upstream_request_id: upstreamRequestId,
        webhook_url: webhookUrl,
        elapsed_ms: elapsed,
        response: bodyJson,
        triggered_by: userData.user.id,
      },
    });
  } catch { /* best-effort */ }

  return reply({
    ok,
    http_status: upstream.status,
    elapsed_ms: elapsed,
    webhook_url: webhookUrl,
    request_id: requestId,
    upstream_request_id: upstreamRequestId,
    signature: { ts, v1_preview: `${v1.slice(0, 12)}…`, manifest },
    response: bodyJson,
    reason: ok ? null : (
      upstream.status === 401 ? "invalid_signature" :
      upstream.status === 400 ? "invalid_payload" :
      `http_${upstream.status}`
    ),
  });
});
