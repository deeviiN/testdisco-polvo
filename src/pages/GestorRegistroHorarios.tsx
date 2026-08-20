import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Lock, Clock, Bell, Calendar, Coffee, ShieldCheck } from "lucide-react";

type LogRow = {
  id: string;
  created_at: string;
  actor_name: string;
  actor_role: string;
  change_type: string;
  shift: string | null;
  reduced_date: string | null;
  summary: string;
  details: any;
};

const TYPE_ICON: Record<string, any> = {
  periods: Clock,
  reduced_day: Calendar,
  siren: Bell,
  break_after: Coffee,
};
const TYPE_LABEL: Record<string, string> = {
  periods: "Horários (quadro padrão)",
  reduced_day: "Tempo reduzido do dia",
  siren: "Sirene da escola",
  break_after: "Intervalo / recreio",
};
const ROLE_LABEL: Record<string, string> = {
  gestor_pedagogico: "Gestor(a)",
  chef_projeto_vida: "Chef da Sala",
  coord_pedagogico: "Coordenador(a)",
  supervisor: "Supervisor(a)",
  secretario_escolar: "Secretário(a)",
  teacher: "Professor(a)",
};
const SHIFT_LABEL: Record<string, string> = { manha: "MANHÃ", tarde: "TARDE", noite: "NOITE" };

export default function GestorRegistroHorarios() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.school_id) return;
    (async () => {
      const { data } = await supabase
        .from("schedule_change_logs")
        .select("*")
        .eq("school_id", profile.school_id)
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data ?? []) as LogRow[]);
      setLoading(false);
    })();
  }, [profile?.school_id]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-100 via-blue-50/40 to-slate-100 text-slate-900 pb-24">
      <header className="bg-gradient-to-br from-[#081F4D] via-[#103A8A] to-[#0A2A66] text-white px-4 pt-[60px] pb-4 sticky top-0 z-30 shadow-lg shadow-blue-900/30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/gestor"))}
            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold leading-none">Coordenação / Gestão</p>
            <p className="font-black text-base break-words leading-tight">Registro de alterações</p>
            <p className="text-[11px] text-white/80 leading-snug mt-0.5 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Permanente — não pode ser apagado
            </p>
          </div>
        </div>
      </header>

      <section className="px-3 pt-3 space-y-2">
        {loading && <p className="text-center text-xs text-slate-400 py-8">Carregando…</p>}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
            <Lock className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">Sem registros ainda</p>
            <p className="text-[11px] text-slate-500 mt-1">As alterações de horários, sirene, intervalo e tempo reduzido aparecerão aqui.</p>
          </div>
        )}
        {rows.map((r) => {
          const Icon = TYPE_ICON[r.change_type] ?? Clock;
          return (
            <div key={r.id} className="rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#103A8A] to-[#0A2A66] text-white flex items-center justify-center shrink-0 shadow-md">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0A2A66] bg-blue-50 px-1.5 py-0.5 rounded">
                      {TYPE_LABEL[r.change_type] ?? r.change_type}
                    </span>
                    {r.shift && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {SHIFT_LABEL[r.shift] ?? r.shift}
                      </span>
                    )}
                    {r.reduced_date && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                        {r.reduced_date.split("-").reverse().join("/")}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-sm text-slate-900 break-words mt-1">{r.summary}</p>
                  <p className="text-[11px] text-slate-600 break-words mt-0.5">
                    <span className="font-black">{r.actor_name}</span>
                    <span className="text-slate-400"> · </span>
                    {ROLE_LABEL[r.actor_role] ?? r.actor_role}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{fmt(r.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
