// Envio de avisos institucionais pelo administrador global.
// Escopos: global (todo o Brasil), state (estado), city (município) ou school (uma escola).
// Grava o aviso em broadcast_messages (para o modal no app) e envia push aos alvos.
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

const SCOPES = ["global", "state", "city", "school"] as const;
const KINDS = ["info", "alert", "update", "maintenance"] as const;

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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({} as any));
    const scope = String(body?.scope ?? "");
    const title = String(body?.title ?? "").trim();
    const message = String(body?.body ?? "").trim();
    const kind = KINDS.includes(body?.kind) ? body.kind : "info";
    const state = body?.state ? String(body.state).trim() : null;
    const city = body?.city ? String(body.city).trim() : null;
    const schoolId = body?.school_id ? String(body.school_id) : null;
    const actionLabel = body?.action_label ? String(body.action_label).slice(0, 40) : null;
    const actionUrl = body?.action_url ? String(body.action_url).slice(0, 300) : null;
    const expiresAt = body?.expires_at ? String(body.expires_at) : null;
    const preview = body?.preview === true;

    const errors: string[] = [];
    if (!SCOPES.includes(scope as any)) errors.push("alcance inválido");
    if (title.length < 3 || title.length > 120) errors.push("título deve ter de 3 a 120 caracteres");
    if (message.length < 3 || message.length > 1200) errors.push("mensagem deve ter de 3 a 1200 caracteres");
    if (scope === "state" && !state) errors.push("informe o estado");
    if (scope === "city" && (!state || !city)) errors.push("informe estado e município");
    if (scope === "school" && !schoolId) errors.push("selecione a escola");
    if (errors.length) return json({ error: errors.join("; ") }, 400);

    // Escolas alvo
    let schoolQuery = admin.from("schools").select("id, name, city, state").eq("is_active", true);
    if (scope === "state") schoolQuery = schoolQuery.eq("state", state);
    if (scope === "city") schoolQuery = schoolQuery.eq("state", state).eq("city", city);
    if (scope === "school") schoolQuery = schoolQuery.eq("id", schoolId);
    const { data: schools, error: schoolErr } = await schoolQuery;
    if (schoolErr) return json({ error: schoolErr.message }, 500);
    const schoolIds = (schools ?? []).map((s: any) => s.id);

    // Destinatários aprovados dessas escolas
    const userIds: string[] = [];
    const usersBySchool = new Map<string, number>();
    if (schoolIds.length > 0) {
      for (let i = 0; i < schoolIds.length; i += 200) {
        const chunk = schoolIds.slice(i, i + 200);
        const { data: profs } = await admin
          .from("profiles")
          .select("user_id, school_id")
          .in("school_id", chunk)
          .eq("status", "approved");
        (profs ?? []).forEach((p: any) => {
          if (!p.user_id) return;
          userIds.push(p.user_id);
          usersBySchool.set(p.school_id, (usersBySchool.get(p.school_id) ?? 0) + 1);
        });
      }
    }

    if (preview) {
      const rows = (schools ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        users: usersBySchool.get(s.id) ?? 0,
      }));
      rows.sort((a: any, b: any) =>
        (a.state ?? "").localeCompare(b.state ?? "") ||
        (a.city ?? "").localeCompare(b.city ?? "") ||
        (a.name ?? "").localeCompare(b.name ?? "")
      );
      const cityMap = new Map<string, { city: string; state: string; schools: number; users: number }>();
      for (const r of rows) {
        const key = `${r.state}|${r.city}`;
        const cur = cityMap.get(key) ?? { city: r.city, state: r.state, schools: 0, users: 0 };
        cur.schools += 1;
        cur.users += r.users;
        cityMap.set(key, cur);
      }
      return json({
        preview: true,
        schools: schoolIds.length,
        users: userIds.length,
        cities: [...cityMap.values()].sort((a, b) => b.users - a.users || a.city.localeCompare(b.city)),
        school_list: rows.slice(0, 500),
        truncated: rows.length > 500,
      });
    }

    const { data: inserted, error: insErr } = await admin
      .from("broadcast_messages")
      .insert({
        scope, state, city, school_id: schoolId,
        title, body: message, kind,
        action_label: actionLabel, action_url: actionUrl,
        expires_at: expiresAt,
        created_by: callerId,
        created_by_name: "Administração",
      })
      .select("id")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    let summary = { sent: 0, failed: 0, removed: 0 };
    for (let i = 0; i < userIds.length; i += 300) {
      const chunk = userIds.slice(i, i + 300);
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .in("user_id", chunk);
      if (!subs || subs.length === 0) continue;

      const payload = JSON.stringify({
        title,
        body: message.slice(0, 220),
        url: actionUrl || "/",
        tag: `broadcast-${inserted.id}`,
      });
      const r = await deliverPush(subs as any, payload, {
        sendNotification: (sub, data) => webpush.sendNotification(sub, data),
        cleanupSubscription: (endpoint) => admin.rpc("cleanup_push_subscription", { _endpoint: endpoint }),
      });
      summary = {
        sent: summary.sent + r.sent,
        failed: summary.failed + r.failed,
        removed: summary.removed + r.removed,
      };
    }

    return json({ id: inserted.id, schools: schoolIds.length, users: userIds.length, ...summary });
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
