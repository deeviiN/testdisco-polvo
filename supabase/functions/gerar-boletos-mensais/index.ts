// Edge Function: gerar-boletos-mensais
// Roda diariamente via cron. A partir do dia 28 (ou antes do dia 5), gera para cada escola
// ativa que ainda não tem o boleto do próximo ciclo:
//   - 1 boleto Mercado Pago (bolbradesco) com vencimento no dia 5
//   - 1 cobrança PIX paralela (mesmo cycle_month) para liberação imediata
// Idempotente via UNIQUE (school_id, cycle_month, metodo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickMpCredentialsAsync, fetchMp } from "../_shared/mpCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MENSAL_VALOR = 199.90;
const PLAN_TITLE = "Mensalidade — Agendamento Escolar (vencimento dia 5)";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "env" }, 500);

  const creds = await pickMpCredentialsAsync();
  if (!creds) return json({ error: "mp_not_configured" }, 503);
  const MP_TOKEN = creds.accessToken;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Lista escolas que precisam de boleto do próximo dia 5
  const { data: targets, error: listErr } = await admin.rpc("list_schools_needing_monthly_boleto");
  if (listErr) {
    console.error("[gerar-boletos-mensais] list err", listErr);
    return json({ error: "list_failed", details: listErr.message }, 500);
  }
  if (!targets || targets.length === 0) return json({ ok: true, generated: 0 });

  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-mercadopago`;
  let generated = 0;
  const errors: any[] = [];

  for (const t of (targets as any[])) {
    try {
      const { data: school } = await admin
        .from("schools")
        .select("name, address, city, state")
        .eq("id", t.school_id)
        .maybeSingle();
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", t.gestor_user_id)
        .maybeSingle();
      const email = profile?.email || `gestor+${t.school_id}@agendamento.local`;
      const [first, ...rest] = (profile?.full_name || "Gestor Escolar").split(" ");
      const last = rest.join(" ") || "Escola";

      // BOLETO
      const externalBoleto = crypto.randomUUID();
      const { data: pagBol } = await admin.from("pagamentos").insert({
        user_id: t.gestor_user_id,
        school_id: t.school_id,
        plano: "mensal",
        valor: MENSAL_VALOR,
        metodo: "boleto",
        status: "pending",
        mp_external_reference: externalBoleto,
        due_date: t.due_date,
        cycle_month: t.cycle_month,
        auto_generated: true,
      }).select().single();

      const ufMap: Record<string, string> = {
        "Roraima":"RR","Rio de Janeiro":"RJ","São Paulo":"SP","Minas Gerais":"MG",
      };
      const rawState = (school?.state || "RR").trim();
      const federal_unit = rawState.length === 2 ? rawState.toUpperCase() : (ufMap[rawState] || "RR");

      const boletoBody = {
        transaction_amount: MENSAL_VALOR,
        description: PLAN_TITLE.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/—/g, "-"),
        payment_method_id: "bolbradesco",
        external_reference: externalBoleto,
        notification_url: webhookUrl,
        date_of_expiration: new Date(`${t.due_date}T23:59:00-04:00`).toISOString(),
        payer: {
          email, first_name: first, last_name: last,
          identification: { type: "CPF", number: "19119119100" },
          address: {
            zip_code: "69301000",
            street_name: (school?.address || "Centro").replace(/,.*$/, ""),
            street_number: "S/N",
            neighborhood: "Centro",
            city: school?.city || "Boa Vista",
            federal_unit,
          },
        },
      };

      const bolRes = await fetchMp("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": externalBoleto },
        body: JSON.stringify(boletoBody),
      });
      const bolData = await bolRes.json().catch(() => ({}));
      if (bolRes.ok && bolData?.id) {
        const tx = bolData.point_of_interaction?.transaction_data ?? {};
        await admin.from("pagamentos").update({
          mp_payment_id: String(bolData.id),
          status: bolData.status ?? "pending",
          ticket_url: tx.ticket_url ?? bolData.transaction_details?.external_resource_url ?? null,
          expires_at: bolData.date_of_expiration,
          mp_raw: bolData,
        }).eq("id", pagBol!.id);
      } else {
        await admin.from("pagamentos").update({ status: "rejected", mp_raw: bolData }).eq("id", pagBol!.id);
      }

      // PIX paralelo (mesmo cycle_month) — liberação imediata
      const externalPix = crypto.randomUUID();
      const { data: pagPix } = await admin.from("pagamentos").insert({
        user_id: t.gestor_user_id,
        school_id: t.school_id,
        plano: "mensal",
        valor: MENSAL_VALOR,
        metodo: "pix",
        status: "pending",
        mp_external_reference: externalPix,
        due_date: t.due_date,
        cycle_month: t.cycle_month,
        auto_generated: true,
      }).select().single();

      const pixBody = {
        transaction_amount: MENSAL_VALOR,
        description: PLAN_TITLE.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/—/g, "-"),
        payment_method_id: "pix",
        external_reference: externalPix,
        notification_url: webhookUrl,
        date_of_expiration: new Date(`${t.due_date}T23:59:00-04:00`).toISOString(),
        payer: { email, first_name: first, last_name: last, identification: { type: "CPF", number: "19119119100" } },
      };
      const pixRes = await fetchMp("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": externalPix },
        body: JSON.stringify(pixBody),
      });
      const pixData = await pixRes.json().catch(() => ({}));
      if (pixRes.ok && pixData?.id) {
        const tx = pixData.point_of_interaction?.transaction_data ?? {};
        await admin.from("pagamentos").update({
          mp_payment_id: String(pixData.id),
          status: pixData.status ?? "pending",
          qr_code: tx.qr_code ?? null,
          qr_code_base64: tx.qr_code_base64 ?? null,
          ticket_url: tx.ticket_url ?? null,
          expires_at: pixData.date_of_expiration,
          mp_raw: pixData,
        }).eq("id", pagPix!.id);
      } else {
        await admin.from("pagamentos").update({ status: "rejected", mp_raw: pixData }).eq("id", pagPix!.id);
      }

      generated++;
    } catch (e) {
      console.error("[gerar-boletos-mensais] school err", t.school_id, e);
      errors.push({ school_id: t.school_id, error: String(e) });
    }
  }

  return json({ ok: true, generated, errors });
});
