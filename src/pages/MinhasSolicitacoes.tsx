import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Clock, CheckCircle2, XCircle, MessageSquare, Loader2 } from "lucide-react";
import { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";

type Booking = {
  id: string;
  topic: string | null;
  description: string | null;
  visitor_name: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  sector: string;
  event_type: string;
  gestor_status: string;
  gestor_response: string | null;
  gestor_responded_at: string | null;
  created_at: string;
};

type HistoryEntry = {
  id: string;
  booking_id: string;
  gestor_status: string;
  gestor_response: string | null;
  decided_by_name: string | null;
  decided_by_role: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  pending: { label: "Aguardando análise", icon: Clock, color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-950/40 border-amber-300/50" },
  approved: { label: "Deferido", icon: CheckCircle2, color: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-950/40 border-green-300/50" },
  denied: { label: "Indeferido", icon: XCircle, color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950/40 border-red-300/50" },
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTime = (t: string) => t.slice(0, 5);

export default function MinhasSolicitacoes() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [historyByBooking, setHistoryByBooking] = useState<Record<string, HistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "denied">("all");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, topic, description, visitor_name, booking_date, start_time, end_time, sector, event_type, gestor_status, gestor_response, gestor_responded_at, created_at")
        .eq("user_id", user.id)
        .eq("event_type", "evento_externo")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const list = (bks ?? []) as Booking[];
      setBookings(list);

      if (list.length > 0) {
        const ids = list.map((b) => b.id);
        const { data: hist } = await supabase
          .from("booking_gestor_history")
          .select("id, booking_id, gestor_status, gestor_response, decided_by_name, decided_by_role, created_at")
          .in("booking_id", ids)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        const grouped: Record<string, HistoryEntry[]> = {};
        for (const h of (hist ?? []) as HistoryEntry[]) {
          (grouped[h.booking_id] ||= []).push(h);
        }
        setHistoryByBooking(grouped);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`my-solicitacoes-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${user.id}` }, () => {
        // refetch on any change
        supabase
          .from("bookings")
          .select("id, topic, description, visitor_name, booking_date, start_time, end_time, sector, event_type, gestor_status, gestor_response, gestor_responded_at, created_at")
          .eq("user_id", user.id)
          .eq("event_type", "evento_externo")
          .order("created_at", { ascending: false })
          .then(({ data }) => { if (!cancelled) setBookings((data ?? []) as Booking[]); });
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  const filtered = bookings.filter((b) => filter === "all" || b.gestor_status === filter);
  const counts = {
    all: bookings.length,
    pending: bookings.filter((b) => b.gestor_status === "pending").length,
    approved: bookings.filter((b) => b.gestor_status === "approved").length,
    denied: bookings.filter((b) => b.gestor_status === "denied").length,
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-20 sm:pt-24">
      {/* Header padrão */}
      <div className="px-3">
        <GestorPremiumHeader
          title="Minhas Solicitações"
          subtitle="Histórico documental enviado à gestão"
          icon={<FileText className="h-5 w-5 sm:h-6 sm:w-6 text-amber-950" />}
        />
      </div>

      {/* Filter chips */}
      <div className="grid grid-cols-4 gap-1 px-3 pt-3">
        {([
          { key: "all", label: "Todas", count: counts.all },
          { key: "pending", label: "Pendentes", count: counts.pending },
          { key: "approved", label: "Deferidas", count: counts.approved },
          { key: "denied", label: "Indeferidas", count: counts.denied },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight leading-tight transition-all min-w-0 border ${
              filter === f.key
                ? "bg-primary text-primary-foreground shadow border-primary"
                : "bg-muted/50 text-muted-foreground hover:bg-muted border-border"
            }`}
          >
            <span className="truncate max-w-full">{f.label}</span>
            <span className="opacity-70 text-[9px]">({f.count})</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 px-3 py-3 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Carregando solicitações…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3 px-6">
            <FileText className="h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">
              {filter === "all"
                ? "Você ainda não enviou solicitações de evento externo."
                : "Nenhuma solicitação neste filtro."}
            </p>
          </div>
        ) : (
          filtered.map((b) => {
            const meta = STATUS_META[b.gestor_status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            const history = historyByBooking[b.id] ?? [];
            return (
              <div key={b.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                {/* Header card */}
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-foreground break-words leading-snug">
                        {b.topic?.trim() || b.description?.trim() || b.visitor_name?.trim() || "Evento externo"}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {fmtDate(b.booking_date)} · {fmtTime(b.start_time)}–{fmtTime(b.end_time)} · {b.sector}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${meta.bg} ${meta.color}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                </div>

                {/* Conversation thread */}
                <div className="px-4 py-3 space-y-2.5 bg-muted/30">
                  {/* Sent (request) */}
                  <div className="flex flex-col items-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-bold opacity-80 mb-0.5">Você enviou</p>
                      {b.description?.trim() && (
                        <p className="text-xs whitespace-pre-wrap break-words">{b.description.trim()}</p>
                      )}
                      {b.visitor_name?.trim() && (
                        <p className="text-[11px] opacity-90 mt-1">Visitante: {b.visitor_name.trim()}</p>
                      )}
                      {!b.description?.trim() && !b.visitor_name?.trim() && (
                        <p className="text-xs opacity-90">Solicitação sem detalhes adicionais.</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 mr-1">{fmtDateTime(b.created_at)}</span>
                  </div>

                  {/* Manager replies (history) */}
                  {history.length === 0 && b.gestor_status === "pending" && (
                    <div className="flex flex-col items-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-card border border-border px-3 py-2 text-xs text-muted-foreground italic flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Aguardando análise da gestão…
                      </div>
                    </div>
                  )}

                  {history.map((h) => {
                    const hMeta = STATUS_META[h.gestor_status] ?? STATUS_META.pending;
                    const HIcon = hMeta.icon;
                    return (
                      <div key={h.id} className="flex flex-col items-start">
                        <div className={`max-w-[85%] rounded-2xl rounded-tl-sm border px-3 py-2 shadow-sm ${hMeta.bg}`}>
                          <p className={`text-[11px] font-bold flex items-center gap-1 ${hMeta.color}`}>
                            <HIcon className="h-3 w-3" />
                            {hMeta.label}
                            {h.decided_by_name && <span className="font-normal opacity-80"> · {h.decided_by_name}</span>}
                          </p>
                          {h.gestor_response?.trim() ? (
                            <p className="text-xs text-foreground whitespace-pre-wrap break-words mt-1">
                              {h.gestor_response.trim()}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground italic mt-1">Sem justificativa adicional.</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 ml-1">{fmtDateTime(h.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {!loading && bookings.length > 0 && (
          <p className="text-[10px] text-center text-muted-foreground/70 pt-2 pb-4 flex items-center justify-center gap-1">
            <MessageSquare className="h-3 w-3" />
            Suas solicitações ficam armazenadas aqui permanentemente.
          </p>
        )}
      </div>
    </div>
  );
}
