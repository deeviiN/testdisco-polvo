// Notifica por push APENAS os profissionais aprovados da MESMA escola
// do agendamento recém-criado. Escola é resolvida no servidor a partir
// do perfil de quem chamou, então nunca vaza para outra escola.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";
import { deliverPush } from "../_shared/delivery.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const RAW_VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const VAPID_SUBJECT = /^(mailto:|https?:\/\/)/i.test(RAW_VAPID_SUBJECT)
  ? RAW_VAPID_SUBJECT
  : `mailto:${RAW_VAPID_SUBJECT}`;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({} as any));
    const sector = String(body?.sector ?? "").slice(0, 80);
    const bookingDate = String(body?.booking_date ?? "").slice(0, 10);
    const startTime = String(body?.start_time ?? "").slice(0, 8);
    const count = Number(body?.count ?? 1);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: me } = await admin
      .from("profiles")
      .select("school_id, full_name")
      .eq("user_id", callerId)
      .maybeSingle();

    if (!me?.school_id) return json({ error: "sem escola vinculada" }, 400);

    // Destinatários: somente esta escola
    const { data: profs } = await admin
      .from("profiles")
      .select("user_id")
      .eq("school_id", me.school_id)
      .eq("status", "approved");

    const userIds = (profs ?? []).map((p: any) => p.user_id).filter((id: string) => id !== callerId);
    if (userIds.length === 0) return json({ sent: 0, failed: 0, removed: 0, results: [] });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", userIds);

    if (!subs || subs.length === 0) return json({ sent: 0, failed: 0, removed: 0, results: [] });

    const when = bookingDate ? bookingDate.split("-").reverse().join("/") : "";
    const title = count > 1 ? `📅 ${count} novos agendamentos` : "📅 Novo agendamento";
    const message = [
      me.full_name ? `${me.full_name} agendou` : "Novo agendamento",
      sector ? `${sector}` : null,
      when ? `em ${when}` : null,
      startTime ? `às ${startTime.slice(0, 5)}` : null,
    ].filter(Boolean).join(" · ");

    const payload = JSON.stringify({
      title,
      body: message,
      url: "/today-bookings",
      tag: `booking-${me.school_id}-${Date.now()}`,
    });

    const summary = await deliverPush(subs as any, payload, {
      sendNotification: (sub, data) => webpush.sendNotification(sub, data),
      cleanupSubscription: (endpoint) => admin.rpc("cleanup_push_subscription", { _endpoint: endpoint }),
    });

    return json({ school_id: me.school_id, ...summary });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
