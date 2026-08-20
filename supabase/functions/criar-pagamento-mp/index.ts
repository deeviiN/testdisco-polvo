// Edge Function: criar-pagamento-mp
// Cria um pagamento no Mercado Pago (PIX, Boleto) ou um pagamento direto/preference (Cartão).
// Requer usuário autenticado. Retorna dados específicos por método.
// v2026.1 — preço mensal base R$ 199,90 (force redeploy)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentialsAsync, validateMpToken, fetchMp } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Preços com desconto à vista: 1 ano 5%, 2 anos 10%
// Base mensal: R$ 199,90 (contrato 2026.1 - fidelidade 24m)
const PLAN_PRICES: Record<string, number> = {
  mensal: 199.90,
  anual: 2278.86,      // 12 × 199,90 × 0.95
  anual_12: 2278.86,
  anual_24: 4317.84,   // 24 × 199,90 × 0.90
  migracao_anual: 0,        // calculado via RPC get_plan_migration_quote
  quitacao_restante: 0,     // calculado via RPC get_remaining_year_quote (5% off)
};

const PLAN_TITLES: Record<string, string> = {
  mensal: "Assinatura Mensal — Agendamento Escolar",
  anual: "Assinatura Anual (12 Meses) — Agendamento Escolar",
  anual_12: "Assinatura Anual (12 Meses) — Agendamento Escolar",
  anual_24: "Assinatura Bienal (24 Meses) — Agendamento Escolar",
  migracao_anual: "Migração para plano Anual — meses restantes",
  quitacao_restante: "Quitação do restante do contrato (à vista, 5% off)",
};


interface ReqBody {
  plano: string;

  metodo: "pix" | "boleto" | "cartao";
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    identification?: { type: "CPF" | "CNPJ"; number: string };
  };
  token?: string; // Para checkout transparente
  installments?: number;
  payment_method_id?: string;
  issuer_id?: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase().replace(/\s+/g, "");
}

function validate(body: unknown): { ok: true; data: ReqBody } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "Body inválido" };
  const b = body as Partial<ReqBody>;
  if (!b.plano || !PLAN_PRICES[b.plano]) return { ok: false, message: "plano inválido" };
  if (b.metodo !== "pix" && b.metodo !== "boleto" && b.metodo !== "cartao") {
    return { ok: false, message: "metodo inválido" };
  }
  if (!b.payer || typeof b.payer !== "object") {
    return { ok: false, message: "payer obrigatório" };
  }
  const normalizedEmail = normalizeEmail(b.payer.email);
  if (!normalizedEmail || normalizedEmail.length > 254 || !EMAIL_REGEX.test(normalizedEmail)) {
    return { ok: false, message: "Digite um email válido para continuar." };
  }
  // Reescreve com email normalizado para uso posterior
  b.payer.email = normalizedEmail;
  return { ok: true, data: b as ReqBody };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) return jsonResponse({ error: "Supabase env ausente" }, 500);

  const creds = await pickMpCredentialsAsync();
  if (!creds) {
    return jsonResponse({
      error: "payments_unavailable",
      reason: "missing_token",
      message: "Mercado Pago não está configurado. Contate o administrador.",
    }, 503);
  }
  const credCheck = await validateMpToken(creds.accessToken);
  if (!credCheck.ok) {
    return jsonResponse({
      error: "payments_unavailable",
      reason: credCheck.reason ?? "invalid_token",
      message: "Credenciais do Mercado Pago inválidas. Contate o administrador.",
    }, 503);
  }
  console.log(`[criar-pagamento-mp] Active MP credentials mode=${creds.mode} account=${JSON.stringify(credCheck.account ?? null)}`);
  const MP_TOKEN = creds.accessToken;

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: "Não autenticado" }, 401);
  const userId = userData.user.id;

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }
  const _tokPresent = !!Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  console.log("TOKEN:", _tokPresent ? "***" : "(missing)");
  // Body logado sem expor possíveis tokens/segredos
  const _safeBody = (() => {
    try {
      const clone: any = JSON.parse(JSON.stringify(bodyJson ?? {}));
      if (clone && typeof clone === "object") {
        if ("token" in clone) clone.token = "***";
        if (clone.payer?.identification?.number) clone.payer.identification.number = "***";
      }
      return clone;
    } catch { return "(unserializable)"; }
  })();
  console.log("BODY:", JSON.stringify(_safeBody));
  const v = validate(bodyJson);
  if (!v.ok) return jsonResponse({ error: v.message }, 400);
  const { plano, metodo, payer, token, installments, payment_method_id, issuer_id } = v.data;
  console.log(`[criar-pagamento-mp] payer.email validado=${payer.email} plano=${plano} metodo=${metodo} userId=${userId}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id, full_name").eq("user_id", userId).maybeSingle();
  if (!profile?.school_id) return jsonResponse({ error: "Perfil/escola não encontrados" }, 400);

  const { data: school } = await admin.from("schools").select("name, address, city, state").eq("id", profile.school_id).maybeSingle();

  let valor = PLAN_PRICES[plano];

  // Plano de migração: meses restantes × R$199,90 (sem desconto)
  if (plano === "migracao_anual") {
    const { data: quoteData, error: quoteErr } = await userClient.rpc("get_plan_migration_quote", {
      _school_id: profile.school_id,
    });
    const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
    if (quoteErr || !quote || !quote.valor_total || Number(quote.valor_total) <= 0) {
      return jsonResponse({ error: "Sem meses restantes para migrar (ciclo já quitado)." }, 400);
    }
    valor = Number(quote.valor_total);
    console.log(`[criar-pagamento-mp] migracao_anual school=${profile.school_id} meses_pagos=${quote.meses_pagos} meses_restantes=${quote.meses_restantes} valor=${valor}`);
  }

  // Quitação do restante do contrato à vista (com 5% off)
  if (plano === "quitacao_restante") {
    const { data: quoteData, error: quoteErr } = await userClient.rpc("get_remaining_year_quote", {
      _school_id: profile.school_id,
    });
    const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
    if (quoteErr || !quote || !quote.valor_total || Number(quote.valor_total) <= 0) {
      return jsonResponse({ error: "Ciclo já quitado — não há meses restantes." }, 400);
    }
    valor = Number(quote.valor_total);
    console.log(`[criar-pagamento-mp] quitacao_restante school=${profile.school_id} meses_restantes=${quote.meses_restantes} valor=${valor}`);
  }
  const externalRef = crypto.randomUUID();

  const { data: pagInsert, error: pagErr } = await admin
    .from("pagamentos")
    .insert({
      user_id: userId,
      school_id: profile.school_id,
      plano,
      valor,
      metodo,
      status: "pending",
      mp_external_reference: externalRef,
    })
    .select()
    .single();
  if (pagErr || !pagInsert) return jsonResponse({ error: "Falha ao registrar pagamento" }, 500);
  const pagamentoId = pagInsert.id;

  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-mercadopago`;
  const originHeader = req.headers.get("origin") ?? "";
  const refererHeader = req.headers.get("referer") ?? "";
  let appOrigin = "https://create-your-app-66.lovable.app";
  try {
    if (originHeader?.startsWith("https://")) appOrigin = new URL(originHeader).origin;
    else if (refererHeader?.startsWith("https://")) appOrigin = new URL(refererHeader).origin;
  } catch { /* ignore */ }

  try {
    if (metodo === "pix" || metodo === "boleto" || (metodo === "cartao" && (token || payment_method_id))) {
      const ALLOWED_BOLETO_PMS = new Set(["bolbradesco", "pec"]);
      const boletoPm = payment_method_id && ALLOWED_BOLETO_PMS.has(payment_method_id) ? payment_method_id : "bolbradesco";
      const pmId = metodo === "cartao" ? payment_method_id : (metodo === "pix" ? "pix" : boletoPm);
      const expirationMs = metodo === "pix"
        ? 30 * 60 * 1000
        : (plano === "quitacao_restante" ? 7 * 24 * 60 * 60 * 1000 : 3 * 24 * 60 * 60 * 1000);
      const date_of_expiration = new Date(Date.now() + expirationMs).toISOString();

      const firstName = payer.first_name || profile.full_name?.split(" ")[0] || "Gestor";
      const lastName = payer.last_name || profile.full_name?.split(" ").slice(1).join(" ") || "Escolar";

      const mpBody: any = {
        transaction_amount: valor,
        description: PLAN_TITLES[plano].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/—/g, "-"),
        payment_method_id: pmId,
        external_reference: externalRef,
        notification_url: webhookUrl,
        statement_descriptor: "AGENDAMENTO ESC",
        binary_mode: false,
        payer: {
          email: payer.email,
          first_name: firstName,
          last_name: lastName,
        },
      };

      if (metodo !== "cartao") {
        mpBody.date_of_expiration = date_of_expiration;
      } else {
        mpBody.token = token;
        mpBody.installments = installments || 1;
        if (issuer_id) mpBody.issuer_id = issuer_id;
      }

      if (payer.identification?.type && payer.identification?.number) {
        mpBody.payer.identification = payer.identification;
      }

      if (metodo === "pix" && !mpBody.payer.identification) {
        mpBody.payer.identification = { type: "CPF", number: "19119119100" };
      }

      // Mercado Pago exige endereço completo do pagador para boleto registrado
      if (metodo === "boleto") {
        const ufMap: Record<string, string> = {
          "Acre":"AC","Alagoas":"AL","Amapá":"AP","Amazonas":"AM","Bahia":"BA","Ceará":"CE",
          "Distrito Federal":"DF","Espírito Santo":"ES","Goiás":"GO","Maranhão":"MA","Mato Grosso":"MT",
          "Mato Grosso do Sul":"MS","Minas Gerais":"MG","Pará":"PA","Paraíba":"PB","Paraná":"PR",
          "Pernambuco":"PE","Piauí":"PI","Rio de Janeiro":"RJ","Rio Grande do Norte":"RN",
          "Rio Grande do Sul":"RS","Rondônia":"RO","Roraima":"RR","Santa Catarina":"SC",
          "São Paulo":"SP","Sergipe":"SE","Tocantins":"TO",
        };
        const rawState = (school?.state || "RR").trim();
        const federal_unit = rawState.length === 2 ? rawState.toUpperCase() : (ufMap[rawState] || "RR");
        const street = (school?.address || "Endereço da escola").replace(/,.*$/, "").trim() || "Centro";
        mpBody.payer.address = {
          zip_code: "69301000",
          street_name: street,
          street_number: "S/N",
          neighborhood: "Centro",
          city: school?.city || "Boa Vista",
          federal_unit,
        };
        if (!mpBody.payer.identification) {
          // CPF placeholder válido apenas evita o 7521; ideal é o frontend enviar
          mpBody.payer.identification = { type: "CPF", number: "19119119100" };
        }
        mpBody.payer.first_name = mpBody.payer.first_name || "Gestor";
        mpBody.payer.last_name = mpBody.payer.last_name || "Escolar";
      }

      console.log(`[criar-pagamento-mp] Requesting /v1/payments:`, JSON.stringify(mpBody));

      const mpRes = await fetchMp("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MP_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": externalRef,
        },
        body: JSON.stringify(mpBody),
      });

      const mpRawText = await mpRes.text();
      let mpData: any = {};
      try { mpData = mpRawText ? JSON.parse(mpRawText) : {}; } catch { mpData = { _raw: mpRawText }; }
      const mpHeaders: Record<string, string> = {};
      mpRes.headers.forEach((v, k) => { mpHeaders[k] = v; });
      console.log(`[criar-pagamento-mp] MP response status=${mpRes.status} ok=${mpRes.ok} mode=${creds.mode} tokenPrefix=${MP_TOKEN.slice(0,10)} bodyLen=${mpRawText.length} headers=${JSON.stringify(mpHeaders)} body=${mpRawText.slice(0,800)}`);

      if (!mpRes.ok || !mpData?.id) {
        console.error("MP error", { status: mpRes.status, mpData });
        await admin.from("pagamentos").update({ status: "rejected", mp_raw: mpData }).eq("id", pagamentoId);
        return jsonResponse({ error: "Falha ao criar pagamento no Mercado Pago", status: mpRes.status, details: mpData }, 502);
      }

      const tx = mpData.point_of_interaction?.transaction_data ?? {};
      await admin
        .from("pagamentos")
        .update({
          mp_payment_id: String(mpData.id),
          status: mpData.status ?? "pending",
          qr_code: tx.qr_code ?? null,
          qr_code_base64: tx.qr_code_base64 ?? null,
          ticket_url: tx.ticket_url ?? mpData.transaction_details?.external_resource_url ?? null,
          expires_at: mpData.date_of_expiration || date_of_expiration,
          mp_raw: mpData,
        })
        .eq("id", pagamentoId);

      return jsonResponse({
        pagamento_id: pagamentoId,
        mp_payment_id: String(mpData.id),
        status: mpData.status,
        qr_code: tx.qr_code,
        qr_code_base64: tx.qr_code_base64,
        ticket_url: tx.ticket_url ?? mpData.transaction_details?.external_resource_url,
        barcode: mpData.barcode?.content ?? null,
      });
    }

    // Checkout Pro fallback
    const firstName = payer.first_name || profile.full_name?.split(" ")[0] || "Gestor";
    const lastName = payer.last_name || profile.full_name?.split(" ").slice(1).join(" ") || "Escolar";

    const prefBody: any = {
      items: [{ title: PLAN_TITLES[plano], quantity: 1, currency_id: "BRL", unit_price: valor }],
      external_reference: externalRef,
      notification_url: webhookUrl,
      payer: { 
        email: payer.email,
        name: firstName,
        surname: lastName,
        identification: payer.identification?.type && payer.identification?.number ? payer.identification : undefined,
      },
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
        installments: 12,
      },
      back_urls: {
        success: `${appOrigin}/subscription?mp=success`,
        pending: `${appOrigin}/subscription?mp=pending`,
        failure: `${appOrigin}/subscription?mp=failure`,
      },
    };

    const prefRes = await fetchMp("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(prefBody),
    });
    
    const prefData = await prefRes.json().catch(() => ({}));
    if (!prefRes.ok) {
      await admin.from("pagamentos").update({ status: "rejected", mp_raw: prefData }).eq("id", pagamentoId);
      return jsonResponse({ error: "Falha ao criar preference", details: prefData }, 502);
    }

    await admin.from("pagamentos").update({ mp_preference_id: prefData.id, init_point: prefData.init_point, mp_raw: prefData }).eq("id", pagamentoId);

    return jsonResponse({
      pagamento_id: pagamentoId,
      mp_preference_id: prefData.id,
      init_point: prefData.init_point,
      sandbox_init_point: prefData.sandbox_init_point,
    });
  } catch (e) {
    return jsonResponse({ error: "Erro inesperado", details: String(e) }, 500);
  }
});