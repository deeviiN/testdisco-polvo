import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, BarChart3 } from "lucide-react";
import { format, subDays } from "date-fns";

type Row = {
  id: string;
  booking_id: string;
  teacher_user_id: string;
  status: string;
  notes: string | null;
  marked_at: string;
};
type BookingInfo = { id: string; booking_date: string; start_time: string; end_time: string; sector: string; discipline: string | null; topic: string | null };

export default function RelatoriosPresenca() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [bookings, setBookings] = useState<Record<string, BookingInfo>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const isManager = profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida";

  useEffect(() => {
    if (!profile?.school_id) return;
    (async () => {
      const { data: ps } = await supabase
        .from("teacher_presence")
        .select("id, booking_id, teacher_user_id, status, notes, marked_at")
        .eq("school_id", profile.school_id)
        .gte("marked_at", `${from}T00:00:00`)
        .lte("marked_at", `${to}T23:59:59`)
        .order("marked_at", { ascending: false });
      const list = (ps as Row[]) ?? [];
      setRows(list);

      const bIds = Array.from(new Set(list.map((r) => r.booking_id)));
      if (bIds.length) {
        const { data: bs } = await supabase
          .from("bookings")
          .select("id, booking_date, start_time, end_time, sector, discipline, topic")
          .in("id", bIds);
        const bm: Record<string, BookingInfo> = {};
        (bs as BookingInfo[] | null)?.forEach((b) => { bm[b.id] = b; });
        setBookings(bm);
      }
      const uIds = Array.from(new Set(list.map((r) => r.teacher_user_id)));
      if (uIds.length) {
        const { data: prs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uIds);
        const pm: Record<string, string> = {};
        (prs as { user_id: string; full_name: string }[] | null)?.forEach((p) => { pm[p.user_id] = p.full_name; });
        setProfiles(pm);
      }
    })();
  }, [profile?.school_id, from, to]);

  const summary = useMemo(() => {
    const s: Record<string, number> = { presente: 0, ausente: 0, atrasado: 0, justificado: 0 };
    rows.forEach((r) => { s[r.status] = (s[r.status] || 0) + 1; });
    const total = rows.length || 1;
    return {
      presente: s.presente, ausente: s.ausente, atrasado: s.atrasado, justificado: s.justificado,
      total: rows.length, taxa: ((s.presente / total) * 100).toFixed(1),
    };
  }, [rows]);

  const exportCsv = () => {
    const header = "Data,Horario,Setor,Professor,Status,Observação\n";
    const body = rows.map((r) => {
      const b = bookings[r.booking_id];
      const name = profiles[r.teacher_user_id] || "—";
      return `${b?.booking_date || ""},${b ? b.start_time.slice(0,5) + "-" + b.end_time.slice(0,5) : ""},${b?.sector || ""},"${name}",${r.status},"${(r.notes || "").replace(/"/g, '""')}"`;
    }).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `presenca_professores_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isManager) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="text-muted-foreground">Apenas gestores podem ver os relatórios.</p>
        <button onClick={() => navigate(-1)} className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold">Voltar</button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-12">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-md">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Presença dos Professores</h1>
          <p className="text-xs opacity-80">Consolidado por período</p>
        </div>
        <button onClick={exportCsv} className="p-2 rounded-full hover:bg-white/10" title="Exportar CSV">
          <Download className="h-5 w-5" />
        </button>
      </header>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border bg-background font-semibold mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border bg-background font-semibold mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-xl bg-card border p-3">
            <p className="text-xs uppercase text-muted-foreground font-bold">Total</p>
            <p className="text-2xl font-black">{summary.total}</p>
          </div>
          <div className="rounded-xl bg-blue-500 text-white p-3">
            <p className="text-xs uppercase font-bold opacity-90">Presentes</p>
            <p className="text-2xl font-black">{summary.presente}</p>
          </div>
          <div className="rounded-xl bg-red-500 text-white p-3">
            <p className="text-xs uppercase font-bold opacity-90">Ausentes</p>
            <p className="text-2xl font-black">{summary.ausente}</p>
          </div>
          <div className="rounded-xl bg-amber-500 text-white p-3">
            <p className="text-xs uppercase font-bold opacity-90">Atrasados</p>
            <p className="text-2xl font-black">{summary.atrasado}</p>
          </div>
          <div className="rounded-xl bg-primary text-primary-foreground p-3">
            <p className="text-xs uppercase font-bold opacity-90">Taxa Presença</p>
            <p className="text-2xl font-black">{summary.taxa}%</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-2 px-4 py-2 bg-muted text-xs font-bold uppercase">
            <div>Data</div><div>Horário</div><div>Professor</div><div>Status</div>
          </div>
          {rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>Sem registros no período</p>
            </div>
          )}
          {rows.map((r) => {
            const b = bookings[r.booking_id];
            return (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-2 px-4 py-2 border-t text-sm">
                <div>{b?.booking_date || "—"}</div>
                <div className="font-mono">{b ? `${b.start_time.slice(0,5)}-${b.end_time.slice(0,5)}` : "—"}</div>
                <div className="font-semibold break-words">{profiles[r.teacher_user_id] || "—"}</div>
                <div className="capitalize">{r.status}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
