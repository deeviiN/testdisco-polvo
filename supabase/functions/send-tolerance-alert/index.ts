// Envia push "Tolerância encerrada — marque o status dos professores" para
// os assistentes de aluno de cada escola, exatamente quando o prazo de
// tolerância (roster_call_settings) do início de cada tempo se esgota.
// Roda a cada minuto via pg_cron.
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

const SHIFT_LABEL: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const ASSISTANT_ROLES = ["assistente", "assistente_alunos", "secretario_escolar"];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const nowManaus = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Manaus" }));
  const today = nowManaus.toISOString().slice(0, 10);
  const hh = String(nowManaus.getHours()).padStart(2, "0");
  const mm = String(nowManaus.getMinutes()).padStart(2, "0");
  const currentHM = `${hh}:${mm}`;

  // 1. Tolerâncias por escola
  const { data: tolRows, error: tErr } = await admin
    .from("roster_call_settings")
    .select("school_id, tolerance_manha, tolerance_tarde, tolerance_noite");
  if (tErr) return json({ error: tErr.message }, 500);
  const tolBySchool = new Map<string, { manha: number; tarde: number; noite: number }>();
  (tolRows ?? []).forEach((r: any) =>
    tolBySchool.set(r.school_id, {
      manha: r.tolerance_manha ?? 15,
      tarde: r.tolerance_tarde ?? 15,
      noite: r.tolerance_noite ?? 15,
    }),
  );

  // 2. Todos os períodos padrão
  const { data: periods, error: pErr } = await admin
    .from("schedule_periods")
    .select("id, school_id, shift, period_number, label, start_time");
  if (pErr) return json({ error: pErr.message }, 500);

  // 3. Overrides do dia (tempo reduzido)
  const { data: reduced } = await admin
    .from("schedule_reduced_days")
    .select("school_id, shift, period_number, start_time, label")
    .eq("date", today);
  const ovKey = (s: string, sh: string, n: number) => `${s}|${sh}|${n}`;
  const ovMap = new Map<string, any>();
  (reduced ?? []).forEach((r: any) => ovMap.set(ovKey(r.school_id, r.shift, r.period_number), r));

  type Trigger = { school_id: string; period_id: string; shift: string; period_number: number; label: string; tol: number };
  const triggers: Trigger[] = [];

  for (const p of periods ?? []) {
    const school = tolBySchool.get(p.school_id) ?? { manha: 15, tarde: 15, noite: 15 };
    const shiftKey = (p.shift as "manha" | "tarde" | "noite") ?? "manha";
    const tol = school[shiftKey] ?? 15;
    const ov = ovMap.get(ovKey(p.school_id, p.shift, p.period_number));
    const start = (ov?.start_time ?? p.start_time).slice(0, 5);
    const unlockHM = addMinutes(start, tol);
    if (unlockHM === currentHM) {
      triggers.push({
        school_id: p.school_id,
        period_id: p.id,
        shift: p.shift,
        period_number: p.period_number,
        label: ov?.label ?? p.label,
        tol,
      });
    }
  }

  if (triggers.length === 0) {
    return json({ ok: true, triggered: 0, at: `${today} ${currentHM}` });
  }

  let totalSent = 0;
  let totalFailed = 0;
  const details: any[] = [];

  for (const t of triggers) {
    // Dedupe por escola/período/dia
    const { data: dispatched } = await admin
      .from("tolerance_push_dispatch_log")
      .select("id")
      .eq("school_id", t.school_id)
      .eq("period_id", t.period_id)
      .eq("dispatch_date", today)
      .maybeSingle();
    if (dispatched) continue;

    const { error: insErr } = await admin
      .from("tolerance_push_dispatch_log")
      .insert({ school_id: t.school_id, period_id: t.period_id, dispatch_date: today });
    if (insErr) continue;

    // Assistentes aprovados da escola
    const { data: profs } = await admin
      .from("profiles")
      .select("id, role")
      .eq("school_id", t.school_id)
      .eq("status", "approved")
      .in("role", ASSISTANT_ROLES);
    const userIds = (profs ?? []).map((p: any) => p.id);
    if (userIds.length === 0) continue;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!subs || subs.length === 0) continue;

    const title = `⏰ ${t.label} — Marque o status agora`;
    const body = `Passaram ${t.tol} min do início do ${t.label} (${SHIFT_LABEL[t.shift] ?? t.shift}). Toque para marcar Presente / Ausente / Atrasado.`;
    const payload = JSON.stringify({
      title,
      body,
      url: "/assistente/quadro",
      tag: `tol-${t.school_id}-${t.period_id}-${today}`,
    });

    const results = await Promise.all(
      subs.map(async (s: any) => {
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
