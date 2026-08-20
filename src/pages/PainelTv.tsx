import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Maximize2, RefreshCw } from "lucide-react";
import { clockShift, currentSchoolPeriod, schoolTimeShift } from "@/lib/schoolShift";
import { getAniversariantesDoDia, type Aniversariante } from "@/lib/aniversariantes";

type Shift = "manha" | "tarde" | "noite";

type Period = {
  id: string;
  shift: Shift;
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
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

const STATUS_STYLE: Record<Status, { dot: string; label: string; text: string; bg: string }> = {
  presente: { dot: "bg-blue-500", label: "PRESENTE", text: "text-blue-300", bg: "bg-blue-500/10" },
  atrasado: { dot: "bg-amber-400",   label: "ATRASADO", text: "text-amber-300",   bg: "bg-amber-500/10" },
  ausente:  { dot: "bg-red-500",     label: "AUSENTE",  text: "text-red-300",     bg: "bg-red-500/10" },
  pendente: { dot: "bg-zinc-500",    label: "PENDENTE", text: "text-zinc-300",    bg: "bg-zinc-500/10" },
};

function currentShift(d: Date): Shift {
  return clockShift(d);
}

function shortName(full: string, nick: string | null) {
  const n = (nick ?? "").trim();
  if (n) return n;
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts[0]} ${parts[parts.length - 1]}`;
}

export default function PainelTv() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const schoolId = searchParams.get("school");
  const kioskMode = searchParams.get("kiosk") === "1";
  const tvSystem = (searchParams.get("tv") ?? "").toLowerCase();
  const viewAll = (searchParams.get("view") ?? "").toLowerCase() === "all";
  const weekdayOverrideParam = searchParams.get("weekday");
  const weekdayOverride = weekdayOverrideParam !== null && /^[0-6]$/.test(weekdayOverrideParam)
    ? Number(weekdayOverrideParam)
    : null;
  const previewMode = searchParams.get("preview") === "1";
  const dateParam = searchParams.get("date");
  const simDate = useMemo(() => {
    if (!dateParam) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }, [dateParam]);

  // ---- Modo responsivo TV Box: ajuste automático dos caracteres ----
  // Escala o rem base: 100% = padrão do navegador.
  // Persistido por dispositivo/navegador (localStorage), com fallback seguro
  // para navegadores antigos de TV Box onde o storage pode lançar erro.
  const readStore = (key: string): string | null => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  };
  const writeStore = (key: string, value: string) => {
    try { window.localStorage.setItem(key, value); } catch { /* storage indisponível */ }
  };
  const fsParam = Number(searchParams.get("fs"));
  const savedScale = Number(readStore("painel_tv_ui_scale"));
  const hasManualScale = (fsParam >= 50 && fsParam <= 130) || (savedScale >= 50 && savedScale <= 130);
  const [autoFit, setAutoFit] = useState<boolean>(() => {
    if (searchParams.get("fit") === "0") return false;
    if (searchParams.get("fit") === "1") return true;
    const saved = readStore("painel_tv_auto_fit");
    if (saved === "0") return false;
    if (saved === "1") return true;
    return !hasManualScale;
  });
  const [uiScale, setUiScale] = useState<number>(() => {
    if (fsParam >= 50 && fsParam <= 130) return fsParam;
    return savedScale >= 50 && savedScale <= 130 ? savedScale : 100;
  });

  // Largura/altura da viewport (para o modo responsivo dedicado)
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Escala calculada: referência 1280x720 (TV/TV Box padrão).
  const fittedScale = useMemo(() => {
    const byW = (vp.w / 1280) * 100;
    const byH = (vp.h / 720) * 100;
    const raw = Math.min(byW, byH);
    return Math.max(55, Math.min(105, Math.round(raw / 5) * 5));
  }, [vp.w, vp.h]);

  useEffect(() => {
    if (autoFit) setUiScale(fittedScale);
  }, [autoFit, fittedScale]);

  useEffect(() => {
    writeStore("painel_tv_auto_fit", autoFit ? "1" : "0");
  }, [autoFit]);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = `${(16 * uiScale) / 100}px`;
    if (!autoFit) writeStore("painel_tv_ui_scale", String(uiScale));
    return () => { root.style.fontSize = prev; };
  }, [uiScale, autoFit]);


  // Layout compacto: em larguras baixas (TV Box antigo, 960px ou menos) as
  // colunas Disciplina e Sala/Bloco são embutidas nas colunas vizinhas para
  // nunca cortar conteúdo.
  const effectiveWidth = (vp.w * 100) / Math.max(uiScale, 1);
  const compactCols = effectiveWidth < 980;
  const gridCols = compactCols
    ? "grid-cols-[0.95fr_0.5fr_1.25fr_0.7fr_1.15fr]"
    : "grid-cols-[1fr_0.55fr_0.9fr_1.2fr_0.9fr_0.7fr_1.4fr]";




  const [school, setSchool] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [presence, setPresence] = useState<Record<string, Status>>({});
  // `${roster_id}:${period_number}` -> info da coluna substituição
  type ExtraInfo =
    | { kind: "extra"; location: string }
    | { kind: "sub"; teacher: string; discipline: string | null }
    | { kind: "self"; teacher: string; discipline: string | null };
  const [extras, setExtras] = useState<Record<string, ExtraInfo>>({});
  const [now, setNow] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [dayAbsentAlerts, setDayAbsentAlerts] = useState<{ id: string; name: string; at: number }[]>([]);
  const [showAniv, setShowAniv] = useState(false);
  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([]);
  const [anivIdx, setAnivIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Diferença entre a hora oficial do servidor (America/Manaus) e o relógio do aparelho.
  // Garante que a TV mostre o tempo certo mesmo com relógio errado/adiantado.
  const clockOffsetRef = useRef(0);

  const today = format(now, "yyyy-MM-dd");
  const weekday = weekdayOverride ?? now.getDay();
  // Turno atual: baseado nos tempos cadastrados.
  // - Antes do 1º tempo do dia: primeiro turno com tempos.
  // - Durante: turno do tempo em curso.
  // - Depois do fim do último turno: permanece no último turno (último tempo selecionado).
  const shift = useMemo<Shift>(() => {
    return schoolTimeShift(periods, now, currentShift(now));
  }, [periods, now]);
  const dow = format(now, "EEEE", { locale: ptBR }).toUpperCase();
  const dateStr = format(now, "dd/MM/yyyy");

  const load = useCallback(async () => {
    if (!schoolId) return;
    const [s, tv] = await Promise.all([
      supabase.rpc("get_school_public_info", { _school_id: schoolId }),
      supabase.rpc("get_painel_tv_data", { _school_id: schoolId, _weekday_override: weekdayOverride } as any),
    ]);
    if (s.data && Array.isArray(s.data) && s.data.length > 0) setSchool(s.data[0] as any);
    const tvData = (tv.data as any) || {};
    if (tvData.server_now) {
      const serverMs = new Date(tvData.server_now).getTime();
      if (!Number.isNaN(serverMs)) {
        clockOffsetRef.current = serverMs - Date.now();
        setNow(new Date(Date.now() + clockOffsetRef.current));
      }
    }
    let plist = (tvData.periods ?? []) as Period[];
    const red = (tvData.reduced ?? []) as any[];
    if (red.length > 0) {
      const key = (sh: string, n: number) => `${sh}-${n}`;
      const ov = new Map<string, any>();
      red.forEach((x) => ov.set(key(x.shift, x.period_number), x));
      plist = plist.map((pp) => {
        const o = ov.get(key(pp.shift, pp.period_number));
        return o ? { ...pp, start_time: o.start_time, end_time: o.end_time, label: o.label } : pp;
      });
    }
    setPeriods((prev) => (JSON.stringify(prev) === JSON.stringify(plist) ? prev : plist));
    const nextRoster = (tvData.roster ?? []) as Roster[];
    setRoster((prev) => (JSON.stringify(prev) === JSON.stringify(nextRoster) ? prev : nextRoster));
    const m: Record<string, Status> = {};
    ((tvData.presence ?? []) as any[]).forEach((x: any) => { m[`${x.roster_id}:${x.period_number}`] = x.status as Status; });
    setPresence((prev) => (JSON.stringify(prev) === JSON.stringify(m) ? prev : m));
    const em: Record<string, ExtraInfo> = {};
    ((tvData.extras ?? []) as any[]).forEach((x: any) => {
      if (!x?.roster_id) return;
      const key = `${x.roster_id}:${x.period_number}`;
      if (x.reason === "atividade_extra") {
        em[key] = { kind: "extra", location: x.location ?? "" };
      } else {
        const norm = (s: string | null | undefined) =>
          (s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isSelf =
          !!x.absent_teacher_name &&
          !!x.covering_teacher_name &&
          norm(x.absent_teacher_name) === norm(x.covering_teacher_name);
        em[key] = {
          kind: isSelf ? "self" : "sub",
          teacher: x.covering_nickname || x.covering_teacher_name || "",
          discipline: x.covering_discipline ?? null,
        };
      }
    });
    setExtras((prev) => (JSON.stringify(prev) === JSON.stringify(em) ? prev : em));

    setLastRefresh(new Date());
  }, [schoolId, weekdayOverride]);



  useEffect(() => {
    load();
    if (!schoolId) return;
    const ch = supabase
      .channel(`painel_tv_${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster_presence", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_periods", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_reduced_days", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_reassignments", filter: `school_id=eq.${schoolId}` }, load)
      .on("broadcast", { event: "presence-refresh" }, () => load())
      .on("broadcast", { event: "day-absent" }, (msg: any) => {
        const name = (msg?.payload?.teacher_name as string) || "Professor(a)";
        const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setDayAbsentAlerts((prev) => [...prev, { id, name, at: Date.now() }]);
        setTimeout(() => {
          setDayAbsentAlerts((prev) => prev.filter((a) => a.id !== id));
        }, 12000);
        load();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    return () => { supabase.removeChannel(ch); };
  }, [load, schoolId]);

  // Fallback: recarrega a cada 15s mesmo sem realtime (a TV pode estar sem login
  // e o RLS bloqueia os eventos postgres_changes para visitantes).
  useEffect(() => {
    const p = setInterval(load, 15000);
    return () => clearInterval(p);
  }, [load]);

  // Aniversariantes: lê toggle + lista, com realtime no panel_settings/tabela.
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    const loadAniv = async () => {
      const { data: ps } = await supabase
        .from("panel_settings")
        .select("mostrar_aniv_servidores")
        .eq("school_id", schoolId)
        .maybeSingle();
      const enabled = !!(ps as any)?.mostrar_aniv_servidores;
      if (cancelled) return;
      setShowAniv(enabled);
      if (!enabled) { setAniversariantes([]); return; }
      const list = await getAniversariantesDoDia(schoolId, simDate ?? new Date());
      if (!cancelled) setAniversariantes(list);
    };
    loadAniv();
    const timer = setInterval(loadAniv, 10 * 60 * 1000); // recarrega a cada 10min
    const ch = supabase
      .channel(`painel_tv_aniv_${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "servidores_aniversariantes", filter: `school_id=eq.${schoolId}` }, loadAniv)
      .on("postgres_changes", { event: "*", schema: "public", table: "panel_settings", filter: `school_id=eq.${schoolId}` }, loadAniv)
      .subscribe();
    return () => { cancelled = true; clearInterval(timer); supabase.removeChannel(ch); };
  }, [schoolId, simDate]);


  // Rotator dos aniversariantes
  useEffect(() => {
    if (aniversariantes.length <= 1) { setAnivIdx(0); return; }
    const t = setInterval(() => setAnivIdx((i) => (i + 1) % aniversariantes.length), 8000);
    return () => clearInterval(t);
  }, [aniversariantes.length]);



  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + clockOffsetRef.current));
    const t = setInterval(tick, 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();
        load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load]);

  const lastPeriodIdRef = useRef<string | undefined>(undefined);


  const getStatus = (id: string): Status =>
    (currentPeriod ? presence[`${id}:${currentPeriod.period_number}`] : undefined) ?? "pendente";


  // Tempo atual baseado no ciclo escolar: durante intervalo/fim do turno, mantém o último tempo iniciado.
  const currentPeriod = useMemo(() => {
    return currentSchoolPeriod(periods, shift, now);
  }, [periods, now, shift]);


  // Quando o tempo atual muda (mudança de período), força reload imediato — sem esperar 30s.
  useEffect(() => {
    if (currentPeriod?.id && currentPeriod.id !== lastPeriodIdRef.current) {
      lastPeriodIdRef.current = currentPeriod.id;
      load();
    }
  }, [currentPeriod?.id, load]);



  function extractGrade(className: string | null): number {
    if (!className) return Infinity;
    const lower = className.toLowerCase();
    const numMatch = className.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : NaN;
    if (Number.isNaN(num)) return Infinity;
    const isMedio = /m[eé]dio|em\b|ensino m[eé]dio/.test(lower);
    if (isMedio) return num + 10; // 1→11, 2→12, 3→13
    return num; // 6,7,8,9...
  }

  // Mostra TODOS os professores do dia (fixos), destacando o tempo atual.
  // Quando não estiver no modo "ver todos", filtra somente o período atual (rotaciona automaticamente).
  const rows = useMemo(() => {
    const sorted = [...roster].sort((a, b) => {
      const timeCmp = a.start_time.localeCompare(b.start_time);
      if (timeCmp !== 0) return timeCmp;
      return extractGrade(a.class_name) - extractGrade(b.class_name)
        || (a.class_name ?? "").localeCompare(b.class_name ?? "");
    });
    if (viewAll) return sorted;
    if (!currentPeriod) return [];
    // Casa por period_id quando existe, senão por sobreposição de horário com o período atual
    const ps = currentPeriod.start_time;
    const pe = currentPeriod.end_time;
    // Mostra o professor se: o tempo dele cobre o período atual (aula geminada/seguida)
    // OU o period_id casa exatamente com o período atual.
    return sorted.filter((r) => {
      const overlaps = r.start_time < pe && r.end_time > ps;
      if (overlaps) return true;
      if (r.period_id && r.period_id === currentPeriod.id) return true;
      return false;
    });
  }, [roster, viewAll, currentPeriod]);

  const stats = useMemo(() => {
    const s = { presente: 0, ausente: 0, atrasado: 0, pendente: 0 };
    rows.forEach((r) => { s[getStatus(r.id)]++; });
    return s;
  }, [rows, presence]);

  // Auto-scroll suave: pausa no topo, desce devagar, pausa no fim, volta ao topo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    let raf = 0;
    let cancelled = false;
    const PIXELS_PER_SEC = 18;
    const PAUSE_TOP_MS = 4000;
    const PAUSE_BOTTOM_MS = 4000;
    const run = async () => {
      while (!cancelled) {
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 4) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        await new Promise((r) => setTimeout(r, PAUSE_TOP_MS));
        if (cancelled) return;
        let last = performance.now();
        await new Promise<void>((resolve) => {
          const step = (n: number) => {
            if (cancelled) return resolve();
            const dt = (n - last) / 1000; last = n;
            el.scrollTop = Math.min(el.scrollTop + PIXELS_PER_SEC * dt, max);
            if (el.scrollTop >= max - 0.5) return resolve();
            raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        });
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, PAUSE_BOTTOM_MS));
        if (cancelled) return;
        el.scrollTop = 0;
      }
    };
    run();
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [rows, viewAll, currentPeriod?.id]);

  const goFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(() => {
    if (!kioskMode) return;
    const enter = () => {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
        msRequestFullscreen?: () => Promise<void> | void;
      };
      if (document.fullscreenElement) return;
      try { (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el); } catch {}
    };
    document.addEventListener("click", enter, true);
    document.addEventListener("keydown", enter, true);
    document.addEventListener("touchstart", enter, true);
    // Atualização de dados é feita in-place pelo load()/realtime; não recarregar a página.
    return () => {
      document.removeEventListener("click", enter, true);
      document.removeEventListener("keydown", enter, true);
      document.removeEventListener("touchstart", enter, true);
    };

  }, [kioskMode]);

  if (!schoolId) {
    return (
      <div className="h-dvh w-screen bg-[hsl(230,25%,7%)] text-white flex flex-col items-center justify-center gap-3">
        <h1 className="text-2xl font-bold">Painel Inteligente Escolar</h1>
        <p className="text-white/60">Parâmetro "school" não informado na URL.</p>
        <p className="text-white/40 text-sm">Use: /painel-tv?school=ID_DA_ESCOLA</p>
        <button onClick={() => navigate("/home")} className="mt-3 px-6 py-2 rounded-xl bg-primary text-primary-foreground">Voltar</button>
      </div>
    );
  }

  return (
    <div className="painel-tv-root h-dvh w-screen bg-gradient-to-br from-[hsl(230,30%,8%)] via-[hsl(230,28%,10%)] to-[hsl(230,32%,6%)] text-white overflow-hidden flex flex-col">
      <style>{`
        @media (orientation: portrait) and (max-width: 1024px) {
          .painel-tv-root {
            width: 100dvh !important;
            height: 100dvw !important;
            transform: rotate(90deg) translateY(-100%);
            transform-origin: top left;
            position: fixed;
            top: 0;
            left: 0;
          }
        }
      `}</style>

      {/* Overlay: Faltou o dia todo */}
      {dayAbsentAlerts.length > 0 && (
        <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-[92vw]">
          <style>{`
            @keyframes tv-slide-in { from { transform: translateX(120%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
            @keyframes tv-pulse-ring { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7) } 50% { box-shadow: 0 0 0 14px rgba(239,68,68,0) } }
          `}</style>
          {dayAbsentAlerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border-2 border-red-300/80 bg-gradient-to-r from-red-600 to-red-700 px-5 py-3 shadow-2xl text-white"
              style={{ animation: "tv-slide-in .35s ease-out, tv-pulse-ring 1.6s ease-in-out infinite" }}
            >
              <div className="text-3xl">🚨</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-red-100">Falta do dia todo</div>
                <div className="text-lg md:text-xl font-black leading-tight break-words">{a.name}</div>
                <div className="text-xs text-red-100/90">Tempos restantes marcados como ausente automaticamente</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header compacto + stats inline */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 sm:px-4 md:px-6 py-2 md:py-3 bg-black/30 border-b border-white/10 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 basis-[260px]">
          {school?.logo_url && (
            <img src={school.logo_url} alt="" className="h-10 w-10 md:h-14 md:w-14 rounded-lg object-cover border border-white/20 shrink-0" />
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-2xl font-black tracking-tight uppercase leading-tight break-words line-clamp-2">{school?.name || "Carregando..."}</h1>
            <p className="text-white/70 text-[10px] sm:text-xs md:text-sm font-bold uppercase tracking-widest mt-0.5">
              {shift} {currentPeriod && <>· {currentPeriod.label}</>}
            </p>
          </div>
        </div>

        <div className="text-center shrink-0">
          <p className="text-2xl md:text-4xl font-black tabular-nums tracking-tight text-primary leading-none">
            {format(now, "HH:mm")}<span className="text-xs md:text-base text-primary/50">:{format(now, "ss")}</span>
          </p>
        </div>

        <div className="flex items-end gap-1.5 md:gap-2 shrink-0 ml-auto flex-wrap justify-end">
          {/* Tamanho dos caracteres + data */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex flex-nowrap items-center gap-1 h-8 md:h-10 pb-1 px-1.5 rounded-xl bg-white/10 border border-white/15">

              <button
                onClick={() => { setAutoFit(false); setUiScale((v) => Math.max(50, v - 5)); }}
                title="Diminuir tamanho da fonte"
                aria-label="Diminuir tamanho da fonte"
                className="h-6 w-7 md:h-7 md:w-8 shrink-0 rounded-lg bg-white/10 hover:bg-white/25 text-white font-black leading-none"
              >
                A-
              </button>
              <span className="text-[10px] md:text-xs font-black tabular-nums text-white/80 w-9 shrink-0 text-center">{uiScale}%</span>
              <button
                onClick={() => { setAutoFit(false); setUiScale((v) => Math.min(130, v + 5)); }}
                title="Aumentar tamanho da fonte"
                aria-label="Aumentar tamanho da fonte"
                className="h-6 w-7 md:h-7 md:w-8 shrink-0 rounded-lg bg-white/10 hover:bg-white/25 text-white font-black leading-none"
              >
                A+
              </button>
              <button
                onClick={() => setAutoFit((v) => !v)}
                title="Ajuste automático para caber na tela da TV"
                aria-label="Ajuste automático"
                className={`h-6 md:h-7 px-2 shrink-0 rounded-lg text-[9px] md:text-[10px] font-black uppercase border ${autoFit ? "bg-emerald-500/25 border-emerald-300/60 text-emerald-200" : "bg-white/5 border-white/10 text-white/60"}`}
              >
                Auto
              </button>
              <button
                onClick={() => { setAutoFit(false); setUiScale(100); }}
                title="Restaurar tamanho padrão"
                aria-label="Restaurar tamanho padrão"
                className="h-6 md:h-7 px-2 shrink-0 rounded-lg bg-white/5 hover:bg-white/20 text-white/70 text-[9px] md:text-[10px] font-bold uppercase"
              >
                Reset
              </button>

              <button
                onClick={() => window.location.reload()}
                title="Forçar atualização do painel"
                aria-label="Forçar atualização"
                className="h-6 w-9 md:h-7 md:w-11 shrink-0 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 text-white flex items-center justify-center transition"
              >
                <RefreshCw className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>

            <div className="w-full h-6 md:h-8 flex items-center justify-center text-xs md:text-sm font-black text-white/70 uppercase tracking-wider text-center leading-none whitespace-nowrap">
              {format(now, "EEEE · dd/MM/yyyy", { locale: ptBR }).toUpperCase()}
            </div>
          </div>
          {(["presente", "atrasado", "ausente", "pendente"] as Status[]).map((k) => {
            const s = STATUS_STYLE[k];
            return (
              <div key={k} className={`rounded-xl px-2 md:px-3 py-1.5 md:py-3 ${s.bg} border border-white/10 flex flex-col items-center justify-center gap-0.5 md:gap-1 min-w-[56px] md:min-w-[68px]`}>
                <span className={`text-[10px] md:text-sm font-black uppercase tracking-wider ${s.text} leading-none`}>{s.label}</span>
                <div className="flex items-center gap-1 md:gap-1.5">
                  <span className={`h-2 w-2 md:h-3 md:w-3 rounded-full ${s.dot}`} />
                  <span className={`text-xl md:text-3xl font-black ${s.text} leading-none tabular-nums`}>{stats[k]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </header>

      {/* Table */}
      <main className="flex-1 overflow-hidden px-4 py-2">
        <div className="h-full rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden flex flex-col">
          <div className={`grid ${gridCols} gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-white/[0.05] border-b border-white/[0.06] text-xs sm:text-sm md:text-lg font-black uppercase tracking-wider text-white/80 shrink-0`}>
            <div className="min-w-0 truncate">Horário</div>
            <div className="min-w-0 truncate">Turma</div>
            {!compactCols && <div className="min-w-0 truncate">Disciplina</div>}
            <div className="min-w-0 truncate">Professor</div>
            {!compactCols && <div className="min-w-0 truncate text-center">Sala Bloco</div>}
            <div className="min-w-0 truncate">Status</div>
            <div className="min-w-0 truncate">Substituição</div>
          </div>


          <div ref={scrollRef} className="flex-1 overflow-auto scroll-smooth">
            {rows.length === 0 && (
              <div className="h-full flex items-center justify-center text-white/40 text-base md:text-xl px-4 text-center">
                {viewAll ? "Nenhum professor cadastrado para hoje" : (currentPeriod ? `Nenhum professor neste horário (${currentPeriod.label})` : "Aguardando próximo horário…")}
              </div>
            )}
            {rows.map((r, idx) => {
              const st = getStatus(r.id);
              const s = STATUS_STYLE[st];
              const isCurrent = !!currentPeriod && (
                (r.start_time < currentPeriod.end_time && r.end_time > currentPeriod.start_time)
                || (!!r.period_id && r.period_id === currentPeriod.id)
              );
              return (
                <div
                  key={r.id}
                  className={`grid ${gridCols} gap-2 md:gap-3 items-center px-3 md:px-4 py-1.5 border-b border-white/[0.04] ${idx % 2 === 0 ? "bg-white/[0.01]" : "bg-white/[0.025]"} ${isCurrent ? "ring-1 ring-inset ring-amber-300/25 bg-amber-400/[0.04]" : ""}`}
                >
                  <div className="min-w-0 font-mono text-sm sm:text-base md:text-2xl font-bold tracking-tight text-white/95 tabular-nums break-words">
                    {r.start_time.slice(0, 5)} <span className="text-white/40">às</span> {r.end_time.slice(0, 5)}
                  </div>
                  <div className="min-w-0 text-sm sm:text-base md:text-2xl font-black text-green-400 break-words">{r.class_name ?? "—"}</div>
                  {!compactCols && (
                    <div className="min-w-0 text-sm sm:text-base md:text-2xl text-white/85 break-words">{r.discipline ?? "—"}</div>
                  )}
                  <div className="min-w-0 text-sm sm:text-base md:text-2xl font-bold text-white break-words">
                    {shortName(r.teacher_name, r.nickname)}
                    {compactCols && (
                      <span className="block text-[0.65em] font-semibold text-white/60 break-words">
                        {r.discipline ?? "—"}
                        {r.room_name ? ` · Sala ${r.room_name}` : ""}
                        {r.block_name ? ` · Bl. ${r.block_name}` : ""}
                      </span>
                    )}
                  </div>
                  {!compactCols && (
                    <div className="min-w-0 text-xs sm:text-sm md:text-xl text-white/70 break-words text-center">
                      {r.room_name ? `Sala ${r.room_name}` : "—"}{r.block_name ? ` · Bl. ${r.block_name}` : ""}
                    </div>
                  )}

                  <div className="flex items-center gap-1 md:gap-1.5 min-w-0">
                    <span className={`h-2.5 w-2.5 md:h-3.5 md:w-3.5 rounded-full ${s.dot} shrink-0`} />
                    <span className={`text-xs sm:text-sm md:text-lg font-black tracking-wider ${s.text} truncate`}>{s.label}</span>
                  </div>

                  {(() => {
                    const info = currentPeriod ? extras[`${r.id}:${currentPeriod.period_number}`] : undefined;
                    // Professor presente → sem substituição
                    if (st === "presente") {
                      return <div className="text-xs sm:text-sm md:text-xl text-white/40">—</div>;
                    }
                    // Ausente sem info registrada → PENDENTE
                    if (!info) {
                      if (st === "ausente") {
                        return (
                          <div className="text-xs sm:text-sm md:text-xl font-black text-amber-300/90 break-words tracking-wide">
                            PENDENTE
                          </div>
                        );
                      }
                      return <div />;
                    }
                    if (info.kind === "extra") {
                      return (
                        <div className="text-xs sm:text-sm md:text-xl font-black text-sky-400 break-words tracking-wide uppercase">
                          Ativ. Extra Classe / {info.location}
                        </div>
                      );
                    }
                    if (info.kind === "self") {
                      return (
                        <div className="text-xs sm:text-sm md:text-xl font-black text-violet-300 break-words tracking-wide">
                          Prof. {info.teacher}
                          {info.discipline ? <span className="text-violet-200/80"> / {info.discipline}</span> : null}
                        </div>
                      );
                    }
                    return (
                      <div className="text-xs sm:text-sm md:text-xl font-black text-emerald-400 break-words tracking-wide">
                        Prof. {info.teacher}
                        {info.discipline ? <span className="text-emerald-300/80"> / {info.discipline}</span> : null}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Controle de simulação de data (preview) */}
      {previewMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-black/85 backdrop-blur border-2 border-amber-400 rounded-xl px-4 py-3 text-white text-sm shadow-2xl">
          <span className="font-bold uppercase tracking-wider text-amber-300">Preview</span>
          <label className="flex items-center gap-1">
            <span className="text-white/70">Data:</span>
            <input
              type="date"
              value={dateParam ?? format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.value) next.set("date", e.target.value);
                else next.delete("date");
                setSearchParams(next, { replace: true });
              }}
              className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-white"
            />
          </label>
          {dateParam && (
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("date");
                setSearchParams(next, { replace: true });
              }}
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 font-semibold"
            >
              Hoje
            </button>
          )}
          <span className="text-white/60">
            {simDate ? format(simDate, "EEE dd/MM", { locale: ptBR }) : format(new Date(), "EEE dd/MM", { locale: ptBR })}
          </span>
          <span className="text-white/60">· 🎂 {aniversariantes.length}</span>
        </div>
      )}

      {/* Faixa de Aniversariantes */}

      {showAniv && aniversariantes.length > 0 && (() => {
        const a = aniversariantes[anivIdx];
        const initials = (a.nome ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("");
        return (
          <div className="px-3 md:px-6 py-2 md:py-3 bg-gradient-to-r from-pink-600/30 via-fuchsia-500/25 to-amber-400/30 border-t border-white/15 shrink-0">
            <div className="flex items-center gap-3 md:gap-5 max-w-6xl mx-auto">
              <div className="text-2xl md:text-4xl shrink-0">🎂</div>
              {a.foto_url ? (
                <img src={a.foto_url} alt="" className="h-10 w-10 md:h-14 md:w-14 rounded-full object-cover border-2 border-white/40 shrink-0" />
              ) : (
                <div className="h-10 w-10 md:h-14 md:w-14 rounded-full bg-white/15 border-2 border-white/40 flex items-center justify-center font-black text-white text-sm md:text-lg shrink-0">
                  {initials || "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/80">
                  Feliz Aniversário {aniversariantes.length > 1 && (<span className="text-white/60">· {anivIdx + 1}/{aniversariantes.length}</span>)}
                </div>
                <div className="text-lg md:text-3xl font-black text-white break-words leading-tight">{a.nome}</div>
                <div className="text-xs md:text-base text-white/85 font-semibold break-words">
                  {[a.cargo, a.setor].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <div className="text-2xl md:text-4xl font-black text-white tabular-nums leading-none">{String(a.dia).padStart(2, "0")}/{String(a.mes).padStart(2, "0")}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="px-4 md:px-6 py-1.5 md:py-2 bg-black/40 border-t border-white/10 shrink-0">

        <div className="flex flex-wrap items-center justify-center gap-x-3 md:gap-x-6 gap-y-1 text-[10px] sm:text-xs md:text-sm font-semibold text-white/70 uppercase tracking-wider">
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-amber-400" />
            <span>Pendente <span className="text-white/50 normal-case">(ausente sem cobertura)</span></span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-sky-400" />
            <span>Ativ. Extra Classe</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-violet-400" />
            <span>Professor <span className="text-white/50 normal-case">(cobriu próprio horário)</span></span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-emerald-400" />
            <span>Professor Substituto</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-2 bg-black/30 border-t border-white/10 flex items-center justify-between text-white/60 text-sm font-semibold shrink-0">
        <span>{kioskMode && tvSystem ? `${tvSystem.toUpperCase()} · ` : ""}{viewAll ? `Quadro fixo · ${rows.length} aulas hoje` : (currentPeriod ? `Horário atual: ${currentPeriod.label} · ${rows.length} professor(es)` : "Aguardando próximo horário…")}</span>
        <span>Atualizado: {format(lastRefresh, "HH:mm:ss")}</span>
      </footer>

      {/* Floating controls */}
      <button
        onClick={() => navigate("/home")}
        className="fixed top-3 left-3 z-50 p-2 rounded-full bg-white/5 hover:bg-white/15 transition opacity-30 hover:opacity-100"
        title="Voltar"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        onClick={goFullscreen}
        className="fixed bottom-3 right-3 z-50 p-2 rounded-full bg-white/5 hover:bg-white/15 transition opacity-30 hover:opacity-100"
        title="Tela cheia"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}
