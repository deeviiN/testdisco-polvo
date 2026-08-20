import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentials, validateMpToken } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Require admin caller to prevent anonymous probing and writing to health_checks
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const results = [];
  
  // 1. Check Mercado Pago Sandbox
  const startSandbox = performance.now();
  const credsSandbox = pickMpCredentials("test");
  if (credsSandbox) {
    const check = await validateMpToken(credsSandbox.accessToken, { skipCache: true });
    results.push({
      service: "mercado_pago_sandbox",
      status: check.ok ? "up" : "down",
      duration_ms: Math.round(performance.now() - startSandbox),
      details: { reason: check.reason, account: check.account?.nickname }
    });
  }

  // 2. Check Mercado Pago Prod
  const startProd = performance.now();
  const credsProd = pickMpCredentials("prod");
  if (credsProd && credsProd.mode === "prod") {
    const check = await validateMpToken(credsProd.accessToken, { skipCache: true });
    results.push({
      service: "mercado_pago_prod",
      status: check.ok ? "up" : "down",
      duration_ms: Math.round(performance.now() - startProd),
      details: { reason: check.reason, account: check.account?.nickname }
    });
  }

  // 3. Check Database
  const startDb = performance.now();
  const { error: dbErr } = await admin.from("health_checks").select("id").limit(1);
  results.push({
    service: "database",
    status: dbErr ? "down" : "up",
    duration_ms: Math.round(performance.now() - startDb),
    details: dbErr ? { error: dbErr.message } : {}
  });

  // Save results
  await admin.from("health_checks").insert(results);

  // Optional: Run cleanup
  await admin.rpc("cleanup_old_health_checks");

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
