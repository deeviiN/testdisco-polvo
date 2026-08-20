import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Check, X, Clock, FileText, Users } from "lucide-react";
import { format } from "date-fns";
import AssistenteHeader from "@/components/AssistenteHeader";

type BookingRow = {
  id: string;
  start_time: string;
  end_time: string;
  topic: string | null;
  discipline: string | null;
  user_id: string;
  visitor_name: string | null;
  sector: string;
};
type PresenceRow = {
  id: string;
  booking_id: string;
  status: "presente" | "ausente" | "atrasado" | "justificado";
  notes: string | null;
};

const STATUS_OPTIONS: { value: PresenceRow["status"]; label: string; cls: string; icon: any }[] = [
  { value: "presente",    label: "Presente",    cls: "bg-blue-500 text-white", icon: Check },
  { value: "ausente",     label: "Ausente",     cls: "bg-red-500 text-white",     icon: X },
  { value: "atrasado",    label: "Atrasado",    cls: "bg-amber-500 text-white",   icon: Clock },
  { value: "justificado", label: "Justificado", cls: "bg-sky-500 text-white",     icon: FileText },
];

export default function ControlePresenca() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [presences, setPresences] = useState<Record<string, PresenceRow>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const canMark =
    profile?.role === "assistente" ||
    profile?.role === "secretario_escolar" ||
    profile?.role === "gestor_pedagogico" ||
    profile?.role === "chef_projeto_vida" ||
    profile?.role === "coord_pedagogico" ||
    profile?.role === "supervisor";

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    const { data: bs } = await supabase
      .from("bookings")
      .select("id, start_time, end_time, topic, discipline, user_id, visitor_name, sector")
      .eq("school_id", profile.school_id)
      .eq("booking_date", date)
      .eq("status", "confirmed")
      .order("start_time", { ascending: true });
    const list = (bs ?? []) as BookingRow[];
    setBookings(list);

    const ids = list.map((b) => b.id);
    if (ids.length) {
      const { data: ps } = await supabase
        .from("teacher_presence")
        .select("id, booking_id, status, notes")
        .in("booking_id", ids);
      const map: Record<string, PresenceRow> = {};
      (ps as PresenceRow[] | null)?.forEach((p) => { map[p.booking_id] = p; });
      setPresences(map);
    } else setPresences({});

    const userIds = Array.from(new Set(list.map((b) => b.user_id)));
    if (userIds.length) {
      const { data: prs } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", userIds);
      const m: Record<string, string> = {};
      (prs as { user_id: string; full_name: string }[] | null)?.forEach((p) => { m[p.user_id] = p.full_name; });
      setProfiles(m);
    }
  }, [profile?.school_id, date]);

  useEffect(() => { load(); }, [load]);

  const mark = async (b: BookingRow, status: PresenceRow["status"]) => {
    if (!profile?.school_id || !canMark) return;
    setLoading(true);
    const existing = presences[b.id];
    let error;
    if (existing) {
      ({ error } = await supabase.from("teacher_presence")
        .update({ status, marked_by: profile.user_id, marked_at: new Date().toISOString() })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("teacher_presence").insert({
        school_id: profile.school_id,
        booking_id: b.id,
        teacher_user_id: b.user_id,
        status,
        marked_by: profile.user_id,
      }));
    }
    setLoading(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  };

  const summary = useMemo(() => {
    const s: Record<string, number> = { presente: 0, ausente: 0, atrasado: 0, justificado: 0 };
    Object.values(presences).forEach((p) => { s[p.status] = (s[p.status] || 0) + 1; });
    return s;
  }, [presences]);

  if (!canMark) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="text-muted-foreground">Apenas assistentes de aluno e gestores podem registrar a presença do professor.</p>
        <button onClick={() => navigate(-1)} className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold">Voltar</button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-12">
      <AssistenteHeader subtitle="Presença do Professor — marque se compareceu" />


      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <div>
          <label className="text-xs font-bold uppercase text-muted-foreground">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-12 px-3 rounded-xl border bg-background font-semibold mt-1"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {STATUS_OPTIONS.map((o) => (
            <div key={o.value} className={`rounded-xl p-2 text-center ${o.cls}`}>
              <p className="text-2xl font-black">{summary[o.value] || 0}</p>
              <p className="text-[10px] uppercase font-bold tracking-wider">{o.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {bookings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum agendamento para esta data</p>
            </div>
          )}
          {bookings.map((b) => {
            const cur = presences[b.id];
            const name = profiles[b.user_id] || b.visitor_name || "—";
            return (
              <div key={b.id} className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">
                      {b.start_time.slice(0, 5)} às {b.end_time.slice(0, 5)} · {b.sector.replace(/_/g, " ")}
                    </p>
                    <p className="font-bold text-lg break-words leading-tight">{name}</p>
                    {(b.discipline || b.topic) && (
                      <p className="text-sm text-muted-foreground break-words">{b.discipline || b.topic}</p>
                    )}
                  </div>
                  {cur && (
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${STATUS_OPTIONS.find((o) => o.value === cur.status)?.cls}`}>
                      {STATUS_OPTIONS.find((o) => o.value === cur.status)?.label.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {STATUS_OPTIONS.map((o) => {
                    const Icon = o.icon;
                    const active = cur?.status === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() => mark(b, o.value)}
                        disabled={loading}
                        className={`h-14 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 transition ${active ? o.cls + " ring-2 ring-offset-2 ring-offset-card ring-foreground/30" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
