// Edge Function: mp-credentials-check
// Admin-only. Performs a fresh GET https://api.mercadopago.com/users/me using the
// requested mode (test|prod), returns the validation outcome, and writes an audit log.
// Never logs or returns the token itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentials, validateMpToken, maskToken } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "forbidden" }, 403);

  let mode: "test" | "prod" | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "test" || body?.mode === "prod") mode = body.mode;
  } catch { /* ignore */ }

  const creds = pickMpCredentials(mode);
  if (!creds) {
    await admin.from("audit_logs").insert({
      action: "mp_credentials_check",
      table_name: "secrets",
      new_data: { mode: mode ?? "auto", ok: false, reason: "missing_token" },
      performed_by: userData.user.id,
    });
    return json({ ok: false, reason: "missing_token", mode: mode ?? null }, 200);
  }

  const result = await validateMpToken(creds.accessToken, { skipCache: true });

  await admin.from("audit_logs").insert({
    action: "mp_credentials_check",
    table_name: "secrets",
    new_data: {
      mode: creds.mode,
      ok: result.ok,
      reason: result.reason ?? null,
      token_masked: maskToken(creds.accessToken),
      account_site: result.account?.site_id ?? null,
      account_nickname: result.account?.nickname ?? null,
    },
    performed_by: userData.user.id,
  });

  return json({
    ok: result.ok,
    mode: creds.mode,
    reason: result.reason ?? null,
    account: result.ok ? result.account : null,
  });
});
