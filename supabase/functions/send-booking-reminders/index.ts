// Edge function agendada (cron 1/min) que envia push aos donos de agendamentos
// quando faltam 60/45/30/15/10/5 minutos para o início. Deduplica via
// public.booking_reminders_sent (channel='push').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const RAW_VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const VAPID_SUBJECT = /^(mailto:|https?:\/\/)/i.test(RAW_VAPID_SUBJECT)
  ? RAW_VAPID_SUBJECT
  : `mailto:${RAW_VAPID_SUBJECT}`;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const THRESHOLDS = [60, 45, 30, 15, 10, 5];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Janela: próximos 65 min
  const nowIso = new Date().toISOString();
  const inFuture = new Date(Date.now() + 65 * 60 * 1000).toISOString();

  // Busca bookings ativos
  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id,user_id,school_id,sector,topic,booking_date,start_time,status,gestor_status")
    .gte("booking_date", new Date().toISOString().slice(0, 10))
    .in("status", ["confirmed", "approved", "active"]);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const now = Date.now();
  let sent = 0;
  let skipped = 0;

  for (const b of bookings ?? []) {
    if (b.gestor_status && !["approved", "auto_approved"].includes(b.gestor_status)) continue;
    const startMs = new Date(`${b.booking_date}T${b.start_time}`).getTime();
    const minsLeft = (startMs - now) / 60000;
    if (minsLeft <= 0 || minsLeft > 65) continue;

    const threshold = THRESHOLDS.find((m) => Math.abs(minsLeft - m) <= 1.5);
    if (!threshold) {
      skipped++;
      continue;
    }

    // Já enviado?
    const { data: existing } = await admin
      .from("booking_reminders_sent")
      .select("id")
      .eq("booking_id", b.id)
      .eq("user_id", b.user_id)
      .eq("minutes_before", threshold)
      .eq("channel", "push")
      .maybeSingle();
    if (existing) continue;

    // Marca antes (evita corrida) — UNIQUE garante idempotência
    const { error: insErr } = await admin.from("booking_reminders_sent").insert({
      booking_id: b.id,
      user_id: b.user_id,
      minutes_before: threshold,
      channel: "push",
    });
    if (insErr) continue;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", b.user_id);
    if (!subs || subs.length === 0) continue;

    const title =
      threshold >= 60
        ? "Falta 1 hora para seu agendamento"
        : `Faltam ${threshold} minutos para seu agendamento`;
    const body =
      `${b.topic ?? "Agendamento"}${b.sector ? " • " + b.sector : ""}. ` +
      "Não esqueça de escanear o QR Code do ambiente para registrar seu check-in.";

    const payload = JSON.stringify({
      title,
      body,
      url: "/qr-scan",
      tag: `booking-${b.id}-${threshold}`,
      requireInteraction: true,
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent++;
        } catch (err: any) {
          const sc = err?.statusCode;
          if (sc === 404 || sc === 410) {
            await admin.rpc("cleanup_push_subscription", { _endpoint: s.endpoint });
          }
        }
      }),
    );
  }

  return new Response(JSON.stringify({ sent, skipped, checked: bookings?.length ?? 0, at: nowIso }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
