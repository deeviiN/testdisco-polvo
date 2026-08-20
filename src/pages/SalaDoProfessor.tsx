import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RefreshCw, Users, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

const ALLOWED_ROLES = [
  "admin",
  "gestor_pedagogico",
  "chef_projeto_vida",
  "coord_pedagogico",
  "supervisor",
];

type Roster = {
  id: string;
  teacher_name: string;
  discipline: string | null;
  class_name: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  shift: string | null;
  assistant_user_id: string;
};

type Presence = {
  id: string;
  roster_id: string;
  status: string;
  notes: string | null;
  marked_by: string | null;
  updated_at: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  presente:    { label: "PRESENTE",    cls: "bg-blue-500 text-white" },
  ausente:     { label: "AUSENTE",     cls: "bg-red-500 text-white" },
  atrasado:    { label: "ATRASADO",    cls: "bg-amber-500 text-white" },
  justificado: { label: "JUSTIFICADO", cls: "bg-sky-500 text-white" },
};

const FILTERS = [
  { key: "todos",       label: "Todos" },
  { key: "presente",    label: "Presentes" },
  { key: "ausente",     label: "Ausentes" },
  { key: "atrasado",    label: "Atrasados" },
  { key: "justificado", label: "Justificados" },
  { key: "sem",         label: "Sem marcação" },
] as const;

export default function SalaDoProfessor() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");
  const weekday = new Date().getDay();
  const [roster, setRoster] = useState<Roster[]>([]);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [assistants, setAssistants] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<typeof FILTERS[number]["key"]>("todos");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase
        .from("teacher_roster")
        .select("id, teacher_name, discipline, class_name, weekday, start_time, end_time, shift, assistant_user_id")
        .eq("school_id", profile.school_id)
        .eq("weekday", weekday)
        .order("start_time", { ascending: true }),
      supabase
        .from("teacher_roster_presence")
        .select("id, roster_id, status, notes, marked_by, updated_at")
        .eq("school_id", profile.school_id)
        .eq("presence_date", today),
    ]);
    const rosterList = (r ?? []) as Roster[];
    setRoster(rosterList);
    const map: Record<string, Presence> = {};
    (p ?? []).forEach((it: any) => { map[it.roster_id] = it; });
    setPresence(map);

    const ids = Array.from(new Set(rosterList.map((x) => x.assistant_user_id))).filter(Boolean);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id,full_name").in("user_id", ids);
      const a: Record<string, string> = {};
      (profs ?? []).forEach((x: any) => { a[x.user_id] = x.full_name; });
      setAssistants(a);
    }
    setLoading(false);
  }, [profile?.school_id, today, weekday]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase.channel(`sala-prof-${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster_presence", filter: `school_id=eq.${profile.school_id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster", filter: `school_id=eq.${profile.school_id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id, load]);

  const counts = useMemo(() => {
    const c = { presente: 0, ausente: 0, atrasado: 0, justificado: 0, sem: 0 };
    roster.forEach((r) => {
      const s = presence[r.id]?.status;
      if (s && s in c) (c as any)[s]++;
      else c.sem++;
    });
    return c;
  }, [roster, presence]);

  const filtered = useMemo(() => {
    return roster.filter((r) => {
      const s = presence[r.id]?.status;
      if (filter === "todos") return true;
      if (filter === "sem") return !s;
      return s === filter;
    });
  }, [roster, presence, filter]);

  const canAccess = profile?.role && ALLOWED_ROLES.includes(profile.role);

  if (!canAccess) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="text-muted-foreground text-sm">
          Apenas gestores, coordenação e direção podem acessar a Sala do Professor.
        </p>
        <button onClick={() => navigate(-1)} className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-12">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight flex items-center gap-2">
            <Users className="h-5 w-5" /> Sala do Professor
          </h1>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, dd/MM/yyyy")} · status do dia
          </p>
        </div>
        <button onClick={load} disabled={loading} className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="px-3 pt-3 grid grid-cols-5 gap-1.5">
        {([
          ["presente", "Presentes", "bg-blue-500"],
          ["ausente", "Ausentes", "bg-red-500"],
          ["atrasado", "Atrasados", "bg-amber-500"],
          ["justificado", "Justif.", "bg-sky-500"],
          ["sem", "S/ marc.", "bg-muted-foreground"],
        ] as const).map(([k, l, c]) => (
          <div key={k} className={`rounded-xl ${c} text-white p-2 text-center`}>
            <div className="text-2xl font-black leading-none">{(counts as any)[k]}</div>
            <div className="text-[10px] font-bold opacity-90 mt-1">{l}</div>
          </div>
        ))}
      </div>

      <div className="px-3 pt-3 grid grid-cols-3 gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`h-9 w-full rounded-full text-[11px] font-bold border ${
              filter === f.key ? "bg-foreground text-background border-foreground" : "bg-card text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-3 pt-3 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Nenhum professor neste filtro.
          </div>
        )}
        {filtered.map((r) => {
          const pr = presence[r.id];
          const s = pr ? STATUS[pr.status] : null;
          return (
            <div key={r.id} className="rounded-2xl border bg-card p-3 flex items-start gap-3">
              <span className={`px-2 py-1 rounded-full text-[10px] font-black ${s ? s.cls : "bg-muted text-muted-foreground"}`}>
                {s ? s.label : "—"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold break-words leading-tight">{r.teacher_name}</p>
                <p className="text-xs text-muted-foreground break-words">
                  {[r.discipline, r.class_name].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-xs font-mono text-muted-foreground">
                  {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}{r.shift ? ` · ${r.shift}` : ""}
                </p>
                {pr?.notes && <p className="text-[11px] mt-1 italic break-words">"{pr.notes}"</p>}
                {assistants[r.assistant_user_id] && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ass. de aluno: <b>{assistants[r.assistant_user_id]}</b>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
