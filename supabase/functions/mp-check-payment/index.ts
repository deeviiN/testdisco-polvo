// Edge Function: mp-check-payment
// Permite que admins consultem qualquer pagamento OU usuários consultem SEUS PRÓPRIOS pagamentos.
// Retorna o status do pagamento e o resumo da escola (necessário para o Subscription.tsx).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentialsAsync, fetchMp } from "../_shared/mpCredentials.ts";

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

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    console.warn("mp-check-payment: Failed to parse body as JSON", e);
    // Tenta pegar de query params se falhar o body
    const url = new URL(req.url);
    body = {
      payment_id: url.searchParams.get("payment_id") || url.searchParams.get("paymentId")
    };
  }
  
  console.log("mp-check-payment: Request params:", JSON.stringify(body));
  
  // Aceita payment_id ou paymentId
  const paymentIdInput = body?.payment_id ?? body?.paymentId;
  if (!paymentIdInput) {
    console.error("mp-check-payment: Missing payment_id in body/query");
    return json({ error: "missing_payment_id", message: "ID do pagamento não fornecido" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  
  // 1. Verifica se o usuário é admin ou o dono do pagamento
  // Buscamos na tabela 'pagamentos' pelo mp_payment_id ou pelo id interno
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(paymentIdInput));
  const filter = isUuid
    ? `mp_payment_id.eq.${paymentIdInput},id.eq.${paymentIdInput}`
    : `mp_payment_id.eq.${paymentIdInput}`;
  const { data: pag, error: pagErr } = await admin
    .from("pagamentos")
    .select("*, schools(id, name, subscription_status, subscription_end_date)")
    .or(filter)
    .maybeSingle();

  if (pagErr) return json({ error: "db_error", details: pagErr }, 500);

  // Se não encontrou o pagamento no banco, mas o usuário for admin, permitimos a consulta direta no MP
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  
  const isAdmin = !!roleRow;

  if (!pag && !isAdmin) {
    return json({ error: "payment_not_found_or_forbidden" }, 404);
  }

  if (pag && pag.user_id !== userId && !isAdmin) {
    return json({ error: "forbidden" }, 403);
  }

  // 2. Consulta o Mercado Pago
  const creds = await pickMpCredentialsAsync();
  if (!creds) return json({ error: "no_credentials" }, 503);

  // O ID para o Mercado Pago é o mp_payment_id. Se não tivermos no banco, usamos o input
  const mpPaymentId = pag?.mp_payment_id ?? paymentIdInput;

  // Cache agressivo: Se o pagamento já está aprovado no nosso banco, não precisamos consultar o MP novamente
  // a menos que seja uma verificação forçada (que pode ser disparada pelo botão "Atualizar agora").
  const isForceCheck = body?.force === true;
  if (pag?.status === "approved" && !isForceCheck) {
    console.log(`mp-check-payment: Payment ${pag.id} already approved in DB, skipping MP fetch.`);
    return json({
      payment: {
        id: pag.mp_payment_id,
        status: "approved",
        amount: pag.valor,
        date_approved: pag.approved_at,
      },
      school: pag.schools
    });
  }

  const mpRes = await fetchMp(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });

  const mpData = await mpRes.json().catch(() => null);

  // 3. Se o pagamento foi aprovado no MP mas ainda não no nosso banco, atualizamos
  if (mpRes.ok && mpData && mpData.status === "approved" && pag && pag.status !== "approved") {
    // Registro de rastreio para verificação manual
    await admin.from("payment_integration_logs").insert({
      pagamento_id: pag.id,
      mp_payment_id: String(mpPaymentId),
      event_type: "manual_check",
      status_before: pag.status,
      status_after: "approved",
      payload: { 
        method: "active_polling",
        mp_data: mpData
      }
    });

    // Atualiza status e libera assinatura
    await admin.from("pagamentos").update({ 
      status: "approved", 
      approved_at: mpData.date_approved || new Date().toISOString() 
    }).eq("id", pag.id);

    await admin.rpc("liberar_assinatura", { _pagamento_id: pag.id });
    
    // Recarrega dados da escola após liberação
    const { data: updatedPag } = await admin
      .from("pagamentos")
      .select("*, schools(id, name, subscription_status, subscription_end_date)")
      .eq("id", pag.id)
      .single();
      
    if (updatedPag) {
      return json({
        payment: {
          id: mpData.id,
          status: mpData.status,
          amount: mpData.transaction_amount,
          currency: mpData.currency_id,
          payment_method_id: mpData.payment_method_id,
          payment_type_id: mpData.payment_type_id,
          date_approved: mpData.date_approved,
          description: mpData.description
        },
        school: updatedPag.schools
      });
    }
  }

  return json({
    payment: mpData ? {
      id: mpData.id,
      status: mpData.status,
      amount: mpData.transaction_amount,
      currency: mpData.currency_id,
      payment_method_id: mpData.payment_method_id,
      payment_type_id: mpData.payment_type_id,
      date_approved: mpData.date_approved,
      description: mpData.description
    } : null,
    school: pag?.schools ?? null
  });
});