import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

type Row = {
  id: string;
  roster_id: string;
  status: string;
  presence_date: string;
  updated_at: string;
  roster: {
    teacher_name: string;
    nickname: string | null;
    discipline: string | null;
    class_name: string | null;
    start_time: string;
    end_time: string;
    shift: string | null;
    assistant_user_id: string;
  } | null;
  assistant_name?: string;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ausente:     { label: "AUSENTE",     cls: "bg-red-500 text-white" },
  atrasado:    { label: "ATRASADO",    cls: "bg-amber-500 text-white" },
  justificado: { label: "JUSTIFICADO", cls: "bg-sky-500 text-white" },
  presente:    { label: "PRESENTE",    cls: "bg-blue-500 text-white" },
};

export default function GestorAusenciasHoje() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");
  const [rows, setRows] = useState<Row[]>([]);
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    const { data } = await supabase
      .from("teacher_roster_presence")
      .select("id, roster_id, status, presence_date, updated_at, roster:teacher_roster(teacher_name,nickname,discipline,class_name,start_time,end_time,shift,assistant_user_id)")
      .eq("school_id", profile.school_id)
      .eq("presence_date", today)
      .order("updated_at", { ascending: false });
    const list = (data ?? []) as any as Row[];
    const ids = Array.from(new Set(list.map((r) => r.roster?.assistant_user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id,full_name").in("user_id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p.full_name; });
      list.forEach((r) => { if (r.roster) r.assistant_name = map[r.roster.assistant_user_id]; });
    }
    setRows(list);
  }, [profile?.school_id, today]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase.channel(`gestor-ausencias-${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_roster_presence", filter: `school_id=eq.${profile.school_id}` }, () => {
        setPulse(true);
        setTimeout(() => setPulse(false), 4000);
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id, load]);

  const ausentes = rows.filter((r) => r.status === "ausente" || r.status === "atrasado");

  return (
    <div className="min-h-dvh bg-background pb-12">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">Professores ausentes hoje</h1>
          <p className="text-xs text-muted-foreground">{format(new Date(), "dd/MM/yyyy")} · ao vivo</p>
        </div>
        {pulse && <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">NOVO</span>}
      </header>

      <div className="px-4 pt-4 space-y-2">
        {ausentes.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma ausência registrada hoje.</p>
          </div>
        )}
        {ausentes.map((r) => {
          const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.ausente;
          return (
            <div key={r.id} className="rounded-2xl border bg-card p-3 flex items-start gap-3">
              <span className={`px-2 py-1 rounded-full text-[10px] font-black ${s.cls}`}>{s.label}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold break-words leading-tight">{(() => { const n = (r.roster?.nickname ?? "").trim(); if (n) return n; const parts = (r.roster?.teacher_name ?? "").trim().split(/\s+/).filter(Boolean); return parts.length <= 1 ? (parts[0] ?? "—") : `${parts[0]} ${parts[parts.length-1]}`; })()}</p>
                <p className="text-xs text-muted-foreground break-words">
                  {[r.roster?.discipline, r.roster?.class_name].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs font-mono text-muted-foreground">
                  {r.roster?.start_time.slice(0, 5)}–{r.roster?.end_time.slice(0, 5)} · {r.roster?.shift}
                </p>
                {r.assistant_name && (
                  <p className="text-[11px] text-muted-foreground mt-1">marcado por <b>{r.assistant_name}</b></p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
