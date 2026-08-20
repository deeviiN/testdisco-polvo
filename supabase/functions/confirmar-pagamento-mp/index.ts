import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentialsAsync, fetchMp } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) return jsonResponse({ error: "Supabase env ausente" }, 500);

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: "Não autenticado" }, 401);
  const userId = userData.user.id;

  let body: { pagamento_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const { pagamento_id } = body;
  if (!pagamento_id) return jsonResponse({ error: "pagamento_id obrigatório" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Busca o pagamento e valida dono
  const { data: pag, error: pagErr } = await admin
    .from("pagamentos")
    .select("*")
    .eq("id", pagamento_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (pagErr) return jsonResponse({ error: "Erro ao buscar pagamento", details: pagErr }, 500);
  if (!pag) return jsonResponse({ error: "Pagamento não encontrado ou acesso negado" }, 404);

  // Se já estiver aprovado, apenas retorna
  if (pag.status === "approved") {
    return jsonResponse({ 
      status: pag.status, 
      approved: true, 
      already_approved: true 
    });
  }

  if (!pag.mp_payment_id) {
    return jsonResponse({ error: "Pagamento sem ID do Mercado Pago vinculado" }, 400);
  }

  // 2. Busca credenciais e consulta status no MP
  const creds = await pickMpCredentialsAsync();
  if (!creds) return jsonResponse({ error: "Configuração do Mercado Pago ausente" }, 503);

  const mpRes = await fetchMp(`https://api.mercadopago.com/v1/payments/${pag.mp_payment_id}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });

  if (!mpRes.ok) {
    const errorData = await mpRes.json();
    console.error("Erro ao consultar MP", errorData);
    return jsonResponse({ error: "Falha ao consultar Mercado Pago", details: errorData }, 502);
  }

  const mpData = await mpRes.json();
  const status = mpData.status as string;

  // 3. Atualiza se houve mudança ou se for aprovado
  const updateData: any = {
    status,
    mp_raw: mpData,
    updated_at: new Date().toISOString(),
  };

  if (status === "approved" && !pag.approved_at) {
    updateData.approved_at = new Date().toISOString();
  }

  const { error: updErr } = await admin
    .from("pagamentos")
    .update(updateData)
    .eq("id", pagamento_id);

  if (updErr) console.error("Erro ao atualizar pagamento", updErr);

  // 4. Libera assinatura se aprovado
  let released = false;
  if (status === "approved") {
    const { error: relErr } = await admin.rpc("liberar_assinatura", { _pagamento_id: pagamento_id });
    if (relErr) {
      console.error("Erro ao liberar assinatura via confirmação manual", relErr);
    } else {
      released = true;
    }
  }

  // Auditoria
  await admin.from("audit_logs").insert({
    action: "mp_payment_manual_confirm",
    table_name: "pagamentos",
    record_id: pagamento_id,
    new_data: { status, released, mp_payment_id: pag.mp_payment_id },
    performed_by: userId,
  });

  return jsonResponse({
    status,
    approved: status === "approved",
    released,
    pagamento_id
  });
});
