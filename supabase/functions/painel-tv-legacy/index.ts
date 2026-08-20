// Edge function que renderiza o Painel TV em HTML puro (sem JS),
// atualizando via <meta refresh> a cada 30s. Alvo: TV Box antiga
// com Chromium legado que não suporta o bundle moderno.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const DOW = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortName(full: string, nick: string | null | undefined) {
  const n = (nick ?? "").trim();
  if (n) return n;
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts[0]} ${parts[parts.length - 1]}`;
}

function pickShift(hhmm: number): "manha" | "tarde" | "noite" {
  if (hhmm < 12 * 60 + 45) return "manha";
  if (hhmm < 18 * 60) return "tarde";
  return "noite";
}

function timeToMin(t: string): number {
  const [h, m] = String(t ?? "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const schoolId = url.searchParams.get("school");
  if (!schoolId) {
    return new Response("<h1>Falta ?school=UUID</h1>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const sb = createClient(SUPABASE_URL, ANON);
  const [s, tv] = await Promise.all([
    sb.rpc("get_school_public_info", { _school_id: schoolId }),
    sb.rpc("get_painel_tv_data", { _school_id: schoolId, _weekday_override: null } as never),
  ]);

  const school = Array.isArray(s.data) && s.data.length > 0 ? (s.data[0] as { name: string; logo_url: string | null }) : { name: "", logo_url: null };
  const tvData = (tv.data as Record<string, unknown>) || {};

  const serverNow = tvData.server_now ? new Date(String(tvData.server_now)) : new Date();
  const now = serverNow;
  const hhmm = now.getHours() * 60 + now.getMinutes();
  const weekday = now.getDay();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  type Period = { id: string; shift: "manha" | "tarde" | "noite"; period_number: number; label: string; start_time: string; end_time: string };
  type Roster = { id: string; teacher_name: string; nickname: string | null; discipline: string | null; class_name: string | null; weekday: number; start_time: string; end_time: string; shift: string | null; block_name: string | null; room_name: string | null; period_id: string | null };

  let periods = ((tvData.periods as Period[]) ?? []) as Period[];
  const reduced = ((tvData.reduced as Period[]) ?? []) as Period[];
  if (reduced.length > 0) {
    const key = (sh: string, n: number) => `${sh}-${n}`;
    const ov = new Map<string, Period>();
    reduced.forEach((x) => ov.set(key(x.shift, x.period_number), x));
    periods = periods.map((pp) => {
      const o = ov.get(key(pp.shift, pp.period_number));
      return o ? { ...pp, start_time: o.start_time, end_time: o.end_time, label: o.label } : pp;
    });
  }

  // Turno atual = turno do tempo em curso; se antes do 1º, turno com tempos; se depois, último turno.
  const shifts: Array<"manha" | "tarde" | "noite"> = ["manha", "tarde", "noite"];
  let shift: "manha" | "tarde" | "noite" = pickShift(hhmm);
  const active = periods.find((p) => timeToMin(p.start_time) <= hhmm && hhmm < timeToMin(p.end_time));
  if (active) shift = active.shift;
  else {
    const withPeriods = shifts.filter((sh) => periods.some((p) => p.shift === sh));
    if (withPeriods.length > 0) {
      const before = withPeriods.find((sh) => hhmm < Math.min(...periods.filter((p) => p.shift === sh).map((p) => timeToMin(p.start_time))));
      if (before) shift = before;
      else shift = withPeriods[withPeriods.length - 1];
    }
  }

  const roster = ((tvData.roster as Roster[]) ?? []).filter((r) => r.weekday === weekday && (r.shift ?? "").toLowerCase() === shift);
  const presence: Record<string, string> = {};
  ((tvData.presence as Array<{ roster_id: string; period_number: number; status: string }>) ?? []).forEach((x) => {
    presence[`${x.roster_id}:${x.period_number}`] = x.status;
  });
  const extras: Record<string, { kind: "extra" | "sub" | "self"; text: string }> = {};
  ((tvData.extras as Array<{ roster_id: string; period_number: number; reason: string; location: string | null; absent_teacher_name: string | null; covering_teacher_name: string | null; covering_nickname: string | null; covering_discipline: string | null }>) ?? []).forEach((x) => {
    if (!x?.roster_id) return;
    const key = `${x.roster_id}:${x.period_number}`;
    if (x.reason === "atividade_extra") {
      extras[key] = { kind: "extra", text: `Extra: ${x.location ?? ""}` };
    } else {
      const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isSelf = !!x.absent_teacher_name && !!x.covering_teacher_name && norm(x.absent_teacher_name) === norm(x.covering_teacher_name);
      const t = x.covering_nickname || x.covering_teacher_name || "";
      const d = x.covering_discipline ? ` (${x.covering_discipline})` : "";
      extras[key] = { kind: isSelf ? "self" : "sub", text: (isSelf ? "Reassumiu: " : "Subst.: ") + t + d };
    }
  });

  const shiftPeriods = periods.filter((p) => p.shift === shift).sort((a, b) => a.period_number - b.period_number);

  // Uma linha por professor (roster). Colunas: Tempo, Horário, Turma, Sala, Professor, Status, Substituição.
  const rows = roster
    .map((r) => {
      const p = shiftPeriods.find((pp) => pp.id === r.period_id) ?? shiftPeriods.find((pp) => pp.start_time === r.start_time);
      const pn = p?.period_number ?? 0;
      const key = `${r.id}:${pn}`;
      const st = presence[key] ?? "pendente";
      const ex = extras[key];
      return { r, p, pn, st, ex };
    })
    .sort((a, b) => (a.pn - b.pn) || String(a.r.class_name ?? "").localeCompare(String(b.r.class_name ?? "")));

  const STATUS_LABEL: Record<string, string> = {
    presente: "PRESENTE",
    atrasado: "ATRASADO",
    ausente: "AUSENTE",
    pendente: "PENDENTE",
  };
  const STATUS_COLOR: Record<string, string> = {
    presente: "#10b981",
    atrasado: "#f59e0b",
    ausente: "#ef4444",
    pendente: "#71717a",
  };

  const shiftLabel = shift === "manha" ? "MANHÃ" : shift === "tarde" ? "TARDE" : "NOITE";

  const rowsHtml = rows
    .map(({ r, p, st, ex }) => {
      const status = STATUS_LABEL[st] ?? "PENDENTE";
      const color = STATUS_COLOR[st] ?? "#71717a";
      const room = [r.block_name, r.room_name].filter(Boolean).join(" · ");
      return `<tr>
        <td align="center"><b>${esc(p?.period_number ?? "")}º</b></td>
        <td align="center">${esc(p ? `${p.start_time.slice(0, 5)}-${p.end_time.slice(0, 5)}` : "")}</td>
        <td align="center"><b>${esc(r.class_name ?? "")}</b></td>
        <td align="center">${esc(room)}</td>
        <td>${esc(shortName(r.teacher_name, r.nickname))}${r.discipline ? ` <span style="color:#a1a1aa">· ${esc(r.discipline)}</span>` : ""}</td>
        <td align="center"><b style="color:${color}">${esc(status)}</b></td>
        <td>${ex ? esc(ex.text) : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta http-equiv="refresh" content="30">
<meta http-equiv="Cache-Control" content="no-store">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>Painel TV - ${esc(school.name)}</title>
<style type="text/css">
  html, body { margin:0; padding:0; background:#0b1220; color:#e5e7eb; font-family: Arial, Helvetica, sans-serif; }
  .wrap { padding: 12px 16px; }
  .head { display:block; border-bottom:2px solid #1f2937; padding-bottom:8px; margin-bottom:8px; }
  .h1 { font-size: 22px; font-weight: bold; color:#ffffff; }
  .meta { font-size: 14px; color:#9ca3af; margin-top:2px; }
  .badge { display:inline-block; padding:2px 8px; border:1px solid #334155; border-radius:4px; margin-right:6px; }
  table { width:100%; border-collapse:collapse; font-size: 16px; }
  th, td { padding: 6px 8px; border-bottom:1px solid #1f2937; }
  th { background:#111827; color:#93c5fd; text-align:center; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; }
  tr:nth-child(even) td { background:#0f172a; }
  .foot { margin-top:10px; font-size:12px; color:#64748b; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="h1">${esc(school.name || "Painel TV")}</div>
    <div class="meta">
      <span class="badge">${esc(DOW[weekday])}</span>
      <span class="badge">${esc(dateStr)}</span>
      <span class="badge">${esc(clock)}</span>
      <span class="badge">TURNO ${esc(shiftLabel)}</span>
      <span class="badge">Atualiza a cada 30s</span>
    </div>
  </div>
  <table cellspacing="0" cellpadding="0">
    <thead>
      <tr>
        <th width="60">Tempo</th>
        <th width="120">Horário</th>
        <th width="80">Turma</th>
        <th width="140">Sala</th>
        <th>Professor</th>
        <th width="130">Status</th>
        <th width="260">Substituição</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="7" align="center" style="padding:24px;color:#94a3b8">Sem professores no turno.</td></tr>`}
    </tbody>
  </table>
  <div class="foot">Modo compatível (legacy). Recarrega automaticamente a cada 30 segundos.</div>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "pragma": "no-cache",
      "expires": "0",
    },
  });
});
