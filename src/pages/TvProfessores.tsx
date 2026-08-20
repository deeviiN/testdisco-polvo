import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, GraduationCap, Maximize2, RefreshCw } from "lucide-react";
import { claimSirenFire } from "@/lib/sirenDedupe";
import { clockShift, currentSchoolPeriod, schoolTimeShift } from "@/lib/schoolShift";
import silvoLongoAsset from "@/assets/sirens/silvo-longo.mp3.asset.json";
import silvoCurtoAsset from "@/assets/sirens/silvo-curto.mp3.asset.json";
import campainhaLongoAsset from "@/assets/sirens/campainha-longo.mp3.asset.json";
import campainhaCurtoAsset from "@/assets/sirens/campainha-curto.mp3.asset.json";

type Shift = "manha" | "tarde" | "noite";
type SirenKind = "alarme" | "campainha";
type SirenAt = "none" | "short" | "long";
const SIREN_SRC: Record<SirenKind, { short: string | null; long: string | null }> = {
  alarme: { short: (silvoCurtoAsset as any).url ?? null, long: (silvoLongoAsset as any).url ?? null },
  campainha: { short: (campainhaCurtoAsset as any).url ?? null, long: (campainhaLongoAsset as any).url ?? null },
};
function normalizeSirenKind(v: any): SirenKind {
  return v === "campainha" ? "campainha" : "alarme";
}

type Period = {
  id: string;
  shift: Shift;
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
  start_siren?: SirenAt;
  end_siren?: SirenAt;
};

type Roster = {
  id: string;
  teacher_name: string;
  nickname: string | null;
  discipline: string | null;
  class_name: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  shift: string | null;
  block_name: string | null;
  room_name: string | null;
  period_id: string | null;
};

type Status = "presente" | "ausente" | "atrasado" | "pendente";

const TABS = ["TEMPO REAL", "TODOS OS TEMPOS", "POR PROFESSOR", "POR TURMA", "RESUMO GERAL"] as const;

const STATUS_LABEL: Record<Status, string> = {
  presente: "PRESENTE", ausente: "AUSENTE", atrasado: "ATRASADO", pendente: "PENDENTE",
};
const STATUS_BG: Record<Status, string> = {
  presente: "bg-blue-500", ausente: "bg-red-500", atrasado: "bg-amber-500", pendente: "bg-slate-400",
};

function currentShift(d: Date): Shift {
  return clockShift(d);
}

const PAGE_SIZE = 12;
const PAGE_INTERVAL_MS = 10_000;

/**
 * Intervalo (em ms) do fallback de recarregamento do Painel TV quando o
 * realtime cai. Ajuste aqui para mudar o padrão (10s). Pode ser sobreposto
 * pela URL via `?reload=15` (segundos). Mínimo aceito: 3s.
 */
const DEFAULT_FALLBACK_RELOAD_MS = 10_000;
const MIN_FALLBACK_RELOAD_MS = 3_000;

export default function TvProfessores() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const schoolId = params.get("school");

  const [now, setNow] = useState(new Date());
  const [school, setSchool] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [presence, setPresence] = useState<Record<string, Status>>({});
  const [tab, setTab] = useState<(typeof TABS)[number]>("TEMPO REAL");
  const [page, setPage] = useState(0);

  const today = format(now, "yyyy-MM-dd");
  const weekday = now.getDay();
  const shift = useMemo(() => schoolTimeShift(periods, now, currentShift(now)), [periods, now]);

  const load = useCallback(async () => {
    if (!schoolId) return;
    const [s, pr, r, p, red] = await Promise.all([
      supabase.rpc("get_school_public_info", { _school_id: schoolId }),
      supabase.from("schedule_periods").select("*").eq("school_id", schoolId),
      supabase.from("teacher_roster").select("*").eq("school_id", schoolId).eq("weekday", weekday).order("start_time"),
      supabase.from("teacher_roster_presence").select("roster_id,status,period_number").eq("school_id", schoolId).eq("presence_date", today),
      supabase.from("schedule_reduced_days").select("*").eq("school_id", schoolId).eq("reduced_date", today),
    ]);
    if (s.data && s.data.length > 0) setSchool(s.data[0]);
    let plist = (pr.data ?? []) as Period[];
    if (red.data && red.data.length > 0) {
      const key = (sh: string, n: number) => `${sh}-${n}`;
      const ov = new Map<string, any>();
      red.data.forEach((x: any) => ov.set(key(x.shift, x.period_number), x));
      plist = plist.map((pp) => {
        const o = ov.get(key(pp.shift, pp.period_number));
        return o ? { ...pp, start_time: o.start_time, end_time: o.end_time, label: o.label } : pp;
      });
    }
    setPeriods(plist);
    setRoster((r.data ?? []) as Roster[]);
    const m: Record<string, Status> = {};
    (p.data ?? []).forEach((x: any) => { m[`${x.roster_id}:${x.period_number}`] = x.status as Status; });
    setPresence(m);

  }, [schoolId, today, weekday]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") { setNow(new Date()); load(); }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(i);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load]);
  const lastPeriodIdRef = useRef<string | undefined>(undefined);

  const [rtStatus, setRtStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [rtPulse, setRtPulse] = useState(0);

  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase.channel(`tv-prof-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster_presence", filter: `school_id=eq.${schoolId}` }, (payload: any) => {
        // Atualização incremental imediata — sem refetch, para refletir em tempo real.
        const row = payload.new ?? payload.old;
        if (!row || row.presence_date !== today) return;
        const k = `${row.roster_id}:${row.period_number}`;
        setPresence((prev) => {
          const next = { ...prev };
          if (payload.eventType === "DELETE") delete next[k];
          else next[k] = row.status as Status;
          return next;
        });
        setRtPulse((n) => n + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_periods", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_reduced_days", filter: `school_id=eq.${schoolId}` }, load)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { setRtStatus("live"); load(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRtStatus("error");
        else setRtStatus("connecting");
      });
    return () => { supabase.removeChannel(ch); };
  }, [schoolId, today, load]);

  // Fallback: enquanto o realtime não estiver "live", recarrega no intervalo
  // configurado (padrão DEFAULT_FALLBACK_RELOAD_MS). Pode ser ajustado via
  // URL `?reload=15` (segundos). Ao reconectar, o intervalo é desmontado.
  const RELOAD_OPTIONS_SEC = [3, 5, 10, 15, 30, 60] as const;
  const RELOAD_STORAGE_KEY = "tv-prof:fallback-reload-sec";
  const [reloadSec, setReloadSec] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(RELOAD_STORAGE_KEY);
      if (stored) {
        const n = parseFloat(stored);
        if (Number.isFinite(n) && n > 0) return Math.max(MIN_FALLBACK_RELOAD_MS / 1000, n);
      }
    } catch {}
    const raw = params.get("reload");
    if (raw) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0) return Math.max(MIN_FALLBACK_RELOAD_MS / 1000, n);
    }
    return DEFAULT_FALLBACK_RELOAD_MS / 1000;
  });
  useEffect(() => {
    try { localStorage.setItem(RELOAD_STORAGE_KEY, String(reloadSec)); } catch {}
  }, [reloadSec]);
  const fallbackReloadMs = Math.max(MIN_FALLBACK_RELOAD_MS, Math.round(reloadSec * 1000));

  useEffect(() => {
    if (!schoolId) return;
    if (rtStatus === "live") return;
    const i = setInterval(() => { load(); }, fallbackReloadMs);
    return () => clearInterval(i);
  }, [rtStatus, schoolId, load, fallbackReloadMs]);


  // ===== Sirene em tempo real (mesma configuração do gestor) =====
  const [schoolSiren, setSchoolSiren] = useState<{ enabled: boolean; siren_kind: SirenKind; short_seconds: number; long_seconds: number } | null>(null);
  const mp3Ref = useRef<HTMLAudioElement | null>(null);
  const mp3TimerRef = useRef<any>(null);
  const firedSirenRef = useRef<Set<string>>(new Set());
  const firedSirenDateRef = useRef<string>(today);

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    supabase.from("school_siren_settings").select("*").eq("school_id", schoolId).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        setSchoolSiren({
          enabled: !!data.enabled,
          siren_kind: normalizeSirenKind(data.siren_kind),
          short_seconds: data.short_seconds,
          long_seconds: data.long_seconds,
        });
      });
    const ch = supabase.channel(`tv-prof-siren-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "school_siren_settings", filter: `school_id=eq.${schoolId}` }, (payload: any) => {
        const d = payload.new;
        if (d) setSchoolSiren({
          enabled: !!d.enabled, siren_kind: normalizeSirenKind(d.siren_kind),
          short_seconds: d.short_seconds, long_seconds: d.long_seconds,
        });
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [schoolId]);

  const playMp3Siren = useCallback((src: string, _durationSec?: number) => {
    if (mp3TimerRef.current) { clearTimeout(mp3TimerRef.current); mp3TimerRef.current = null; }
    let a = mp3Ref.current;
    if (!a) { a = new Audio(); mp3Ref.current = a; }
    try {
      a.src = src; a.loop = false; a.currentTime = 0; a.volume = 1;
      a.play().catch(() => {});
      if ("vibrate" in navigator) { try { navigator.vibrate([400, 150, 400]); } catch {} }
    } catch {}
  }, []);

  const time5 = (v: string | null | undefined) => (v ?? "").slice(0, 5);
  const sirenEventsToday = useMemo(() => {
    const evts: { time: string; kind: "short" | "long"; key: string }[] = [];
    (["manha", "tarde", "noite"] as Shift[]).forEach((sh) => {
      const ps = periods.filter((p) => p.shift === sh).sort((a, b) => a.period_number - b.period_number);
      ps.forEach((p) => {
        const s = (p.start_siren ?? "short") as SirenAt;
        const e = (p.end_siren ?? "short") as SirenAt;
        if (s !== "none") evts.push({ time: time5(p.start_time), kind: s, key: `${sh}-${p.period_number}-start` });
        if (e !== "none") evts.push({ time: time5(p.end_time), kind: e, key: `${sh}-${p.period_number}-end` });
      });
    });
    return evts;
  }, [periods]);

  useEffect(() => {
    if (firedSirenDateRef.current !== today) {
      firedSirenRef.current.clear();
      firedSirenDateRef.current = today;
    }
    if (!schoolSiren?.enabled) return;
    if (document.visibilityState !== "visible") return;
    const pack = SIREN_SRC[schoolSiren.siren_kind];
    if (!pack) return;
    const nowHM = format(now, "HH:mm");
    const nowSec = Number(format(now, "ss"));
    if (nowSec > 4) return;
    for (const ev of sirenEventsToday) {
      const fireKey = `${schoolId ?? "school"}-${today}-${ev.key}-${ev.time}`;
      if (ev.time === nowHM && !firedSirenRef.current.has(fireKey)) {
        if (!claimSirenFire(fireKey)) continue;
        firedSirenRef.current.add(fireKey);
        const dur = ev.kind === "long" ? schoolSiren.long_seconds : schoolSiren.short_seconds;
        const src = ev.kind === "long" ? pack.long : pack.short;
        if (src) playMp3Siren(src, dur);
      }
    }
  }, [now, today, sirenEventsToday, schoolSiren, schoolId, playMp3Siren]);

  const getStatus = (id: string): Status =>
    (currentPeriod ? presence[`${id}:${currentPeriod.period_number}`] : undefined) ?? "pendente";


  // Período atual: ativo agora; senão último já iniciado; senão primeiro do turno
  const currentPeriod = useMemo(() => {
    return currentSchoolPeriod(periods, shift, now);
  }, [periods, now, shift]);

  // Reload imediato ao mudar o tempo atual.
  useEffect(() => {
    if (currentPeriod?.id && currentPeriod.id !== lastPeriodIdRef.current) {
      lastPeriodIdRef.current = currentPeriod.id;
      load();
    }
  }, [currentPeriod?.id, load]);

  // Dados por aba
  const tableRows = useMemo(() => {
    let rows = roster;
    if (tab === "TEMPO REAL" && currentPeriod) {
      const ps = currentPeriod.start_time;
      const pe = currentPeriod.end_time;
      // Mescla aulas geminadas: período do professor sobrepõe o período atual OU period_id casa
      rows = roster.filter((r) => {
        const overlaps = r.start_time < pe && r.end_time > ps;
        if (overlaps) return true;
        return !!r.period_id && r.period_id === currentPeriod.id;
      });
    } else if (tab === "POR PROFESSOR") {
      rows = [...roster].sort((a, b) => a.teacher_name.localeCompare(b.teacher_name));
    } else if (tab === "POR TURMA") {
      rows = [...roster].sort((a, b) => (a.class_name ?? "").localeCompare(b.class_name ?? ""));
    }
    return rows;
  }, [roster, tab, currentPeriod]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));

  // Reset page when tab/data changes
  useEffect(() => { setPage(0); }, [tab, tableRows.length]);

  // Loop paginação
  useEffect(() => {
    if (totalPages <= 1) return;
    const i = setInterval(() => setPage((p) => (p + 1) % totalPages), PAGE_INTERVAL_MS);
    return () => clearInterval(i);
  }, [totalPages]);

  const pageRows = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const counts = useMemo(() => {
    const c = { total: roster.length, presente: 0, ausente: 0, atrasado: 0, pendente: 0 };
    roster.forEach((r) => { c[getStatus(r.id)]++; });
    return c;
  }, [roster, presence]);

  // Bloco atual: pega o mais frequente entre as aulas em andamento
  const currentBlock = useMemo(() => {
    const blocks: Record<string, number> = {};
    tableRows.forEach((r) => { if (r.block_name) blocks[r.block_name] = (blocks[r.block_name] ?? 0) + 1; });
    const entries = Object.entries(blocks).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? "—";
  }, [tableRows]);

  const goFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  if (!schoolId) {
    return (
      <div className="h-dvh w-screen bg-white flex flex-col items-center justify-center gap-4 text-slate-900">
        <GraduationCap className="h-16 w-16 text-[#0A2A66] opacity-60" />
        <h1 className="text-2xl font-black">TV — Quadro de Professores</h1>
        <p className="text-slate-500">Parâmetro "school" não informado.</p>
        <p className="text-slate-400 text-sm">Use: /tv-professores?school=ID_DA_ESCOLA</p>
        <button onClick={() => navigate("/home")} className="mt-4 px-6 py-2 rounded-xl bg-[#0A2A66] text-white font-bold">Voltar</button>
      </div>
    );
  }

  return (
    <div className="tv-prof-root h-dvh w-screen bg-white text-slate-900 overflow-hidden flex flex-col">
      {/* Cabeçalho */}
      <header className="bg-[#0A2A66] text-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {school?.logo_url && (
            <img src={school.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover border-2 border-white/30" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">Quadro de Professores</p>
            <h1 className="text-3xl font-black leading-tight break-words">
              <span>{school?.name ?? "Escola"}</span>
              <span className="text-xl font-black text-white/90"> · {shift.toUpperCase()}</span>
              {currentPeriod && <span className="text-xl font-black text-white/90"> · {currentPeriod.label}</span>}
            </h1>
            <p className="text-base text-white/80 capitalize font-semibold">
              {format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              {" · Bloco "}<span className="font-black">{currentBlock}</span>
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-6xl font-black tabular-nums leading-none">
            {format(now, "HH:mm")}
            <span className="text-3xl text-white/60">:{format(now, "ss")}</span>
          </p>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span
              key={rtPulse}
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                rtStatus === "live" ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse"
                : rtStatus === "connecting" ? "bg-amber-400 animate-pulse"
                : "bg-red-500"
              }`}
              title={rtStatus === "live" ? "Sincronizando em tempo real" : rtStatus === "connecting" ? "Conectando…" : "Sem conexão em tempo real"}
            />
            <span className={`text-[11px] font-black tracking-widest uppercase ${
              rtStatus === "live" ? "text-emerald-300"
              : rtStatus === "connecting" ? "text-amber-300"
              : "text-red-300"
            }`}>
              {rtStatus === "live" ? "AO VIVO" : rtStatus === "connecting" ? "CONECTANDO" : "OFFLINE"}
            </span>
            <select
              value={reloadSec}
              onChange={(e) => setReloadSec(parseFloat(e.target.value))}
              title="Intervalo de recarregamento quando o realtime cair"
              className="ml-1 h-6 rounded bg-white/10 border border-white/20 text-white text-[11px] font-bold px-1 focus:outline-none focus:ring-1 focus:ring-white/40"
            >
              {RELOAD_OPTIONS_SEC.map((s) => (
                <option key={s} value={s} className="text-black">{s}s</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Abas */}
      <nav className="bg-[#1E4DB7] text-white px-3 py-2 flex gap-1 overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 h-10 rounded-lg font-black text-xs whitespace-nowrap transition ${
              tab === t ? "bg-white text-[#1E4DB7]" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Conteúdo */}
      <main className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
        {tab === "RESUMO GERAL" ? (
          <div className="grid grid-cols-5 gap-4 flex-1">
            {([
              ["TOTAL", counts.total, "bg-[#0A2A66] text-white"],
              ["PRESENTES", counts.presente, "bg-blue-500 text-white"],
              ["AUSENTES", counts.ausente, "bg-red-500 text-white"],
              ["ATRASADOS", counts.atrasado, "bg-amber-500 text-white"],
              ["PENDENTES", counts.pendente, "bg-slate-400 text-white"],
            ] as const).map(([l, v, cls]) => (
              <div key={l} className={`${cls} rounded-3xl flex flex-col items-center justify-center`}>
                <p className="text-7xl font-black tabular-nums">{v}</p>
                <p className="text-sm font-black tracking-widest mt-2">{l}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border-2 border-slate-200 flex-1 overflow-hidden flex flex-col">
              <div className="grid grid-cols-12 bg-[#0A2A66] text-white text-xs font-black uppercase tracking-wider px-4 py-2.5">
                <div className="col-span-2">Turma</div>
                <div className="col-span-3">Disciplina</div>
                <div className="col-span-3">Professor</div>
                <div className="col-span-2">Sala / Bloco</div>
                <div className="col-span-2 text-right">Status</div>
              </div>
              <div className="flex-1 divide-y divide-slate-100">
                {pageRows.length === 0 && (
                  <div className="h-full flex items-center justify-center text-slate-400 text-lg">
                    Nenhum dado para exibir.
                  </div>
                )}
                {pageRows.map((r, i) => {
                  const st = getStatus(r.id);
                  return (
                    <div
                      key={r.id}
                      className={`grid grid-cols-12 items-center px-4 py-3 text-base ${i % 2 ? "bg-white" : "bg-slate-50"}`}
                    >
                      <div className="col-span-2 font-black text-[#0A2A66]">{r.class_name ?? "—"}</div>
                      <div className="col-span-3 break-words">{r.discipline ?? "—"}</div>
                      <div className="col-span-3 font-bold break-words">{(() => { const n = (r.nickname ?? "").trim(); if (n) return n; const parts = (r.teacher_name ?? "").trim().split(/\s+/).filter(Boolean); return parts.length <= 1 ? (parts[0] ?? "") : `${parts[0]} ${parts[parts.length-1]}`; })()}</div>
                      <div className="col-span-2 text-sm text-slate-600">
                        {r.room_name ? `Sala ${r.room_name}` : "—"} · Bl. {r.block_name ?? "—"}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <span className={`px-4 py-2.5 rounded-full text-base font-black text-white ${STATUS_BG[st]}`}>
                          {STATUS_LABEL[st]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>{tableRows.length} aula(s) · página {page + 1}/{totalPages}</span>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === page ? "w-8 bg-[#0A2A66]" : "w-1.5 bg-slate-300"}`} />
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Botão voltar discreto */}
      <button
        onClick={() => navigate("/home")}
        className="fixed top-3 right-3 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 transition opacity-20 hover:opacity-100"
        title="Voltar"
      >
        <ArrowLeft className="h-4 w-4 text-white" />
      </button>

      {/* Botão tela cheia discreto */}
      <button
        onClick={goFullscreen}
        className="fixed bottom-3 right-3 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 transition opacity-20 hover:opacity-100"
        title="Tela cheia"
      >
        <Maximize2 className="h-4 w-4 text-white" />
      </button>
    </div>
  );
}
