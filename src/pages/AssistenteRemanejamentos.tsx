import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, Undo2, ArrowUp } from "lucide-react";
import { format } from "date-fns";

type Row = {
  id: string;
  reassignment_date: string;
  class_name: string;
  shift: string;
  absent_teacher_name: string;
  absent_period_number: number;
  covering_teacher_name: string;
  covering_original_period: number;
  vacated_period_number: number;
  vacated_end_time: string | null;
  reason: string;
  created_at: string;
  cancelled_at: string | null;
};

export default function AssistenteRemanejamentos() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("room_reassignments" as any)
      .select("*")
      .eq("school_id", profile.school_id)
      .eq("reassignment_date", date)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data ?? []) as unknown as Row[]);
  }, [profile?.school_id, date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase
      .channel("room_reassignments_page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_reassignments", filter: `school_id=eq.${profile.school_id}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id, load]);

  const copyNotice = async (r: Row) => {
    const notice = `AVISO: ${r.class_name} sairá às ${r.vacated_end_time ?? "--:--"} hoje. Motivo: Antecipação de aula (${r.covering_teacher_name} cobriu o ${r.absent_period_number}º tempo).`;
    try {
      await navigator.clipboard.writeText(notice);
      toast({ title: "Aviso copiado" });
    } catch {
      toast({ title: notice });
    }
  };

  const undo = async (r: Row) => {
    if (!confirm("Cancelar este remanejamento?")) return;
    const { error } = await supabase
      .from("room_reassignments" as any)
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile?.user_id } as any)
      .eq("id", r.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="min-h-dvh bg-background pb-12">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/assistente")} className="h-9 w-9 rounded-lg border flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base leading-tight">Remanejamentos do Dia</h1>
          <p className="text-xs text-muted-foreground">Coberturas por hierarquia registradas hoje</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 px-2 rounded-md border bg-background text-xs font-semibold"
        />
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-2">
        {loading && <p className="text-center text-sm text-muted-foreground py-8">Carregando…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">
            Nenhum remanejamento nesta data.
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl border p-3 space-y-2 ${r.cancelled_at ? "opacity-60 border-dashed" : "bg-card"}`}
          >
            <div className="flex items-start gap-2">
              <ArrowUp className={`h-4 w-4 shrink-0 mt-1 ${r.cancelled_at ? "text-muted-foreground" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-muted-foreground">
                  {format(new Date(r.created_at), "HH:mm")} · {r.class_name} · {r.shift}
                </p>
                <p className="text-sm font-bold leading-tight">
                  {r.absent_teacher_name} <span className="font-normal text-muted-foreground">ausente no {r.absent_period_number}º</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">→ Substituído por </span>
                  <span className="font-bold">{r.covering_teacher_name}</span>
                  <span className="text-muted-foreground"> (veio do {r.covering_original_period}º)</span>
                </p>
                <p className="text-[11px] mt-1">
                  Turma sai às <span className="font-bold">{r.vacated_end_time ?? "--:--"}</span> ·{" "}
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${r.cancelled_at ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-800"}`}>
                    {r.cancelled_at ? "Cancelado" : "Confirmado"}
                  </span>
                </p>
              </div>
            </div>
            {!r.cancelled_at && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => copyNotice(r)}
                  className="h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar aviso
                </button>
                <button
                  onClick={() => undo(r)}
                  className="h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
