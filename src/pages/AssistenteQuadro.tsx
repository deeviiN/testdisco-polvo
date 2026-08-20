import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Plus, Pencil, Trash2, Check, X, Clock, ArrowLeft, Search,
  ArrowRightLeft, Eye, Sun, Sunset, Moon, AlertTriangle, Settings,
  Bell, BellOff, Info, Maximize2, LogOut,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateSchedulePeriods } from "@/lib/schedulePeriodsValidation";
import { claimSirenFire } from "@/lib/sirenDedupe";
import { clockShift, currentSchoolPeriod, schoolTimeShift } from "@/lib/schoolShift";
import silvoLongoAsset from "@/assets/sirens/silvo-longo.mp3.asset.json";
import silvoCurtoAsset from "@/assets/sirens/silvo-curto.mp3.asset.json";
import campainhaLongoAsset from "@/assets/sirens/campainha-longo.mp3.asset.json";
import campainhaCurtoAsset from "@/assets/sirens/campainha-curto.mp3.asset.json";
import RemanejamentoModal from "@/components/RemanejamentoModal";
import { resolveMyShift, filterTransferAssistants, buildTransferRoster } from "@/lib/transferScope";


type SirenKind = "alarme" | "campainha";
type SchoolSirenSettings = {
  enabled: boolean;
  siren_kind: SirenKind;
  short_seconds: number;
  long_seconds: number;
};
const SIREN_SRC: Record<SirenKind, { short: string | null; long: string | null }> = {
  alarme: { short: silvoCurtoAsset.url, long: silvoLongoAsset.url },
  campainha: { short: campainhaCurtoAsset.url, long: campainhaLongoAsset.url },
};
function normalizeSirenKind(v: any): SirenKind {
  return v === "campainha" ? "campainha" : "alarme";
}



type Shift = "manha" | "tarde" | "noite";

type SirenAt = "none" | "short" | "long";
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
  school_id: string;
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
  assistant_user_id: string;
  original_assistant_user_id?: string | null;
};

/** Exibe apelido (se houver) ou primeiro+sobrenome do nome completo. */
function displayName(fullName: string, nickname?: string | null): string {
  const nick = (nickname ?? "").trim();
  if (nick) return nick;
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

type Status = "presente" | "ausente" | "atrasado" | "pendente";

const SHIFT_LABEL: Record<Shift, string> = { manha: "MANHÃ", tarde: "TARDE", noite: "NOITE" };
const SHIFT_ICON: Record<Shift, any> = { manha: Sun, tarde: Sunset, noite: Moon };

function normalizeShift(value: string | null | undefined): Shift {
  const v = (value ?? "").toLowerCase().trim();
  if (v === "vespertino" || v === "tarde") return "tarde";
  if (v === "noturno" || v === "noite") return "noite";
  return "manha";
}

function normalizeClassLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function time5(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}

const DEFAULT_PERIODS: Record<Shift, { n: number; start: string; end: string; label: string }[]> = {
  manha: [
    { n: 1, start: "07:00", end: "07:55", label: "1º Tempo" },
    { n: 2, start: "07:55", end: "08:50", label: "2º Tempo" },
    { n: 3, start: "09:10", end: "10:05", label: "3º Tempo" },
    { n: 4, start: "10:05", end: "11:00", label: "4º Tempo" },
    { n: 5, start: "11:00", end: "11:55", label: "5º Tempo" },
  ],
  tarde: [
    { n: 1, start: "13:00", end: "13:55", label: "1º Tempo" },
    { n: 2, start: "13:55", end: "14:50", label: "2º Tempo" },
    { n: 3, start: "15:10", end: "16:05", label: "3º Tempo" },
    { n: 4, start: "16:05", end: "17:00", label: "4º Tempo" },
    { n: 5, start: "17:00", end: "17:55", label: "5º Tempo" },
  ],
  noite: [
    { n: 1, start: "19:00", end: "19:55", label: "1º Tempo" },
    { n: 2, start: "19:55", end: "20:50", label: "2º Tempo" },
    { n: 3, start: "21:00", end: "21:55", label: "3º Tempo" },
    { n: 4, start: "21:55", end: "22:50", label: "4º Tempo" },
  ],
};

function makeDefaultPeriods(schoolId: string): Period[] {
  return (Object.keys(DEFAULT_PERIODS) as Shift[]).flatMap((sh) =>
    DEFAULT_PERIODS[sh].map((p) => ({
      id: `default-${sh}-${p.n}`,
      school_id: schoolId,
      shift: sh,
      period_number: p.n,
      label: p.label,
      start_time: p.start,
      end_time: p.end,
    })),
  );
}

const STATUS_OPTS: { v: Status; label: string; cls: string; dim: string; ready: string; glow: string; icon: any }[] = [
  { v: "presente", label: "Presente", cls: "bg-blue-500 text-white border-2 border-blue-300",       dim: "bg-slate-500/50 text-white/80",    ready: "bg-blue-500/25 text-blue-50 border border-blue-300/40",       glow: "shadow-[0_0_12px_3px_rgba(59,130,246,0.45)] ring-2 ring-blue-200/70",   icon: Check },
  { v: "ausente",  label: "Ausente",  cls: "bg-red-600 text-white border-2 border-red-300",         dim: "bg-slate-500/50 text-white/80",    ready: "bg-red-500/25 text-red-50 border border-red-300/40",           glow: "shadow-[0_0_12px_3px_rgba(220,38,38,0.45)] ring-2 ring-red-200/70",     icon: X },
  { v: "atrasado", label: "Atrasado", cls: "bg-yellow-400 text-[#0A2A66] border-2 border-yellow-200", dim: "bg-slate-500/50 text-white/80",  ready: "bg-yellow-400/25 text-yellow-50 border border-yellow-200/40",  glow: "shadow-[0_0_12px_3px_rgba(250,204,21,0.45)] ring-2 ring-yellow-200/70",  icon: Clock },
];


const STATUS_COLOR: Record<Status, string> = {
  presente: "bg-blue-500",
  ausente:  "bg-red-500",
  atrasado: "bg-amber-500",
  pendente: "bg-slate-400",
};

type Level = "fundamental" | "medio" | "eja";
const LEVEL_LABEL: Record<Level, string> = { fundamental: "Fundamental", medio: "Médio", eja: "EJA" };
const SERIES_BY_LEVEL: Record<Level, number[]> = {
  fundamental: [6, 7, 8, 9],
  medio: [1, 2, 3],
  eja: [1, 2, 3],
};
const DISC_FUND = [
  "Língua Portuguesa", "Matemática", "Ciências", "História", "Geografia",
  "Arte", "Educação Física", "Ensino Religioso", "Língua Inglesa", "Redação",
];
const DISC_MED = [
  "Língua Portuguesa", "Matemática", "Física", "Química", "Biologia",
  "História", "Geografia", "Filosofia", "Sociologia", "Língua Inglesa",
  "Língua Espanhola", "Arte", "Educação Física", "Redação", "Literatura",
];
const DISC_EJA = [...DISC_MED, "Mundo do Trabalho", "Estudos Sociais"];
const DISC_BY_LEVEL: Record<Level, string[]> = {
  fundamental: DISC_FUND, medio: DISC_MED, eja: DISC_EJA,
};

/** Extrai a série (1º dígito) e o resto como turma a partir do texto digitado. */
function parseClassName(level: Level, raw: string): { series: number | null; turma: string } {
  const t = raw.replace(/^\s+/, "");
  const m = t.match(/^(\d)\s*º?\s*(?:ano)?\s*[-·.]?\s*(.*)$/i);
  if (!m) return { series: null, turma: raw };
  const d = parseInt(m[1], 10);
  if (!SERIES_BY_LEVEL[level].includes(d)) return { series: null, turma: raw };
  return { series: d, turma: m[2] };
}

/** Tenta inferir nível a partir de uma turma já gravada (ex.: "7 A" → fundamental). */
function inferLevel(className: string | null): Level {
  if (!className) return "fundamental";
  const m = className.match(/^\s*(\d)/);
  if (!m) return "fundamental";
  const d = parseInt(m[1], 10);
  if ([6, 7, 8, 9].includes(d)) return "fundamental";
  if ([1, 2, 3].includes(d)) return "medio";
  return "fundamental";
}

/** Formata nome da turma: "102" → "1º / 102", "7 A" → "7º / 7 A". */
function formatClassDisplay(className: string | null): string {
  if (!className) return "";
  const t = className.trim();
  if (!t) return "";
  const firstDigit = t.match(/^(\d)/);
  if (firstDigit) {
    return `${firstDigit[1]}º / ${t}`;
  }
  return t;
}

/**
 * Chave de ordenação crescente das turmas:
 * Fundamental primeiro (6º → 9º), depois Médio (1º → 3º).
 * Suporta "61", "62", "101", "201" e também "6 A", "7 B", "1 A".
 */
function classSortKey(name: string | null): [number, number, string] {
  if (!name) return [9, 9999, ""];
  const t = name.trim();
  const m = t.match(/^(\d+)\s*(.*)$/);
  if (!m) return [9, 9999, t];
  const num = parseInt(m[1], 10);
  const rest = (m[2] || "").trim();
  // Códigos: 61..99 (fund), 101..399 (médio), 6..9 (fund), 1..3 (médio).
  let group = 0;
  let series = num;
  if (num >= 100 && num < 1000) { group = 1; series = num; }
  else if (num >= 10) { group = 0; series = num; }
  else if (num >= 6 && num <= 9) { group = 0; series = num * 10; }
  else if (num >= 1 && num <= 3) { group = 1; series = num * 100; }
  return [group, series, rest];
}

function compareClassNames(a: string | null, b: string | null): number {
  const ka = classSortKey(a);
  const kb = classSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2], "pt-BR");
}

function currentShift(date = new Date()): Shift {
  return clockShift(date);
}

const WEEKDAY_SHORT = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const WEEKDAY_LONG  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

export default function AssistenteQuadro() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const canManageRoster = ["coord_pedagogico","coordenador_pedagogico","gestor_pedagogico","chef_projeto_vida","supervisor","admin"]
    .includes(profile?.role ?? "");
  // Marcação de presença é exclusiva do(a) Assistente de Alunos (e admin).
  // Coordenação/Gestão NÃO podem alterar o status marcado pelo assistente.
  // "Assistente de aluno" não é uma role separada no banco — são professores (role "teacher")
  // designados como assistente via teacher_roster.assistant_user_id. Portanto liberamos
  // teacher aqui e a checagem por linha (resolveAssistantId === profile.user_id) restringe
  // para apenas as salas dele. Coordenação/gestão marca via canManageRoster.
  const canMarkPresence = ["teacher","professor","assistente_alunos","assistente","secretario_escolar","admin"].includes(profile?.role ?? "");
  // Transferir responsabilidade é função exclusiva do Assistente de Aluno (e admin).
  const canTransferResponsibility = ["teacher","professor","assistente_alunos","assistente","secretario_escolar","admin"].includes(profile?.role ?? "");
  const [now, setNow] = useState(new Date());
  const today = format(now, "yyyy-MM-dd");
  const [weekday, setWeekday] = useState<number>(now.getDay());


  const [shift, setShift] = useState<Shift>(currentShift());
  const [periods, setPeriods] = useState<Period[]>([]);
  const [tolerance, setTolerance] = useState<{ manha: number; tarde: number; noite: number }>({ manha: 15, tarde: 15, noite: 15 });
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [allRoster, setAllRoster] = useState<Roster[]>([]);
  const [presence, setPresence] = useState<Record<string, Status>>({});
  // Mapa de atividade extra classe do dia: `${roster_id}:${period_number}` -> local
  const [extraByKey, setExtraByKey] = useState<Record<string, string>>({});
  // Mapa de substituição por professor: `${roster_id}:${period_number}` -> nome do substituto
  const [subByKey, setSubByKey] = useState<Record<string, string>>({});
  const [busyCoveringTeacherKeys, setBusyCoveringTeacherKeys] = useState<Set<string>>(new Set());
  const [dayAbsentNames, setDayAbsentNames] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  const [showTransfer, setShowTransfer] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPeriodConfig, setShowPeriodConfig] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedToTransfer, setSelectedToTransfer] = useState<Set<string>>(new Set());
  const [assistants, setAssistants] = useState<{ user_id: string; full_name: string }[]>([]);
  const [classAssignments, setClassAssignments] = useState<{ assistant_user_id: string; class_label: string; shift: string | null }[]>([]);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [showTeacherPicker, setShowTeacherPicker] = useState(false);
  const [teacherOptions, setTeacherOptions] = useState<{ user_id: string; full_name: string }[]>([]);
  const [teacherPickerQuery, setTeacherPickerQuery] = useState("");

  // Modal de remanejamento rápido (aberto quando o assistente marca AUSENTE)
  const [reassignFor, setReassignFor] = useState<{ roster: Roster; period: Period } | null>(null);


  const [form, setForm] = useState({
    teacher_name: "",
    nickname: "",
    level: "fundamental" as Level,
    discipline: "",
    class_name: "",
    block_name: "A",
    room_name: "",
    shift: currentShift() as Shift,
    period_number: 1,
    period_id: "",
    period_ids: [] as string[],
    weekday: now.getDay(),
  });

  // Offset entre relógio do servidor e o relógio local (ms). Garante que o
  // travamento do período use a hora oficial e não sofra com fuso/clock local.
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const syncResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncServerClock = useCallback(async () => {
    try {
      const t0 = Date.now();
      const { data, error } = await (supabase as any).rpc("get_server_time");
      const t1 = Date.now();
      if (!error && data) {
        const serverMs = new Date(data as string).getTime();
        if (!isNaN(serverMs)) {
          const rttHalf = Math.floor((t1 - t0) / 2);
          setServerOffsetMs(serverMs - (t0 + rttHalf));
        }
      }
    } catch { /* ignora */ }
  }, []);
  useEffect(() => {
    syncServerClock();
    const re = setInterval(syncServerClock, 5 * 60 * 1000);
    return () => clearInterval(re);
  }, [syncServerClock]);
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + serverOffsetMs));
    const t = setInterval(tick, 1000);
    // Atualiza imediatamente ao voltar para a aba/janela (timers ficam throttled em background)
    const refresh = () => {
      tick();
      setWeekday(new Date(Date.now() + serverOffsetMs).getDay());
      syncServerClock();
    };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [serverOffsetMs, syncServerClock]);

  // Override manual: bloqueia auto-snap por 10s após o usuário tocar/interagir.
  // Enquanto o dedo está na tela (mesmo parado), o ref é renovado continuamente,
  // então a tela só "volta" pro tempo automático depois de 10s sem interação.
  const manualSelectAtRef = useRef<number>(0);
  const touchActiveRef = useRef<number>(0);
  const MANUAL_HOLD_MS = 5000;
  useEffect(() => {
    // O hold manual é renovado apenas pelos cliques nos botões de turno/dia/tempo
    // (ver onClick mais abaixo). Scroll/wheel/pointermove NÃO contam como interação,
    // senão a página nunca pula automaticamente para o tempo real.
    const onTouchStart = (e: TouchEvent) => {
      touchActiveRef.current = e.touches?.length ?? 1;
    };
    const onTouchEnd = (e: TouchEvent) => {
      touchActiveRef.current = e.touches?.length ?? 0;
    };
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("touchstart", onTouchStart, opts);
    window.addEventListener("touchend", onTouchEnd, opts);
    window.addEventListener("touchcancel", onTouchEnd, opts);
    return () => {
      window.removeEventListener("touchstart", onTouchStart, opts);
      window.removeEventListener("touchend", onTouchEnd, opts);
      window.removeEventListener("touchcancel", onTouchEnd, opts);
    };
  }, []);


  // Sirene escolar (facultativa) — toca ao trocar de tempo automaticamente
  const [sirenEnabled, setSirenEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("assistente:siren") === "1"; } catch { return false; }
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenStopRef = useRef<(() => void) | null>(null);
  const lastRealPeriodRef = useRef<string | null>(null);
  const sirenInitRef = useRef<boolean>(false);

  const toggleSiren = useCallback(() => {
    setSirenEnabled((v) => {
      const nv = !v;
      try { localStorage.setItem("assistente:siren", nv ? "1" : "0"); } catch {}
      if (!nv) {
        sirenStopRef.current?.();
        sirenStopRef.current = null;
      } else {
        // "destrava" o áudio do navegador no gesto do usuário
        try {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
          audioCtxRef.current?.resume().catch(() => {});
        } catch {}
        toast({ title: "Sirene ativada", description: "Tocará automaticamente ao trocar de tempo." });
      }
      return nv;
    });
  }, []);

  // (sirene sintetizada antiga removida — agora usa MP3 do gestor)

  // ============================================================
  // Alerta de "Tolerância encerrada" — dispara som + modal quando
  // o prazo de tolerância do tempo atual acaba (professor deve
  // estar em sala; assistente já pode marcar status).
  // ============================================================
  const [toleranceAlert, setToleranceAlert] = useState<{
    key: string;
    periodLabel: string;
    shift: Shift;
    time: string;
    tol: number;
  } | null>(null);
  const alertFiredRef = useRef<Set<string>>(new Set());
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);

  const playToleranceChime = useCallback(() => {
    // 1) Toca MP3 curto (mesmo asset da sirene curta – som moderno já usado)
    try {
      let a = alertAudioRef.current;
      if (!a) { a = new Audio(); alertAudioRef.current = a; }
      a.src = silvoCurtoAsset.url;
      a.volume = 1;
      a.currentTime = 0;
      a.play().catch(() => {
        // Se autoplay bloqueado, tenta com AudioContext (bipe agradável 2 notas)
        try {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          if (!Ctx) return;
          const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
          audioCtxRef.current = ctx;
          if (ctx.state === "suspended") ctx.resume().catch(() => {});
          const chime = (freq: number, at: number, dur = 0.35) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + at);
            osc.stop(ctx.currentTime + at + dur + 0.05);
          };
          chime(880, 0);     // Lá5
          chime(1174.66, 0.25); // Ré6 — acorde ascendente suave
          chime(1318.51, 0.5);  // Mi6
        } catch { /* noop */ }
      });
    } catch { /* noop */ }
    try { navigator.vibrate?.([250, 120, 250, 120, 450]); } catch { /* noop */ }
  }, []);

  // (efeito de detecção de tolerância movido para depois da declaração de currentPeriod)




  // Mantém o dia da semana sincronizado com hoje quando o relógio vira de dia
  useEffect(() => {
    setWeekday(now.getDay());
  }, [today]);


  // Carrega ou cria tempos default
  const loadPeriods = useCallback(async () => {
    if (!profile?.school_id) return;
    const { data, error } = await supabase
      .from("schedule_periods")
      .select("*")
      .eq("school_id", profile.school_id)
      .order("shift").order("period_number");
    if (error) {
      setPeriods((prev) => prev.length > 0 ? prev : makeDefaultPeriods(profile.school_id));
      return;
    }
    let list = (data ?? []) as Period[];
    if (list.length === 0) {
      setPeriods(makeDefaultPeriods(profile.school_id));
      return;
    }
    // Sobrescrever com "tempo reduzido do dia" quando houver
    const todayStr = today;
    const { data: red } = await supabase
      .from("schedule_reduced_days")
      .select("*")
      .eq("school_id", profile.school_id)
      .eq("reduced_date", todayStr);
    if (red && red.length > 0) {
      const key = (s: string, n: number) => `${s}-${n}`;
      const overrides = new Map<string, any>();
      red.forEach((r: any) => overrides.set(key(r.shift, r.period_number), r));
      list = list.map((p) => {
        const ov = overrides.get(key(p.shift, p.period_number));
        return ov ? {
          ...p,
          start_time: ov.start_time, end_time: ov.end_time, label: ov.label,
          start_siren: ov.start_siren ?? p.start_siren,
          end_siren: ov.end_siren ?? p.end_siren,
        } : p;
      });
    }

    setPeriods(list);
  }, [profile?.school_id, canManageRoster, today]);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    const { data: r } = await supabase
      .from("teacher_roster")
      .select("*")
      .eq("school_id", profile.school_id)
      .eq("weekday", weekday)
      .order("start_time");
    setAllRoster((r ?? []) as Roster[]);

    const { data: p } = await supabase
      .from("teacher_roster_presence")
      .select("roster_id,status,period_number")
      .eq("school_id", profile.school_id)
      .eq("presence_date", today);
    const m: Record<string, Status> = {};
    (p ?? []).forEach((x: any) => { m[`${x.roster_id}:${x.period_number}`] = x.status; });
    setPresence(m);

    const { data: rr } = await supabase
      .from("room_reassignments" as any)
      .select("absent_roster_id,absent_period_number,covering_roster_id,covering_teacher_name,note,reason,cancelled_at")
      .eq("school_id", profile.school_id)
      .eq("reassignment_date", today);
    const em: Record<string, string> = {};
    const sm: Record<string, string> = {};
    const busyKeys = new Set<string>();
    (rr ?? []).forEach((x: any) => {
      if (x.cancelled_at) return;
      if (x.reason === "atividade_extra" && x.absent_roster_id) {
        em[`${x.absent_roster_id}:${x.absent_period_number}`] = x.note ?? "";
      } else if (x.absent_roster_id && x.covering_teacher_name) {
        sm[`${x.absent_roster_id}:${x.absent_period_number}`] = x.covering_teacher_name;
      }
      const name = (x.covering_teacher_name || "").trim().toLowerCase();
      if (x.covering_roster_id && name) busyKeys.add(name);
    });
    setExtraByKey(em);
    setSubByKey(sm);
    setBusyCoveringTeacherKeys(busyKeys);

    const { data: da } = await supabase
      .from("teacher_day_absence" as any)
      .select("teacher_name")
      .eq("school_id", profile.school_id)
      .eq("absence_date", today);
    setDayAbsentNames(new Set((da ?? []).map((x: any) => (x.teacher_name || "").trim().toLowerCase())));
  }, [profile?.school_id, weekday, today]);


  useEffect(() => { loadPeriods(); }, [loadPeriods]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!profile?.school_id) return;
    (async () => {
      const { data } = await supabase
        .from("roster_call_settings")
        .select("tolerance_manha,tolerance_tarde,tolerance_noite")
        .eq("school_id", profile.school_id)
        .maybeSingle();
      if (data) setTolerance({
        manha: (data as any).tolerance_manha ?? 15,
        tarde: (data as any).tolerance_tarde ?? 15,
        noite: (data as any).tolerance_noite ?? 15,
      });
    })();
  }, [profile?.school_id]);

  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase.channel(`assist-quadro-${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster_presence", filter: `school_id=eq.${profile.school_id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster", filter: `school_id=eq.${profile.school_id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_periods", filter: `school_id=eq.${profile.school_id}` }, () => { loadPeriods(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_reduced_days", filter: `school_id=eq.${profile.school_id}` }, () => { loadPeriods(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_reassignments", filter: `school_id=eq.${profile.school_id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id, load, loadPeriods]);

  // Canal de broadcast para o Painel TV — avisa na hora que uma presença mudou,
  // sem depender de RLS/postgres_changes (a TV pode estar sem login).
  const tvBroadcastRef = useRef<any>(null);
  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase.channel(`painel_tv_${profile.school_id}`);
    ch.subscribe();
    tvBroadcastRef.current = ch;
    return () => { tvBroadcastRef.current = null; supabase.removeChannel(ch); };
  }, [profile?.school_id]);

  useEffect(() => {
    if (!profile?.school_id) return;
    supabase.from("profiles")
      .select("user_id,full_name,role")
      .eq("school_id", profile.school_id)
      .eq("is_approved", true)
      .order("full_name")
      .then(({ data }) => {
        const list = (data ?? []).filter((p: any) =>
          p.role === "assistente_alunos" || p.role === "assistente" || p.role === "secretario_escolar"
        );
        setAssistants(list as any);
        const teachers = (data ?? []).filter((p: any) => p.role === "teacher" || p.role === "professor");
        setTeacherOptions(teachers as any);
      });
  }, [profile?.school_id]);


  const assistantNameById = useMemo(() => {
    const m: Record<string, string> = {};
    assistants.forEach((a) => { m[a.user_id] = a.full_name; });
    return m;
  }, [assistants]);

  // Carrega mapeamento de turmas atribuídas aos assistentes (assistant_classes).
  useEffect(() => {
    if (!profile?.school_id) return;
    const fetchAC = () => {
      supabase.from("assistant_classes")
        .select("assistant_user_id, class_label, shift")
        .eq("school_id", profile.school_id)
        .then(({ data }) => setClassAssignments((data as any[]) ?? []));
    };
    fetchAC();
    const ch = supabase
      .channel(`ac_${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assistant_classes", filter: `school_id=eq.${profile.school_id}` }, fetchAC)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id]);

  const resolveAssistantId = useCallback((r: { assistant_user_id?: string | null; class_name?: string | null; shift?: string | null }): string => {
    const cn = normalizeClassLabel(r.class_name);
    if (!cn) return "";
    const rs = normalizeShift(r.shift);
    const exact = classAssignments.find((c) => normalizeClassLabel(c.class_label) === cn && normalizeShift(c.shift) === rs);
    if (exact) return exact.assistant_user_id;
    const any = classAssignments.find((c) => normalizeClassLabel(c.class_label) === cn);
    return any?.assistant_user_id ?? r.assistant_user_id ?? "";
  }, [classAssignments]);

  // Paleta determinística por assistente — cada pessoa fica com uma cor fixa
  const ASSISTANT_BADGE_PALETTE = [
    { bg: "bg-amber-300",   text: "text-slate-900", ring: "ring-amber-500/60" },
    { bg: "bg-sky-400",     text: "text-slate-900", ring: "ring-sky-600/60" },
    { bg: "bg-rose-500",    text: "text-white",     ring: "ring-rose-700/60" },
    { bg: "bg-emerald-400", text: "text-slate-900", ring: "ring-emerald-600/60" },
    { bg: "bg-violet-500",  text: "text-white",     ring: "ring-violet-700/60" },
    { bg: "bg-orange-400",  text: "text-slate-900", ring: "ring-orange-600/60" },
    { bg: "bg-pink-500",    text: "text-white",     ring: "ring-pink-700/60" },
    { bg: "bg-teal-400",    text: "text-slate-900", ring: "ring-teal-600/60" },
  ];
  const assistantBadgeColor = useCallback((id: string) => {
    if (!id) return ASSISTANT_BADGE_PALETTE[0];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) >>> 0;
    return ASSISTANT_BADGE_PALETTE[h % ASSISTANT_BADGE_PALETTE.length];
  }, []);
  const shortAssistantName = (full: string) => {
    const parts = (full || "").trim().split(/\s+/);
    if (parts.length <= 2) return parts.join(" ");
    return `${parts[0]} ${parts[1]}`;
  };


  const shiftPeriods = useMemo(
    () => periods.filter((p) => p.shift === shift).sort((a, b) => a.period_number - b.period_number),
    [periods, shift],
  );


  useEffect(() => {
    if (shiftPeriods.length > 0 && !shiftPeriods.find((p) => p.period_number === selectedPeriod)) {
      setSelectedPeriod(shiftPeriods[0].period_number);
    }
  }, [shiftPeriods, selectedPeriod]);

  // Após MANUAL_HOLD_MS sem interação, volta turno/dia/tempo para os valores reais do relógio.
  useEffect(() => {
    if (Date.now() - manualSelectAtRef.current < MANUAL_HOLD_MS) return;
    const realShift = schoolTimeShift(periods, now, currentShift(now));
    const realWeekday = now.getDay();
    if (weekday !== realWeekday) setWeekday(realWeekday);
    if (shift !== realShift) setShift(realShift);
    // Avança o tempo selecionado conforme o relógio dentro do turno exibido,
    // independente de o turno exibido ser o real (assim a página vai pulando
    // de tempo em tempo automaticamente em qualquer turno aberto).
    if (periods.some((p) => p.shift === realShift)) {
      const target = currentSchoolPeriod(periods, realShift, now);
      if (target && target.period_number !== selectedPeriod) {
        setSelectedPeriod(target.period_number);
      }
    }
  }, [now, shift, weekday, periods, selectedPeriod]);

  // ===== Sirene automática vinculada ao quadro (config do gestor) =====
  const [schoolSiren, setSchoolSiren] = useState<SchoolSirenSettings | null>(null);
  const mp3Ref = useRef<HTMLAudioElement | null>(null);
  const mp3TimerRef = useRef<any>(null);
  const firedSirenRef = useRef<Set<string>>(new Set());
  const firedSirenDateRef = useRef<string>(today);

  useEffect(() => {
    if (!profile?.school_id) return;
    let alive = true;
    supabase.from("school_siren_settings").select("*").eq("school_id", profile.school_id).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        setSchoolSiren({
          enabled: !!data.enabled,
          siren_kind: normalizeSirenKind(data.siren_kind),
          short_seconds: data.short_seconds,
          long_seconds: data.long_seconds,
        });
      });
    const ch = supabase.channel(`siren-cfg-${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "school_siren_settings", filter: `school_id=eq.${profile.school_id}` }, (payload: any) => {
        const d = payload.new;
        if (d) setSchoolSiren({
          enabled: !!d.enabled, siren_kind: normalizeSirenKind(d.siren_kind),
          short_seconds: d.short_seconds, long_seconds: d.long_seconds,
        });
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [profile?.school_id]);

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

  // Eventos do dia: lê a configuração por tempo (start_siren/end_siren) que
  // o coordenador definiu em /gestor/horarios. Cada tempo decide se na sua
  // abertura toca curta, longa ou nada — e idem para o fim. Vale também
  // para o tempo reduzido do dia (mesmas colunas mescladas em loadPeriods).
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
      const fireKey = `${profile?.school_id ?? "school"}-${today}-${ev.key}-${ev.time}`;
      if (ev.time === nowHM && !firedSirenRef.current.has(fireKey)) {
        if (!claimSirenFire(fireKey)) continue;
        firedSirenRef.current.add(fireKey);
        const dur = ev.kind === "long" ? schoolSiren.long_seconds : schoolSiren.short_seconds;
        const src = ev.kind === "long" ? pack.long : pack.short;
        if (src) playMp3Siren(src, dur);
      }
    }
  }, [now, today, sirenEventsToday, schoolSiren, profile?.school_id, playMp3Siren]);





  const currentPeriod = shiftPeriods.find((p) => p.period_number === selectedPeriod);

  const myRoster = useMemo(
    () => allRoster.filter((r) => {
      if (!currentPeriod) return false;
      if (onlyMine && resolveAssistantId(r) !== profile?.user_id) return false;
      if (r.period_id) return r.period_id === currentPeriod.id;
      return normalizeShift(r.shift) === currentPeriod.shift
        && time5(r.start_time) === time5(currentPeriod.start_time);
    }).sort((a, b) => compareClassNames(a.class_name, b.class_name)),
    [allRoster, currentPeriod, onlyMine, profile?.user_id, resolveAssistantId],
  );

  // ===== Transferência de responsabilidade: escopo por turno =====
  // Turno do assistente logado (pelas turmas atribuídas a ele); fallback = turno em exibição.
  const myShift = useMemo(
    () => resolveMyShift(classAssignments as any, profile?.user_id, shift),
    [classAssignments, profile?.user_id, shift],
  );

  // Somente assistentes que atuam no mesmo turno
  const transferAssistants = useMemo(
    () => filterTransferAssistants(assistants as any, classAssignments as any, myShift, profile?.user_id),
    [assistants, classAssignments, myShift, profile?.user_id],
  );

  // Todas as aulas do turno: as minhas (livres) + as de outros (travadas)
  const transferRoster = useMemo(
    () => buildTransferRoster<Roster>(allRoster, periods as any, myShift, profile?.user_id, resolveAssistantId, compareClassNames),
    [allRoster, periods, myShift, resolveAssistantId, profile?.user_id],
  );


  const myTransferable = useMemo(
    () => transferRoster.filter((x) => x.ownerId === profile?.user_id).map((x) => x.r),
    [transferRoster, profile?.user_id],
  );




  const getStatus = (id: string): Status =>
    (currentPeriod ? presence[`${id}:${currentPeriod.period_number}`] : undefined) ?? "pendente";

  // Destaque amarelo após a tolerância se ainda pendente
  const isWarning = (r: Roster): boolean => {
    if (getStatus(r.id) !== "pendente") return false;
    if (!currentPeriod) return false;
    const [h, m] = currentPeriod.start_time.split(":").map(Number);
    const start = new Date(); start.setHours(h, m, 0, 0);
    const tol = tolerance[normalizeShift(currentPeriod.shift) as "manha" | "tarde" | "noite"] ?? 15;
    return (now.getTime() - start.getTime()) / 60000 >= tol;
  };

  // Detecta o exato momento em que a tolerância do tempo atual termina
  // → toca chime + abre modal para o assistente.
  useEffect(() => {
    if (!currentPeriod || !profile?.school_id) return;
    const shiftKey = normalizeShift(currentPeriod.shift) as Shift;
    const tol = tolerance[shiftKey] ?? 15;
    const [sh, sm] = currentPeriod.start_time.split(":").map(Number);
    const start = new Date(now);
    start.setHours(sh, sm, 0, 0);
    const unlockAt = new Date(start.getTime() + tol * 60000);
    const diffSec = (now.getTime() - unlockAt.getTime()) / 1000;
    if (diffSec < 0 || diffSec > 60) return;
    // só dispara se ainda há pendentes na turma do assistente
    const hasPendente = myRoster.some((r) => getStatus(r.id) === "pendente");
    if (!hasPendente) return;
    const key = `tol-alert:${profile.school_id}:${today}:${currentPeriod.id}`;
    if (alertFiredRef.current.has(key)) return;
    try {
      if (localStorage.getItem(key) === "1") {
        alertFiredRef.current.add(key);
        return;
      }
    } catch { /* noop */ }
    alertFiredRef.current.add(key);
    try { localStorage.setItem(key, "1"); } catch { /* noop */ }
    setToleranceAlert({
      key,
      periodLabel: currentPeriod.label || `${currentPeriod.period_number}º Tempo`,
      shift: shiftKey,
      time: format(unlockAt, "HH:mm"),
      tol,
    });
    playToleranceChime();
  }, [now, currentPeriod, tolerance, profile?.school_id, today, myRoster, playToleranceChime]);

  // Regras de marcação (por TURNO vigente):
  // - Antes do início + tolerância do tempo selecionado → bloqueado (aguarda liberação).
  // - Dentro do turno (até o fim do último tempo do turno) → liberado.
  // - Após o fim do turno → bloqueado automaticamente.
  // - Admin/coordenação: podem tudo, sempre.
  const canChangeRow = (r: Roster): { ok: boolean; reason?: string } => {
    const role = profile?.role ?? "";
    if (role === "admin") return { ok: true };
    if (!canMarkPresence) {
      return { ok: false, reason: "Somente o assistente responsável pela turma pode alterar." };
    }
    if (canMarkPresence && !canManageRoster && resolveAssistantId(r) !== profile?.user_id) {
      return { ok: false, reason: "Você não possui permissão para alterar esta sala." };
    }

    const realWeekday = now.getDay();
    if (weekday !== realWeekday) {
      if (canManageRoster) return { ok: true };
      return { ok: false, reason: "Só é possível marcar no dia de hoje." };
    }

    // Início: só libera após início + tolerância do tempo selecionado.
    const [sh, sm] = (currentPeriod?.start_time || r.start_time || "00:00").split(":").map(Number);
    const start = new Date(now); start.setHours(sh, sm, 0, 0);
    const tol = tolerance[normalizeShift(currentPeriod?.shift ?? r.shift) as "manha" | "tarde" | "noite"] ?? 15;
    const unlockAt = new Date(start.getTime() + tol * 60000);
    if (now.getTime() < unlockAt.getTime()) {
      if (canManageRoster) return { ok: true };
      const mins = Math.max(1, Math.ceil((unlockAt.getTime() - now.getTime()) / 60000));
      return { ok: false, reason: `Aguarde a tolerância de ${tol} min. Liberado em ${mins} min (às ${String(unlockAt.getHours()).padStart(2,"0")}:${String(unlockAt.getMinutes()).padStart(2,"0")}).` };
    }

    // Fim: bloqueia após o término do último tempo do turno vigente.
    const shiftKey = normalizeShift(currentPeriod?.shift ?? r.shift);
    const shiftAll = periods.filter((p) => normalizeShift(p.shift) === shiftKey);
    if (shiftAll.length > 0) {
      const lastEnd = shiftAll.map((p) => p.end_time).sort().slice(-1)[0];
      const [eh, em] = lastEnd.split(":").map(Number);
      const shiftEnd = new Date(now); shiftEnd.setHours(eh, em, 0, 0);
      if (now.getTime() > shiftEnd.getTime()) {
        if (canManageRoster) return { ok: true };
        return { ok: false, reason: `Turno encerrado às ${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}. Marcação bloqueada.` };
      }
    }

    return { ok: true };
  };

  const mark = async (r: Roster, status: Status) => {
    if (!profile?.school_id) return;
    if (status === "pendente") return;
    if (!currentPeriod) {
      toast({ title: "Selecione um tempo", variant: "destructive" });
      return;
    }
    const check = canChangeRow(r);
    if (!check.ok) {
      toast({ title: "Bloqueado", description: check.reason, variant: "destructive" });
      return;
    }
    // Optimistic UI: aplica imediatamente para o assistente e dispara o upsert
    // em paralelo. O realtime confirma para a TV em <1s.
    const key = `${r.id}:${currentPeriod.period_number}`;
    const prev = presence[key];
    setPresence((p) => ({ ...p, [key]: status }));
    if (syncResetRef.current) clearTimeout(syncResetRef.current);
    setSyncStatus("syncing");
    const { error } = await supabase
      .from("teacher_roster_presence")
      .upsert(
        { roster_id: r.id, school_id: profile.school_id, presence_date: today, period_number: currentPeriod.period_number, status, marked_by: profile.user_id } as any,
        { onConflict: "roster_id,presence_date,period_number" },
      );
    if (error) {
      setPresence((p) => { const n = { ...p }; if (prev) n[key] = prev; else delete n[key]; return n; });
      setSyncStatus("error");
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      // Avisa o Painel TV na hora (broadcast não depende de RLS).
      tvBroadcastRef.current?.send({ type: "broadcast", event: "presence-refresh", payload: { at: Date.now() } });
      setSyncStatus("ok");
      syncResetRef.current = setTimeout(() => setSyncStatus("idle"), 2500);
      // Ao marcar AUSENTE, abre o modal de Remanejamento Rápido
      // — exceto quando a marcação é RETROATIVA (o tempo já terminou):
      // nesse caso apenas registra a falta, sem gerar fila de substituição.
      if (status === "ausente" && currentPeriod) {
        const nowHM = new Date().toTimeString().slice(0, 5);
        const endHM = currentPeriod.end_time.slice(0, 5);
        const isRetroactive = today === new Date().toISOString().slice(0, 10) && nowHM > endHM;
        if (!isRetroactive) {
          setReassignFor({ roster: r, period: currentPeriod });
        }
      }
      // Se o professor voltou (presente/atrasado/justificado), cancela
      // substituições futuras registradas para ele hoje a partir deste tempo.
      if (status !== "ausente" && currentPeriod) {
        const { error: cancelErr } = await supabase
          .from("room_reassignments" as any)
          .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.user_id } as any)
          .eq("school_id", profile.school_id)
          .eq("reassignment_date", today)
          .eq("absent_roster_id", r.id)
          .gte("absent_period_number", currentPeriod.period_number)
          .is("cancelled_at", null);
        if (!cancelErr) {
          tvBroadcastRef.current?.send({ type: "broadcast", event: "presence-refresh", payload: { at: Date.now() } });
        }
      }
    }
  };

  const markDayAbsent = async (r: Roster) => {
    if (!profile?.school_id) return;
    const nameKey = (r.teacher_name || "").trim().toLowerCase();
    if (dayAbsentNames.has(nameKey)) return;
    setDayAbsentNames((s) => new Set(s).add(nameKey));
    const { error } = await supabase.from("teacher_day_absence" as any).insert({
      school_id: profile.school_id,
      teacher_name: r.teacher_name,
      absence_date: today,
      reason: "Faltou o dia todo",
      marked_by: profile.user_id,
      from_period: selectedPeriod,
    } as any);
    if (error) {
      setDayAbsentNames((s) => { const n = new Set(s); n.delete(nameKey); return n; });
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marcado", description: `${r.teacher_name} — faltou o dia todo` });
    // Recarrega presenças (o trigger já preencheu os tempos vazios)
    await load();
    tvBroadcastRef.current?.send({ type: "broadcast", event: "presence-refresh", payload: { at: Date.now() } });
    tvBroadcastRef.current?.send({
      type: "broadcast",
      event: "day-absent",
      payload: { teacher_name: r.teacher_name, from_period: selectedPeriod, at: Date.now() },
    });
  };



  const openNew = () => {
    setEditingId(null);
    setForm({
      teacher_name: "", nickname: "", level: "fundamental", discipline: "", class_name: "",
      block_name: "A", room_name: "",
      shift: currentPeriod?.shift ?? shift,
      period_number: currentPeriod?.period_number ?? 1,
      period_id: currentPeriod?.id ?? "",
      period_ids: currentPeriod ? [currentPeriod.id] : [],
      weekday,
    });
    setShowForm(true);
  };
  const openEdit = (r: Roster) => {
    setEditingId(r.id);
    const rosterShift = normalizeShift(r.shift);
    const rosterPeriod = periods.find((p) => p.id === r.period_id)
      ?? periods.find((p) => p.shift === rosterShift && time5(p.start_time) === time5(r.start_time));
    setForm({
      teacher_name: r.teacher_name,
      nickname: r.nickname ?? "",
      level: inferLevel(r.class_name),
      discipline: r.discipline ?? "",
      class_name: r.class_name ?? "",
      block_name: r.block_name ?? "A",
      room_name: r.room_name ?? "",
      shift: rosterPeriod?.shift ?? rosterShift,
      period_number: rosterPeriod?.period_number ?? 1,
      period_id: rosterPeriod?.id ?? r.period_id ?? "",
      period_ids: rosterPeriod?.id ? [rosterPeriod.id] : (r.period_id ? [r.period_id] : []),
      weekday: r.weekday ?? weekday,
    });
    setShowForm(true);
  };

  const saveForm = async () => {
    console.log("[AssistenteQuadro] saveForm", { profile, form, editingId });
    if (!profile?.school_id || !profile?.user_id) {
      toast({ title: "Perfil não carregado", description: "Aguarde e tente novamente.", variant: "destructive" });
      return;
    }
    if (!form.teacher_name.trim()) {
      toast({ title: "Informe o nome do professor", variant: "destructive" });
      return;
    }
    const periodOptions = periods.length > 0 ? periods : makeDefaultPeriods(profile.school_id);
    const selectedIds = form.period_ids.length > 0
      ? form.period_ids
      : (form.period_id ? [form.period_id] : []);
    const selectedPeriods = selectedIds
      .map((id) => periodOptions.find((p) => p.id === id))
      .filter((p): p is typeof periodOptions[number] => !!p)
      .sort((a, b) => a.period_number - b.period_number);
    const fallback = periodOptions.find((p) => p.shift === form.shift && p.period_number === form.period_number);
    const periodsToSave = selectedPeriods.length > 0 ? selectedPeriods : (fallback ? [fallback] : []);
    if (periodsToSave.length === 0) { toast({ title: "Selecione ao menos um tempo", variant: "destructive" }); return; }
    setSaving(true);
    const basePayload = {
      school_id: profile.school_id,
      assistant_user_id: profile.user_id,
      teacher_name: form.teacher_name.trim(),
      nickname: form.nickname.trim() || null,
      discipline: form.discipline.trim() || null,
      class_name: form.class_name.trim() || null,
      block_name: form.block_name,
      room_name: form.room_name.trim() || null,
      weekday: form.weekday,
    };
    let error: any = null;
    if (editingId) {
      const period = periodsToSave[0];
      const payload = {
        ...basePayload,
        period_id: period.id.startsWith("default-") ? null : period.id,
        start_time: period.start_time,
        end_time: period.end_time,
        shift: period.shift,
      };
      const res = await supabase.from("teacher_roster").update(payload).eq("id", editingId).select();
      error = res.error;
    } else {
      const rows = periodsToSave.map((period) => ({
        ...basePayload,
        period_id: period.id.startsWith("default-") ? null : period.id,
        start_time: period.start_time,
        end_time: period.end_time,
        shift: period.shift,
      }));
      const res = await supabase.from("teacher_roster").insert(rows).select();
      error = res.error;
    }
    setSaving(false);
    if (error) {
      console.error("[AssistenteQuadro] save error", error);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Cadastro atualizado" : (periodsToSave.length > 1 ? `${periodsToSave.length} tempos cadastrados` : "Professor cadastrado") });
    setShowForm(false);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este cadastro?")) return;
    const { error } = await supabase.from("teacher_roster").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
  };

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const qn = norm(q);
    // Quando "Minhas" está ativo, a busca também respeita a atribuição do usuário logado.
    const base = onlyMine
      ? allRoster.filter((r) => resolveAssistantId(r) === profile?.user_id)
      : allRoster;
    return base.filter((r) =>
      norm(r.teacher_name).includes(qn) ||
      (r.discipline && norm(r.discipline).includes(qn)) ||
      (r.class_name && norm(r.class_name).includes(qn)),
    );
  }, [search, allRoster, onlyMine, profile?.user_id, resolveAssistantId]);

  const doTransfer = async () => {
    if (!transferTarget || selectedToTransfer.size === 0) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("transfer_assistant_responsibility", {
      _to_user_id: transferTarget,
      _roster_ids: Array.from(selectedToTransfer),
      _note: null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Transferido", description: `${(data as any)?.transferred ?? 0} aula(s) transferida(s).` });
    setSelectedToTransfer(new Set());
    setTransferTarget("");
    setShowTransfer(false);
  };

  return (
    <div className="quadro-prof-root h-dvh flex flex-col bg-gradient-to-b from-[#1E4DB7] via-[#1740a0] to-[#0A2A66] text-slate-900 overflow-hidden">



      {/* Cabeçalho azul */}
      <header className="bg-[#0A2A66] text-white px-3 pt-3 pb-3">
        {/* Linha 1: voltar | título centralizado | sininho | testar | relógio */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <button
            onClick={toggleSiren}
            title={sirenEnabled ? "Sirene ativada — clique para desligar" : "Sirene desligada — clique para ativar"}
            className={`h-10 w-10 rounded-full flex items-center justify-center transition shrink-0 ${
              sirenEnabled
                ? "bg-amber-400 text-[#0A2A66] animate-pulse shadow-lg shadow-amber-400/40"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {sirenEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </button>
          <button
            onClick={() => {
              const el = document.documentElement as HTMLElement & {
                webkitRequestFullscreen?: () => Promise<void> | void;
                msRequestFullscreen?: () => Promise<void> | void;
              };
              if (!document.fullscreenElement) {
                try { (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el); } catch {}
              } else {
                try { document.exitFullscreen?.(); } catch {}
              }
            }}
            title="Tela cheia"

            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition shrink-0"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/", { replace: true });
            }}
            title="Sair"
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-red-500/30 text-white/70 hover:text-white flex items-center justify-center transition shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <div className="text-right shrink-0">
            <p className="text-xl font-black tabular-nums leading-none">{format(now, "HH:mm")}</p>
            <p className="text-[10px] text-white/60 capitalize">{format(now, "EEE, dd/MM", { locale: ptBR })}</p>
          </div>
        </div>

        {/* Linha 2: título do painel + nome do coordenador */}
        <div className="mt-2 text-center">
          <p className="text-base uppercase tracking-widest text-white/80 font-black leading-none">{(profile?.role === "assistente_alunos" || profile?.role === "assistente" || profile?.role === "secretario_escolar") ? "Painel Assistente de Aluno" : profile?.role === "gestor_pedagogico" ? "Painel Gestor" : profile?.role === "chef_projeto_vida" ? "Painel Chef Projeto de Vida" : "Painel Coordenador"}</p>
          <p className="font-black text-lg break-words leading-tight mt-1">{profile?.full_name ?? "—"}</p>
        </div>

        {/* Turno — alinhado às bordas como os dias da semana */}
        <div className="mt-3 -mx-2 grid grid-cols-3 gap-1">
          {(Object.keys(SHIFT_LABEL) as Shift[]).map((s) => {
            const Icon = SHIFT_ICON[s];
            const active = shift === s;
            const SHIFT_BTN: Record<Shift, { on: string; off: string }> = {
              manha: {
                on: "bg-gradient-to-br from-lime-300 via-green-400 to-green-600 text-white border-2 border-lime-200 shadow-[0_0_26px_rgba(132,204,22,0.95)] ring-2 ring-lime-200",
                off: "bg-gradient-to-br from-lime-400/40 to-green-700/40 text-lime-50 border border-lime-300/40 shadow-[0_0_10px_rgba(132,204,22,0.4)] hover:brightness-125",
              },
              tarde: {
                on: "bg-gradient-to-br from-sky-300 via-sky-400 to-cyan-500 text-white border-2 border-sky-200 shadow-[0_0_26px_rgba(56,189,248,1)] ring-2 ring-sky-100",
                off: "bg-gradient-to-br from-sky-300/40 to-cyan-600/40 text-sky-50 border border-sky-200/40 shadow-[0_0_10px_rgba(56,189,248,0.4)] hover:brightness-125",
              },
              noite: {
                on: "bg-gradient-to-br from-blue-700 via-blue-900 to-blue-950 text-white border-2 border-blue-300 shadow-[0_0_26px_rgba(37,99,235,1)] ring-2 ring-blue-300",
                off: "bg-gradient-to-br from-blue-800/55 to-blue-950/70 text-blue-50 border border-blue-300/40 shadow-[0_0_10px_rgba(37,99,235,0.45)] hover:brightness-125",
              },
            };
            return (
              <button
                key={s}
                onClick={() => { manualSelectAtRef.current = Date.now(); setShift(s); }}
                className={`h-12 rounded-xl font-black text-lg flex items-center justify-center gap-1.5 transition ${
                  active ? SHIFT_BTN[s].on : SHIFT_BTN[s].off
                }`}
              >
                <Icon className="h-5 w-5" />
                {SHIFT_LABEL[s]}
              </button>
            );
          })}
        </div>

        {/* Dia da semana */}
        <div className="mt-2 -mx-2 grid grid-cols-7 gap-1">
          {[1,2,3,4,5,6,0].map((dayIndex) => {
            const lbl = WEEKDAY_SHORT[dayIndex];
            const active = weekday === dayIndex;
            return (
              <button
                key={dayIndex}
                type="button"
                onClick={() => { manualSelectAtRef.current = Date.now(); setWeekday(dayIndex); }}
                className={`h-11 rounded-lg text-base font-black transition ${
                  active ? "bg-amber-400 text-[#0A2A66]" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {lbl}
              </button>
            );
          })}
        </div>

      </header>

      {/* Tempos — largura total, label em cima e horário embaixo */}
      <div className="bg-[#1E4DB7] text-white px-0.5 py-1.5">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${Math.max(shiftPeriods.length, 1)}, minmax(0, 1fr))` }}
        >
          {shiftPeriods.map((p) => {
            const active = selectedPeriod === p.period_number;
            return (
              <button
                key={p.id}
                onClick={() => { manualSelectAtRef.current = Date.now(); setSelectedPeriod(p.period_number); }}
                className={`h-[72px] px-0 rounded-lg font-black flex flex-col items-center justify-center leading-none transition overflow-hidden ${
                  active ? "bg-white text-[#1E4DB7]" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                <span className="text-[14px] uppercase tracking-tight font-black whitespace-nowrap leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{p.period_number}º Tempo</span>
                <span className="text-[18px] font-mono font-black tabular-nums mt-[2px] leading-none whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{p.start_time.slice(0,5)}</span>
                <span className="text-[12px] uppercase font-black leading-none mt-[1px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">às</span>
                <span className="text-[18px] font-mono font-black tabular-nums leading-none whitespace-nowrap mt-[1px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{p.end_time.slice(0,5)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contador: antes de começar mostra "começa em"; durante mostra "termina em"; após, "encerrado" — ou Intervalo se houver próximo tempo no mesmo turno. */}
      {(() => {
        if (!currentPeriod) return null;
        const [sh, sm] = (currentPeriod.start_time || "00:00").split(":").map(Number);
        const [eh, em] = (currentPeriod.end_time || "00:00").split(":").map(Number);
        const start = new Date(now); start.setHours(sh, sm, 0, 0);
        const end = new Date(now); end.setHours(eh, em, 0, 0);
        const notStarted = now.getTime() < start.getTime();
        const ended = now.getTime() >= end.getTime();

        // Procura o próximo tempo do mesmo turno para detectar Intervalo
        const nextPeriod = shiftPeriods
          .filter((p) => p.period_number > currentPeriod.period_number)
          .sort((a, b) => a.period_number - b.period_number)[0];
        let nextStart: Date | null = null;
        if (nextPeriod) {
          const [nsh, nsm] = (nextPeriod.start_time || "00:00").split(":").map(Number);
          nextStart = new Date(now); nextStart.setHours(nsh, nsm, 0, 0);
        }
        const isInterval = ended && nextStart && now.getTime() < nextStart.getTime() && nextStart.getTime() > end.getTime();
        const intervalTotalMin = isInterval && nextStart ? Math.round((nextStart.getTime() - end.getTime()) / 60000) : 0;

        let refMs: number;
        if (isInterval && nextStart) refMs = nextStart.getTime() - now.getTime();
        else if (notStarted) refMs = start.getTime() - now.getTime();
        else refMs = end.getTime() - now.getTime();

        const totalSec = Math.max(0, Math.floor(refMs / 1000));
        const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
        const ss = String(totalSec % 60).padStart(2, "0");
        const urgent = !ended && !notStarted && refMs <= 60_000;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const utcH = -now.getTimezoneOffset() / 60;
        const utcLabel = `UTC${utcH >= 0 ? "+" : ""}${utcH}`;
        const offSec = Math.round(serverOffsetMs / 1000);
        const turned = ended && !isInterval;
        return (
          <div className="px-2 pt-1.5">
            <div
              className={`rounded-xl px-3 py-2 flex items-center justify-between gap-3 border font-black text-white ${
                isInterval
                  ? "bg-gradient-to-br from-emerald-600 to-emerald-900 border-emerald-300/70 shadow-[0_0_18px_rgba(16,185,129,0.7)]"
                  : turned
                  ? "bg-gradient-to-br from-rose-700 to-rose-900 border-rose-300/70 shadow-[0_0_18px_rgba(244,63,94,0.6)]"
                  : urgent
                  ? "bg-gradient-to-br from-amber-600 to-amber-800 border-amber-300/80 shadow-[0_0_18px_rgba(245,158,11,0.7)] animate-pulse"
                  : notStarted
                  ? "bg-gradient-to-br from-sky-700 to-slate-900 border-sky-300/60 shadow-[0_0_18px_rgba(14,165,233,0.7)]"
                  : "bg-gradient-to-br from-indigo-700 to-slate-900 border-indigo-300/60 shadow-[0_0_18px_rgba(30,41,99,0.9)]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[15px] font-black tabular-nums tracking-tight whitespace-nowrap">
                  {isInterval
                    ? `Intervalo · ${intervalTotalMin} min`
                    : `${currentPeriod.period_number}º Tempo · ${currentPeriod.start_time.slice(0,5)}–${currentPeriod.end_time.slice(0,5)}`}
                </span>
                <span className="text-[12px] uppercase tracking-wide font-bold text-white/75 truncate">
                  {isInterval ? `termina em · próximo ${nextPeriod!.start_time.slice(0,5)}` : turned ? "encerrado · travado" : notStarted ? "começa em" : "termina em"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {syncStatus !== "idle" && (
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border tabular-nums ${
                      syncStatus === "ok"
                        ? "bg-emerald-500/25 border-emerald-300/70 text-emerald-100"
                        : syncStatus === "error"
                        ? "bg-rose-500/30 border-rose-300/70 text-rose-50"
                        : "bg-white/15 border-white/40 text-white animate-pulse"
                    }`}
                    title="Status do envio para o Painel TV"
                  >
                    {syncStatus === "ok" ? "✓ TV ok" : syncStatus === "error" ? "✕ erro" : "↻ enviando"}
                  </span>
                )}
                <span className="text-xl font-mono tabular-nums leading-none">
                  {turned ? "00:00" : `${mm}:${ss}`}
                </span>
              </div>
            </div>
            <div className="mt-0.5 mb-1 overflow-hidden whitespace-nowrap">
              <style>{`@keyframes assistMarquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}`}</style>
              <p
                className="inline-block text-[13px] font-bold text-white/90 tabular-nums leading-5"
                style={{ animation: "assistMarquee 40s linear infinite" }}
              >
                Servidor: {now.toTimeString().slice(0, 8)} · {tz} ({utcLabel}) · ajuste {offSec >= 0 ? "+" : ""}{offSec}s vs. aparelho
              </p>
            </div>
          </div>
        );
      })()}


      {/* Ações — cadastro/edição de quadro é exclusivo da Coordenação/Gestão */}
      <div className="px-2 pt-2 grid grid-cols-2 items-center gap-2">
        {canManageRoster ? (
          <button onClick={openNew} className="h-11 w-full rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-blue-600 text-white font-black flex items-center justify-center gap-1.5 text-sm shadow-[0_0_18px_rgba(56,189,248,0.55)] border border-sky-300/60 whitespace-nowrap">
            <Plus className="h-4 w-4 shrink-0" /> Novo professor
          </button>
        ) : <div />}
        {canManageRoster ? (
          <button
            type="button"
            onClick={() => setShowPeriodConfig(true)}
            title="Configurar horários"
            className="h-11 w-full rounded-xl bg-gradient-to-br from-cyan-300 via-sky-400 to-sky-500 text-[#0A2A66] font-black flex items-center justify-center gap-1.5 text-sm shadow-[0_0_18px_rgba(125,211,252,0.6)] border border-cyan-200/70 whitespace-nowrap"
          >
            <Settings className="h-4 w-4 shrink-0" /> Horários
          </button>
        ) : <div />}
      </div>

      {/* Transferir — alinhado à esquerda */}
      {canTransferResponsibility && (
        <div className="px-4 pt-1.5 flex">
          <button onClick={() => setShowTransfer(true)} className="h-9 px-4 rounded-xl bg-amber-500 text-white font-bold flex items-center gap-1.5 text-sm shadow-sm">
            <ArrowRightLeft className="h-4 w-4" /> Transferir
          </button>
        </div>
      )}




      {/* Busca */}
      <div className="px-2 pt-0.5">
        <div className="relative">
          <Search className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar professor (nome, disciplina, turma)"
            className="w-full h-12 pl-10 pr-10 rounded-xl border border-slate-300 bg-white text-base"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchResults && (
          <div className="mt-2 rounded-xl border border-slate-300 bg-white divide-y max-h-72 overflow-y-auto">
            {searchResults.length === 0 && (
              <div className="p-4 text-sm text-slate-500 text-center">Nada encontrado.</div>
            )}
            {searchResults.map((r) => {
              const st = getStatus(r.id);
              const aid = resolveAssistantId(r);
              const mine = aid === profile?.user_id;
              return (
                <div key={r.id} className="px-3 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-base break-words">{displayName(r.teacher_name, r.nickname)}</p>
                    <p className="text-sm text-slate-500 break-words">
                      {[r.discipline, formatClassDisplay(r.class_name), r.room_name && `Sala ${r.room_name}`, r.block_name && `Bl. ${r.block_name}`].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs font-mono font-bold text-slate-400">
                      {r.start_time.slice(0,5)}–{r.end_time.slice(0,5)} · {mine ? "Você" : "Outro assistente"}
                    </p>
                    {assistantNameById[aid] && (
                      <p className="text-[11px] text-slate-500 break-words">
                        Assistente de aluno: <span className="font-bold text-slate-700">{assistantNameById[aid]}</span>
                      </p>
                    )}

                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black text-white ${STATUS_COLOR[st]}`}>
                    {st.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista — área rolável */}
      <div className="px-2 pt-1 pb-0.5 flex items-center gap-2">
        <button
          onClick={() => setShowAll(true)}
          title="Ver todos os professores"
          className="h-10 w-10 rounded-xl bg-white/15 text-white flex items-center justify-center border border-white/30 shrink-0"
        >
          <Eye className="h-5 w-5" />
        </button>
        <button
          onClick={() => setOnlyMine((v) => !v)}
          title={onlyMine ? "Mostrar todas as salas" : "Mostrar somente minhas salas"}
          aria-pressed={onlyMine}
          className={`h-10 px-3 rounded-xl flex items-center gap-1.5 border shrink-0 text-xs font-black uppercase tracking-wide transition ${
            onlyMine
              ? "bg-amber-300 text-[#0A2A66] border-amber-200 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
              : "bg-white/15 text-white border-white/30"
          }`}
        >
          {onlyMine ? "Minhas" : "Todas"}
        </button>
        <p className="flex-1 text-base uppercase font-black text-white/90 leading-tight">
          {onlyMine ? "Minhas salas deste tempo" : "Professores deste tempo"}
        </p>
        <p className="text-3xl font-black text-amber-300 tabular-nums leading-none shrink-0">
          {myRoster.length} <span className="text-base text-white/80 font-bold">aula(s)</span>
        </p>
      </div>


      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-2 pb-2 space-y-2 [contain:layout_paint]">
        {myRoster.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-base">
            Nenhum professor atribuído neste tempo.
            {canManageRoster && (<><br />Toque em <b>+ Novo professor</b> para cadastrar.</>)}
          </div>
        )}
        {myRoster.map((r) => {
          const st = getStatus(r.id);
          const warn = isWarning(r);
          return (
            <div
              key={r.id}
              className={`rounded-2xl px-3 py-4 space-y-2 text-white shadow-lg bg-gradient-to-br from-[#0A2A66] via-[#143b8a] to-[#1E4DB7] border ${
                warn ? "border-amber-300 ring-2 ring-amber-300/60" : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-black text-xl break-words leading-tight">{displayName(r.teacher_name, r.nickname)}</p>
                  {r.discipline && (
                    <p className="text-lg font-bold text-white break-words mt-0.5 leading-snug">
                      {r.discipline}
                    </p>
                  )}
                  {r.class_name && (
                    <p className="text-lg font-bold text-amber-200 break-words leading-snug">
                      {formatClassDisplay(r.class_name)}
                    </p>
                  )}
                  <p className="text-base font-mono font-bold tabular-nums text-amber-300 mt-0.5">
                    {r.start_time.slice(0,5)}–{r.end_time.slice(0,5)}
                    <span className="text-white/80 font-sans font-normal text-base"> · Bl. {r.block_name ?? "—"}{r.room_name ? ` · Sala ${r.room_name}` : ""}</span>
                  </p>

                  {(() => {
                    const ownerId = resolveAssistantId(r);
                    const origId = r.original_assistant_user_id ?? null;
                    if (!origId || origId === ownerId) return null;
                    const origNm = assistantNameById[origId];
                    const ownerNm = assistantNameById[ownerId];
                    const forMe = ownerId === profile?.user_id;
                    return (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-lg bg-amber-400/20 ring-1 ring-amber-300/50 px-2 py-1 text-[12px] font-bold text-amber-100">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Turma transferida por {origNm ? shortAssistantName(origNm) : "assistente ausente"}
                        {forMe ? " — responsabilidade sua hoje" : ownerNm ? ` — responsável hoje: ${shortAssistantName(ownerNm)}` : ""}
                      </p>
                    );
                  })()}


                  {warn && (
                    <p className="text-sm text-amber-200 font-bold mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-5 w-5" /> Verificar sala — 15+ min sem marcação
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  {(() => {
                    const aid = resolveAssistantId(r);
                    const nm = assistantNameById[aid];
                    if (!nm) return null;
                    const c = assistantBadgeColor(aid);
                    // Se a sala foi transferida, mostra "Original POR Substituto"
                    const origId = r.original_assistant_user_id ?? null;
                    const isSubstituted = !!origId && origId !== aid;
                    const originalNm = isSubstituted ? assistantNameById[origId!] : null;
                    return (
                      <div
                        title={
                          isSubstituted && originalNm
                            ? `Assistente original: ${originalNm}\nRespondendo hoje: ${nm}\nTurma: ${formatClassDisplay(r.class_name)}\nHorário: ${r.start_time.slice(0,5)}–${r.end_time.slice(0,5)}${r.room_name ? ` · Sala ${r.room_name}` : ""}`
                            : `Assistente de aluno: ${nm}\nTurma: ${formatClassDisplay(r.class_name)}\nHorário: ${r.start_time.slice(0,5)}–${r.end_time.slice(0,5)}${r.room_name ? ` · Sala ${r.room_name}` : ""}`
                        }
                        className={`min-w-[124px] max-w-[160px] rounded-xl px-2 py-1.5 text-center shadow-lg ring-2 ${c.bg} ${c.text} ${c.ring} bg-gradient-to-b from-white/25 to-black/10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] cursor-help`}
                      >
                        {isSubstituted && originalNm ? (
                          <>
                            <div className="text-[12px] font-medium leading-tight whitespace-nowrap line-through opacity-80">
                              {shortAssistantName(originalNm)}
                            </div>
                            <div className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5 opacity-80">por</div>
                            <div className="text-[13px] font-semibold leading-tight mt-0.5 whitespace-nowrap">
                              {shortAssistantName(nm)}
                            </div>
                          </>
                        ) : (
                          <div className="text-[13px] font-semibold leading-tight whitespace-nowrap">{shortAssistantName(nm)}</div>
                        )}
                        {(() => {
                          const key = currentPeriod ? `${r.id}:${currentPeriod.period_number}` : "";
                          const loc = key ? extraByKey[key] : undefined;
                          const sub = key ? subByKey[key] : undefined;
                          if (loc) {
                            return (
                              <div className="mt-1 pt-1 border-t border-white/25">
                                <div className="text-[9px] font-black uppercase tracking-wide leading-none opacity-90">Extra Classe</div>
                                <div className="text-[11px] font-bold leading-tight mt-0.5 whitespace-nowrap">{loc}</div>
                              </div>
                            );
                          }
                          if (sub) {
                            return (
                              <div className="mt-1 pt-1 border-t border-white/25">
                                <div className="text-[9px] font-black uppercase tracking-wide leading-none opacity-90">Substituído por</div>
                                <div className="text-[11px] font-bold leading-tight mt-0.5 whitespace-nowrap">{shortAssistantName(sub)}</div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    );
                  })()}
                  <span className={`h-3 w-3 rounded-full ring-2 ring-white/30 ${STATUS_COLOR[st]}`} />

                  {canManageRoster && (
                    <>
                      <button onClick={() => openEdit(r)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"><Pencil className="h-[18px] w-[18px]" /></button>
                      <button onClick={() => remove(r.id)} className="h-9 w-9 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 flex items-center justify-center"><Trash2 className="h-[18px] w-[18px]" /></button>
                    </>
                  )}
                </div>

              </div>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTS.map((o) => {
                  const Icon = o.icon;
                  const active = st === o.v;
                  const check = canChangeRow(r);
                  const allowed = check.ok;
                  return (
                    <button
                      key={o.v}
                      onClick={() => mark(r, o.v)}
                      disabled={!allowed}
                      title={allowed ? undefined : check.reason}
                      className={`h-12 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-all duration-200 border ${
                        active
                          ? `${o.cls} ${o.glow} border-white/60 scale-[1.04]`
                          : allowed
                            ? `${o.ready} hover:brightness-125`
                            : `${o.dim} border-white/15`
                      } ${!allowed ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <Icon className="h-5 w-5" />
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>


      {/* Modal: novo/editar */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 p-4 space-y-3 text-white shadow-2xl"
            style={{
              background:
                "radial-gradient(120% 80% at 100% 0%, rgba(251,146,60,0.32) 0%, rgba(251,146,60,0) 55%), linear-gradient(160deg, #0A2A66 0%, #112d6e 45%, #1a2350 75%, #3a2050 100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-black text-lg text-white drop-shadow">{editingId ? "Editar cadastro" : "Novo professor"}</h2>
            <div className="flex gap-2">
              <input
                value={form.teacher_name}
                onChange={(e) => setForm({ ...form, teacher_name: e.target.value })}
                placeholder="Nome completo do professor"
                className="flex-1 h-11 px-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder:text-white/50"
              />
              <button
                type="button"
                onClick={() => { setTeacherPickerQuery(""); setShowTeacherPicker(true); }}
                title="Buscar professor cadastrado"
                className="h-11 px-3 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-[#0A2A66] font-black text-xs flex items-center gap-1 shadow-[0_0_14px_rgba(251,191,36,0.5)]"
              >
                <Search className="h-4 w-4" /> Buscar
              </button>
            </div>
            <input
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="Como é conhecido (apelido) — opcional"
              className="w-full h-11 px-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder:text-white/50 text-sm"
            />
            <p className="text-[10px] text-white/60 -mt-2">
              Se preenchido, será exibido nas listas no lugar do nome completo.
            </p>

            <div>
              <p className="text-[11px] font-black uppercase text-white/70 mb-1">Nível</p>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(LEVEL_LABEL) as Level[]).map((lv) => (
                  <button
                    key={lv}
                    onClick={() => setForm({ ...form, level: lv, discipline: "", class_name: "" })}
                    className={`h-10 rounded-lg text-xs font-black transition ${form.level === lv ? "bg-gradient-to-br from-emerald-300 to-emerald-600 text-white shadow-[0_0_14px_rgba(16,185,129,0.55)]" : "bg-white/10 text-white hover:bg-white/20"}`}
                  >
                    {LEVEL_LABEL[lv]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-black uppercase text-white/70 mb-1">Disciplina</p>
              <select
                value={form.discipline}
                onChange={(e) => setForm({ ...form, discipline: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-white/20 bg-white/10 text-white text-sm"
              >
                <option value="" className="text-slate-900">Selecione a disciplina…</option>
                {DISC_BY_LEVEL[form.level].map((d) => (
                  <option key={d} value={d} className="text-slate-900">{d}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-[11px] font-black uppercase text-white/70 mb-1">Série e turma</p>
              {(() => {
                const parsed = parseClassName(form.level, form.class_name);
                const series = parsed.series;
                const turma = (parsed.series !== null ? parsed.turma : "").replace(/^\s+/, "");
                const allowedSeries = SERIES_BY_LEVEL[form.level];
                const recompose = (s: number | null, t: string) =>
                  s === null ? t : `${s} ${t}`.trimEnd();
                return (
                  <div className="flex items-center gap-2">
                    {/* Série */}
                    {series === null ? (
                      <input
                        inputMode="numeric"
                        maxLength={1}
                        value=""
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, "").slice(0, 1);
                          if (!d) return;
                          const n = parseInt(d, 10);
                          if (allowedSeries.includes(n)) {
                            setForm({ ...form, class_name: `${n} ` });
                          }
                        }}
                        placeholder={allowedSeries.join("/")}
                        className="h-11 w-20 px-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder:text-white/40 font-black text-center"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, class_name: "" })}
                        title="Trocar série"
                        className="h-11 min-w-11 px-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-[#0A2A66] font-black flex items-center justify-center shadow-[0_0_14px_rgba(251,191,36,0.5)]"
                      >
                        {series}º
                      </button>
                    )}
                    {/* Turma */}
                    <input
                      value={turma}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
                        setForm({ ...form, class_name: recompose(series, v) });
                      }}
                      disabled={series === null}
                      placeholder={series === null ? "Turma" : "A · B · 01 · 02"}
                      className="h-11 flex-1 px-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder:text-white/40 font-bold tracking-wider uppercase disabled:opacity-50"
                    />
                  </div>
                );
              })()}
              <p className="text-[10px] text-white/60 mt-1">
                Digite a série ({SERIES_BY_LEVEL[form.level].join("/")}), depois a turma (A, B, C ou 01, 02, 03).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] font-black uppercase text-white/70 mb-1">Bloco</p>
                <div className="grid grid-cols-4 gap-1">
                  {["A","B","C","D"].map((b) => (
                    <button key={b} onClick={() => setForm({ ...form, block_name: b })} className={`h-10 rounded-lg text-xs font-black transition ${form.block_name === b ? "bg-gradient-to-br from-sky-300 to-sky-600 text-white shadow-[0_0_12px_rgba(56,189,248,0.55)]" : "bg-white/10 text-white hover:bg-white/20"}`}>{b}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-white/70 mb-1">Sala</p>
                <input value={form.room_name} onChange={(e) => setForm({ ...form, room_name: e.target.value })} placeholder="Ex.: 07" className="w-full h-10 px-3 rounded-lg border border-white/20 bg-white/10 text-white placeholder:text-white/40" />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase text-white/70 mb-1">Dia da semana</p>
              <div className="grid grid-cols-7 gap-1">
                {[1,2,3,4,5,6,0].map((dayIndex) => {
                  const lbl = WEEKDAY_SHORT[dayIndex];
                  const active = form.weekday === dayIndex;
                  return (
                    <button
                      key={dayIndex}
                      type="button"
                      onClick={() => setForm({ ...form, weekday: dayIndex })}
                      className={`h-10 rounded-lg text-[10px] font-black transition ${active ? "bg-amber-400 text-[#0A2A66] shadow-[0_0_12px_rgba(251,191,36,0.5)]" : "bg-white/10 text-white hover:bg-white/20"}`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase text-white/70 mb-1">Turno</p>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {(Object.keys(SHIFT_LABEL) as Shift[]).map((sh) => {
                  const active = form.shift === sh;
                  const palette: Record<Shift, { active: string; inactive: string }> = {
                    manha: { active: "bg-gradient-to-br from-emerald-300 to-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)]", inactive: "bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/60" },
                    tarde: { active: "bg-gradient-to-br from-sky-300 to-sky-600 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]", inactive: "bg-sky-900/40 text-sky-100 hover:bg-sky-800/60" },
                    noite: { active: "bg-gradient-to-br from-indigo-700 to-slate-900 text-white shadow-[0_0_12px_rgba(30,41,99,0.8)]", inactive: "bg-slate-900/50 text-slate-200 hover:bg-slate-800/70" },
                  };
                  const p = palette[sh];
                  return (
                    <button
                      key={sh}
                      type="button"
                      onClick={() => {
                        const periodOptions = periods.length > 0 ? periods : makeDefaultPeriods(profile?.school_id ?? "");
                        const first = periodOptions
                          .filter((p) => p.shift === sh)
                          .sort((a, b) => a.period_number - b.period_number)[0];
                        setForm({
                          ...form,
                          shift: sh,
                          period_number: first?.period_number ?? 1,
                          period_id: first?.id ?? "",
                          period_ids: first?.id ? [first.id] : [],
                        });
                      }}
                      className={`h-10 rounded-lg text-xs font-black transition ${active ? p.active : p.inactive}`}
                    >
                      {SHIFT_LABEL[sh]}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const periodOptions = periods.length > 0 ? periods : makeDefaultPeriods(profile?.school_id ?? "");
                const list = periodOptions.filter((p) => p.shift === form.shift).sort((a, b) => a.period_number - b.period_number);
                if (list.length === 0) {
                  return <p className="text-[11px] text-white/60">Nenhum tempo configurado para este turno.</p>;
                }
                return (
                  <>
                    <p className="text-[10px] text-white/70 mb-1">Toque para selecionar um ou mais tempos seguidos.</p>
                    <div
                      className="grid gap-1 pb-1 -mx-2"
                      style={{ gridTemplateColumns: `repeat(${Math.max(list.length, 1)}, minmax(0, 1fr))` }}
                    >
                      {list.map((p) => {
                        const active = form.period_ids.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              const has = form.period_ids.includes(p.id);
                              const next = has
                                ? form.period_ids.filter((x) => x !== p.id)
                                : [...form.period_ids, p.id];
                              const ordered = list.filter((pp) => next.includes(pp.id)).map((pp) => pp.id);
                              const firstSel = list.find((pp) => ordered.includes(pp.id));
                              setForm({
                                ...form,
                                shift: p.shift,
                                period_number: firstSel?.period_number ?? p.period_number,
                                period_id: firstSel?.id ?? "",
                                period_ids: ordered,
                              });
                            }}
                            className={`h-[72px] min-w-0 px-0.5 rounded-lg text-[12px] font-black border transition leading-none flex flex-col items-center justify-start pt-1.5 overflow-hidden ${active ? "bg-amber-400 text-[#0A2A66] border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.55)]" : "bg-white/10 text-white border-white/20 hover:bg-white/20"}`}
                          >
                            <span className="whitespace-nowrap leading-none">{p.period_number}º Tempo</span>
                            <span className="font-mono font-black text-[12px] mt-1 leading-none whitespace-nowrap">{p.start_time.slice(0,5)}</span>
                            <span className="text-[8px] uppercase opacity-70 leading-none mt-[1px]">às</span>
                            <span className="font-mono font-black text-[12px] leading-none whitespace-nowrap mt-[1px]">{p.end_time.slice(0,5)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 h-12 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20">Cancelar</button>
              <button onClick={saveForm} disabled={saving} className="flex-1 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-[#0A2A66] font-black shadow-[0_0_16px_rgba(251,191,36,0.55)] disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: configurar horários (tempos editáveis por turno) */}
      {showPeriodConfig && (
        <PeriodConfigModal
          schoolId={profile?.school_id ?? ""}
          periods={periods}
          onClose={() => setShowPeriodConfig(false)}
          onSaved={async () => { await loadPeriods(); }}
        />
      )}



      {/* Modal: ver todos (somente leitura) */}
      {showAll && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setShowAll(false)}>
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-white border p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-lg text-[#0A2A66]">Todos os tempos · {SHIFT_LABEL[shift]} {currentPeriod?.label}</h2>
              <button onClick={() => setShowAll(false)} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y">
              {allRoster.filter((r) => !currentPeriod || r.period_id === currentPeriod.id).sort((a, b) => compareClassNames(a.class_name, b.class_name)).map((r) => {
                const st = getStatus(r.id);
                return (
                  <div key={r.id} className="py-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[st]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm break-words">{displayName(r.teacher_name, r.nickname)}</p>
                      <p className="text-[11px] text-slate-500 break-words">
                        {[r.discipline, r.class_name, r.room_name && `Sala ${r.room_name}`, r.block_name && `Bl. ${r.block_name}`].filter(Boolean).join(" · ")}
                      </p>
                      {(() => { const aid = resolveAssistantId(r); return assistantNameById[aid] ? (
                        <p className="text-[11px] text-slate-500 break-words">
                          Assistente de aluno: <span className="font-bold text-slate-700">{assistantNameById[aid]}</span>
                        </p>
                      ) : null; })()}

                    </div>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black text-white ${STATUS_COLOR[st]}`}>{st.toUpperCase()}</span>
                  </div>
                );
              })}
              {allRoster.filter((r) => !currentPeriod || r.period_id === currentPeriod.id).length === 0 && (
                <div className="py-10 text-center text-slate-400 text-sm">Nada para mostrar.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: transferir */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setShowTransfer(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-black text-lg text-[#0A2A66]">Transferir responsabilidade</h2>
            <p className="text-xs text-slate-500">
              Turno <span className="font-bold">{SHIFT_LABEL[myShift as Shift] ?? myShift}</span> · só assistentes e turmas deste turno.
            </p>

            <div>
              <p className="text-[11px] font-black uppercase text-slate-500 mb-1">Assistente destino ({SHIFT_LABEL[myShift as Shift] ?? myShift})</p>
              <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm">
                <option value="">Selecione…</option>
                {transferAssistants.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.full_name}</option>
                ))}
              </select>
              {transferAssistants.length === 0 && (
                <p className="text-[10px] text-rose-600 font-bold mt-1">Nenhum outro assistente cadastrado neste turno.</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Aulas do turno</p>
                <button
                  onClick={() => setSelectedToTransfer(
                    selectedToTransfer.size === myTransferable.length ? new Set() : new Set(myTransferable.map((r) => r.id))
                  )}
                  className="text-[11px] font-bold text-[#1E4DB7]"
                >
                  {selectedToTransfer.size === myTransferable.length ? "Limpar" : "Selecionar todas as minhas"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y">
                {transferRoster.length === 0 && <div className="p-3 text-xs text-slate-400 text-center">Nenhuma aula neste turno.</div>}
                {transferRoster.map(({ r, ownerId }) => {
                  const mine = ownerId === profile?.user_id;
                  const sel = mine ? selectedToTransfer.has(r.id) : true;
                  const ownerNm = assistantNameById[ownerId];
                  return (
                    <button
                      key={r.id}
                      disabled={!mine}
                      onClick={() => {
                        if (!mine) return;
                        const next = new Set(selectedToTransfer);
                        if (sel) next.delete(r.id); else next.add(r.id);
                        setSelectedToTransfer(next);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 ${mine ? "hover:bg-slate-50" : "bg-slate-100 cursor-not-allowed opacity-70"}`}
                    >
                      <span className={`h-5 w-5 rounded border-2 flex items-center justify-center ${sel ? (mine ? "bg-[#0A2A66] border-[#0A2A66]" : "bg-slate-400 border-slate-400") : "border-slate-300"}`}>
                        {sel && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm break-words">{displayName(r.teacher_name, r.nickname)}</p>
                        <p className="text-[10px] text-slate-500">
                          {[r.discipline, r.class_name].filter(Boolean).join(" · ")} · {r.start_time.slice(0,5)}
                        </p>
                        {!mine && (
                          <p className="text-[10px] font-bold text-slate-500">
                            Turma de {ownerNm ? shortAssistantName(ownerNm) : "outro assistente"} · não transferível
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowTransfer(false)} className="flex-1 h-12 rounded-xl bg-slate-100 font-bold">Cancelar</button>
              <button
                onClick={doTransfer}
                disabled={saving || !transferTarget || selectedToTransfer.size === 0}
                className="flex-1 h-12 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-40"
              >
                {saving ? "Transferindo..." : `Transferir (${selectedToTransfer.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: buscar professor cadastrado (somente professores em sala) */}
      {showTeacherPicker && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setShowTeacherPicker(false)}>
          <div className="w-full max-w-md max-h-[80vh] rounded-2xl bg-white border p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-black text-lg text-[#0A2A66]">Professores em sala</h2>
              <button onClick={() => setShowTeacherPicker(false)} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Lista dos professores cadastrados na escola. Toque para usar o nome exatamente como foi cadastrado.
            </p>
            <div className="relative mb-2">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={teacherPickerQuery}
                onChange={(e) => setTeacherPickerQuery(e.target.value)}
                placeholder="Buscar pelo nome…"
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y rounded-xl border border-slate-200">
              {(() => {
                const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                const q = norm(teacherPickerQuery);
                const list = teacherOptions.filter((t) => !q || norm(t.full_name).includes(q));
                if (list.length === 0) {
                  return <p className="text-center text-xs text-slate-400 py-8">Nenhum professor encontrado.</p>;
                }
                return list.map((t) => (
                  <button
                    key={t.user_id}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, teacher_name: t.full_name }));
                      setShowTeacherPicker(false);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 text-sm font-bold break-words"
                  >
                    <span className="break-words">{t.full_name}</span>
                  </button>
                ));
              })()}
            </div>


          </div>
        </div>
      )}

      {reassignFor && profile?.school_id && profile?.user_id && (
        <RemanejamentoModal
          open={!!reassignFor}
          onClose={() => setReassignFor(null)}
          schoolId={profile.school_id}
          userId={profile.user_id}
          today={today}
          absentRoster={reassignFor.roster as any}
          absentPeriod={reassignFor.period as any}
          dayRosters={allRoster.filter((r) => r.weekday === weekday) as any}
          shiftPeriods={shiftPeriods as any}
          presence={presence as any}
          busyCoveringTeacherKeys={busyCoveringTeacherKeys}
          onDone={() => { /* mantém modal para copiar aviso */ }}
        />
      )}

      {toleranceAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl overflow-hidden border-4 border-amber-300/60 shadow-[0_0_60px_rgba(251,191,36,0.6)] bg-gradient-to-br from-[#0A2A66] via-[#0B3D7A] to-[#08205A]">
            {/* faixa dourada superior pulsante */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 animate-pulse" />
            <div className="px-6 pt-7 pb-5 text-center text-white">
              <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-amber-400/20 border-2 border-amber-300/70 flex items-center justify-center shadow-[0_0_24px_rgba(251,191,36,0.7)] animate-pulse">
                <Bell className="h-8 w-8 text-amber-300" />
              </div>
              <p className="text-xs uppercase tracking-[0.25em] font-black text-amber-300">
                Tolerância encerrada
              </p>
              <h2 className="mt-2 text-2xl font-black leading-tight">
                Marque agora o status dos professores
              </h2>
              <p className="mt-3 text-base text-white/90 leading-snug">
                Já se passaram <b className="text-amber-300">{toleranceAlert.tol} min</b> do início do{" "}
                <b>{toleranceAlert.periodLabel}</b>. Você já pode marcar{" "}
                <span className="text-green-300 font-bold">Presente</span>,{" "}
                <span className="text-yellow-300 font-bold">Atrasado</span> ou{" "}
                <span className="text-red-300 font-bold">Ausente</span>.
              </p>
              <p className="mt-2 text-sm text-white/70 tabular-nums">
                Horário de liberação: <b>{toleranceAlert.time}</b>
              </p>
            </div>
            <div className="px-4 pb-5">
              <button
                onClick={() => setToleranceAlert(null)}
                className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-[#0A2A66] font-black text-lg shadow-[0_6px_20px_rgba(251,191,36,0.6)] active:scale-[0.98] transition"
              >
                Entendi, vou marcar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ============================================================
   Modal: editar horários (start_time/end_time/label) de cada
   tempo de cada turno. Permite adicionar e remover.
   ============================================================ */
type DraftPeriod = {
  id?: string;
  shift: Shift;
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
  _delete?: boolean;
};

function PeriodConfigModal({
  schoolId, periods, onClose, onSaved,
}: {
  schoolId: string;
  periods: Period[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<Shift>("manha");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftPeriod[]>(() =>
    periods.map((p) => ({
      id: p.id.startsWith("default-") ? undefined : p.id,
      shift: p.shift,
      period_number: p.period_number,
      label: p.label,
      start_time: p.start_time.slice(0, 5),
      end_time: p.end_time.slice(0, 5),
    })),
  );

  const list = draft
    .filter((p) => p.shift === tab && !p._delete)
    .sort((a, b) => a.period_number - b.period_number);

  const update = (idx: number, patch: Partial<DraftPeriod>) => {
    setDraft((prev) => {
      const next = [...prev];
      const realIdx = prev.indexOf(list[idx]);
      next[realIdx] = { ...next[realIdx], ...patch };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setDraft((prev) => {
      const next = [...prev];
      const realIdx = prev.indexOf(list[idx]);
      if (next[realIdx].id) next[realIdx] = { ...next[realIdx], _delete: true };
      else next.splice(realIdx, 1);
      return next;
    });
  };

  const addRow = () => {
    const nextNumber = (list[list.length - 1]?.period_number ?? 0) + 1;
    const prevEnd = list[list.length - 1]?.end_time ?? (tab === "manha" ? "07:00" : tab === "tarde" ? "13:00" : "19:00");
    setDraft((p) => [...p, {
      shift: tab,
      period_number: nextNumber,
      label: `${nextNumber}º Tempo`,
      start_time: prevEnd,
      end_time: prevEnd,
    }]);
  };

  const save = async () => {
    if (!schoolId) return;
    const validationError = validateSchedulePeriods(draft);
    if (validationError) {
      toast({ title: "Verifique os horários", description: validationError, variant: "destructive" });
      return;
    }
    setSaving(true);
    // Atualizações/inserções

    const toUpsert = draft.filter((p) => !p._delete).map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      school_id: schoolId,
      shift: p.shift,
      period_number: p.period_number,
      label: p.label || `${p.period_number}º Tempo`,
      start_time: p.start_time.length === 5 ? `${p.start_time}:00` : p.start_time,
      end_time: p.end_time.length === 5 ? `${p.end_time}:00` : p.end_time,
    }));
    const toDelete = draft.filter((p) => p._delete && p.id).map((p) => p.id!);

    if (toDelete.length > 0) {
      const { error } = await supabase.from("schedule_periods").delete().in("id", toDelete);
      if (error) { setSaving(false); toast({ title: "Erro ao remover", description: error.message, variant: "destructive" }); return; }
    }
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("schedule_periods")
        .upsert(toUpsert, { onConflict: "school_id,shift,period_number" });
      if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    }

    setSaving(false);
    toast({ title: "Horários atualizados" });
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] rounded-2xl border border-white/15 p-4 flex flex-col text-white shadow-2xl"
        style={{
          background:
            "radial-gradient(120% 80% at 100% 0%, rgba(251,146,60,0.35) 0%, rgba(251,146,60,0) 55%), linear-gradient(160deg, #0A2A66 0%, #112d6e 45%, #1a2350 75%, #3a2050 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg text-white drop-shadow">Configurar horários</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"><X className="h-4 w-4 text-white" /></button>
        </div>
        <p className="text-[11px] text-white/70 mb-2">
          Edite os horários de cada tempo. Cada escola pode ter horários próprios.
        </p>

        <div className="grid grid-cols-3 gap-1 mb-3">
          {(["manha","tarde","noite"] as Shift[]).map((s) => {
            const palette: Record<Shift, { active: string; inactive: string }> = {
              manha: {
                active: "bg-gradient-to-br from-emerald-300 to-emerald-600 text-white shadow-[0_0_18px_rgba(16,185,129,0.7)] ring-2 ring-emerald-200/70",
                inactive: "bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/60",
              },
              tarde: {
                active: "bg-gradient-to-br from-sky-300 to-sky-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.7)] ring-2 ring-sky-200/70",
                inactive: "bg-sky-900/40 text-sky-100 hover:bg-sky-800/60",
              },
              noite: {
                active: "bg-gradient-to-br from-indigo-700 to-slate-900 text-white shadow-[0_0_18px_rgba(30,41,99,0.9)] ring-2 ring-indigo-300/60",
                inactive: "bg-slate-900/50 text-slate-200 hover:bg-slate-800/70",
              },
            };
            const p = palette[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setTab(s)}
                className={`h-10 rounded-lg text-xs font-black transition ${tab === s ? p.active : p.inactive}`}
              >
                {SHIFT_LABEL[s]}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {list.length === 0 && (
            <p className="text-center text-xs text-white/60 py-6">Nenhum tempo. Toque em + para adicionar.</p>
          )}
          {list.map((p, i) => (
            <div key={`${p.id ?? "new"}-${p.period_number}-${i}`} className="rounded-xl border border-white/15 bg-white/5 backdrop-blur p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={p.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder={`${p.period_number}º Tempo`}
                  className="flex-1 h-9 px-2 rounded-lg border border-white/20 bg-white/10 text-white placeholder:text-white/50 text-sm font-bold"
                />
                <input
                  type="number"
                  min={1}
                  value={p.period_number}
                  onChange={(e) => update(i, { period_number: parseInt(e.target.value, 10) || 1 })}
                  className="w-14 h-9 px-2 rounded-lg border border-white/20 bg-white/10 text-white text-sm text-center"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="h-9 w-9 rounded-lg bg-red-500/30 text-red-100 hover:bg-red-500/50 flex items-center justify-center"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-black text-white/70">
                  Início
                  <input
                    type="time"
                    value={p.start_time}
                    onChange={(e) => update(i, { start_time: e.target.value })}
                    className="w-full h-10 px-2 rounded-lg border border-white/20 bg-white/10 text-white text-sm font-mono mt-0.5 [color-scheme:dark]"
                  />
                </label>
                <label className="text-[10px] font-black text-white/70">
                  Fim
                  <input
                    type="time"
                    value={p.end_time}
                    onChange={(e) => update(i, { end_time: e.target.value })}
                    className="w-full h-10 px-2 rounded-lg border border-white/20 bg-white/10 text-white text-sm font-mono mt-0.5 [color-scheme:dark]"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-2 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-1 border border-white/20"
        >
          <Plus className="h-4 w-4" /> Adicionar tempo
        </button>

        <div className="flex gap-2 pt-3">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20">Cancelar</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-[#0A2A66] font-black shadow-[0_0_18px_rgba(251,146,60,0.55)] disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar horários"}
          </button>
        </div>
      </div>
    </div>
  );
}

