// Envia push de "sirene de troca de tempo" para todos os profissionais
// aprovados de cada escola, no início de cada tempo (schedule_periods,
// considerando schedule_reduced_days do dia). Roda a cada minuto via cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const RAW_VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
// web-push exige URL válida (mailto: ou https://). Se vier só e-mail, prefixa mailto:.
const VAPID_SUBJECT = /^(mailto:|https?:\/\/)/i.test(RAW_VAPID_SUBJECT)
  ? RAW_VAPID_SUBJECT
  : `mailto:${RAW_VAPID_SUBJECT}`;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const SHIFT_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Hora em America/Manaus
  const nowManaus = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Manaus" }));
  const today = nowManaus.toISOString().slice(0, 10);
  const hh = String(nowManaus.getHours()).padStart(2, "0");
  const mm = String(nowManaus.getMinutes()).padStart(2, "0");
  const minuteStart = `${hh}:${mm}:00`;
  const minuteEnd = `${hh}:${mm}:59`;

  // Períodos cujo start_time cai dentro deste minuto (base padrão)
  const { data: periods, error: pErr } = await admin
    .from("schedule_periods")
    .select("id, school_id, shift, period_number, label, start_time, end_time")
    .gte("start_time", minuteStart)
    .lte("start_time", minuteEnd);
  if (pErr) return json({ error: pErr.message }, 500);

  // Overrides de "tempo reduzido" do dia
  const { data: reduced } = await admin
    .from("schedule_reduced_days")
    .select("school_id, shift, period_number, label, start_time, end_time, date")
    .eq("date", today);

  // Indexa overrides
  const ovKey = (s: string, sh: string, n: number) => `${s}|${sh}|${n}`;
  const ovMap = new Map<string, any>();
  (reduced ?? []).forEach((r) => ovMap.set(ovKey(r.school_id, r.shift, r.period_number), r));

  // Construir lista efetiva: aplica override quando existe
  type Trigger = { school_id: string; period_id: string; shift: string; period_number: number; label: string };
  const triggers: Trigger[] = [];
  const seen = new Set<string>();

  // 1) Períodos padrão que casam neste minuto
  for (const p of periods ?? []) {
    const ov = ovMap.get(ovKey(p.school_id, p.shift, p.period_number));
    const start = ov?.start_time ?? p.start_time;
    if (start >= minuteStart && start <= minuteEnd) {
      const key = `${p.school_id}|${p.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        triggers.push({
          school_id: p.school_id,
          period_id: p.id,
          shift: p.shift,
          period_number: p.period_number,
          label: ov?.label ?? p.label,
        });
      }
    }
  }

  // 2) Overrides que casam mas cujo período padrão não casava
  for (const r of reduced ?? []) {
    if (r.start_time >= minuteStart && r.start_time <= minuteEnd) {
      // Acha o id do período padrão correspondente
      const { data: stdP } = await admin
        .from("schedule_periods")
        .select("id, label")
        .eq("school_id", r.school_id)
        .eq("shift", r.shift)
        .eq("period_number", r.period_number)
        .maybeSingle();
      if (!stdP) continue;
      const key = `${r.school_id}|${stdP.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        triggers.push({
          school_id: r.school_id,
          period_id: stdP.id,
          shift: r.shift,
          period_number: r.period_number,
          label: r.label ?? stdP.label,
        });
      }
    }
  }

  if (triggers.length === 0) {
    return json({ ok: true, triggered: 0, at: `${today} ${minuteStart}` });
  }

  let totalSent = 0;
  let totalFailed = 0;
  const details: any[] = [];

  for (const t of triggers) {
    // Dedupe: evita enviar 2x no mesmo dia/período/escola
    const { data: dispatched } = await admin
      .from("shift_push_dispatch_log")
      .select("id")
      .eq("school_id", t.school_id)
      .eq("period_id", t.period_id)
      .eq("dispatch_date", today)
      .maybeSingle();
    if (dispatched) continue;

    // Marca antes de enviar (idempotência)
    const { error: insErr } = await admin
      .from("shift_push_dispatch_log")
      .insert({ school_id: t.school_id, period_id: t.period_id, dispatch_date: today });
    if (insErr) continue;

    // Profissionais aprovados da escola
    const { data: profs } = await admin
      .from("profiles")
      .select("id")
      .eq("school_id", t.school_id)
      .eq("status", "approved");
    const userIds = (profs ?? []).map((p) => p.id);
    if (userIds.length === 0) continue;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!subs || subs.length === 0) continue;

    const title = `🔔 ${t.label} — ${SHIFT_LABEL[t.shift] ?? t.shift}`;
    const body = `Início do ${t.label} (${SHIFT_LABEL[t.shift] ?? t.shift}).`;
    const payload = JSON.stringify({
      title,
      body,
      url: "/assistente/quadro",
      tag: `shift-${t.school_id}-${t.period_id}-${today}`,
    });

    const results = await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          return { ok: true };
        } catch (err: any) {
          const statusCode = err?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await admin.rpc("cleanup_push_subscription", { _endpoint: s.endpoint });
          }
          return { ok: false, statusCode };
        }
      }),
    );
    const sent = results.filter((r) => r.ok).length;
    totalSent += sent;
    totalFailed += results.length - sent;
    details.push({ school_id: t.school_id, period: t.label, sent, failed: results.length - sent });
  }

  return json({ ok: true, triggered: triggers.length, sent: totalSent, failed: totalFailed, details });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
