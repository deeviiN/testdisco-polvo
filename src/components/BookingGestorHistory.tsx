import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  History,
  FilePlus2,
  Hourglass,
  FileText,
  MessageSquareQuote,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HistoryRow {
  id: string;
  gestor_status: string;
  gestor_response: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_by_role: string | null;
  created_at: string;
}

interface BookingMeta {
  created_at: string;
  user_id: string;
  requester_name?: string | null;
  requester_role?: string | null;
}

interface TimelineEvent {
  key: string;
  type: "created" | "pending" | "decision";
  status?: string;
  at: string;
  authorName?: string | null;
  authorRole?: string | null;
  response?: string | null;
}

interface Props {
  bookingId: string;
}

export default function BookingGestorHistory({ bookingId }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [booking, setBooking] = useState<BookingMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  type FilterKey = "all" | "created" | "pending" | "approved" | "denied";
  const [filter, setFilter] = useState<FilterKey>("all");

  const loadHistory = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [historyRes, bkRes] = await Promise.all([
        supabase
          .from("booking_gestor_history")
          .select(
            "id, gestor_status, gestor_response, decided_by, decided_by_name, decided_by_role, created_at"
          )
          .eq("booking_id", bookingId)
          .order("created_at", { ascending: true }),
        supabase
          .from("bookings")
          .select("created_at, user_id")
          .eq("id", bookingId)
          .maybeSingle(),
      ]);

      if (historyRes.error) throw historyRes.error;
      if (bkRes.error) throw bkRes.error;

      const bk = bkRes.data;
      let requesterName: string | null = null;
      let requesterRole: string | null = null;
      if (bk?.user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("user_id", bk.user_id)
          .maybeSingle();
        requesterName = prof?.full_name ?? null;
        requesterRole = prof?.role ?? null;
      }

      setRows((historyRes.data as HistoryRow[]) ?? []);
      setBooking(
        bk
          ? {
              created_at: bk.created_at,
              user_id: bk.user_id,
              requester_name: requesterName,
              requester_role: requesterRole,
            }
          : null
      );
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadHistory("initial");
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Refetch ao abrir o modal para garantir versões atualizadas
  useEffect(() => {
    if (modalOpen) {
      loadHistory("refresh");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  if (loading || !booking) return null;

  // Monta timeline cronológica
  const events: TimelineEvent[] = [];
  events.push({
    key: "created",
    type: "created",
    at: booking.created_at,
    authorName: booking.requester_name,
    authorRole: booking.requester_role,
  });
  events.push({
    key: "pending",
    type: "pending",
    at: booking.created_at,
  });
  rows.forEach((r) => {
    events.push({
      key: r.id,
      type: "decision",
      status: r.gestor_status,
      at: r.created_at,
      authorName: r.decided_by_name,
      authorRole: r.decided_by_role,
      response: r.gestor_response,
    });
  });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const totalCount = events.length;

  // Versões com justificativa (ordem mais recente primeiro)
  const justificationVersions = [...rows]
    .filter((r) => r.gestor_response && r.gestor_response.trim().length > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latest = justificationVersions[0];

  const renderEventIcon = (ev: TimelineEvent) => {
    if (ev.type === "created") return { Icon: FilePlus2, color: "text-sky-600 dark:text-sky-400", borderColor: "rgb(2 132 199)", label: "Reserva criada" };
    if (ev.type === "pending") return { Icon: Hourglass, color: "text-amber-600 dark:text-amber-400", borderColor: "rgb(245 158 11)", label: "Aguardando decisão do gestor" };
    if (ev.status === "approved") return { Icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", borderColor: "rgb(16 185 129)", label: "Aprovada pelo gestor" };
    if (ev.status === "denied") return { Icon: XCircle, color: "text-destructive", borderColor: "hsl(var(--destructive))", label: "Recusada pelo gestor" };
    return { Icon: Clock, color: "text-muted-foreground", borderColor: "hsl(var(--border))", label: "Atualização" };
  };

  return (
    <div className="mt-1 rounded-md border border-border/60 bg-muted/30">
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="flex-1 flex items-center justify-between gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/50 transition-colors rounded-md"
        >
          <span className="flex items-center gap-1.5">
            <History className="h-3 w-3" />
            Linha do tempo ({totalCount})
          </span>
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {justificationVersions.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider gap-1"
          >
            <FileText className="h-3 w-3" />
            Ver justificativa ({justificationVersions.length})
          </Button>
        )}
      </div>
      {open && (
        <div className="px-2 pb-2 pt-1">
          <div className="flex flex-wrap gap-1 mb-2">
            {([
              { k: "all", label: `Todos (${events.length})` },
              { k: "created", label: "Criação" },
              { k: "pending", label: "Pendência" },
              { k: "approved", label: "Aprovações" },
              { k: "denied", label: "Recusas" },
            ] as { k: FilterKey; label: string }[]).map((opt) => {
              const active = filter === opt.k;
              return (
                <button
                  key={opt.k}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilter(opt.k);
                  }}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background/60 text-muted-foreground border-border hover:bg-muted/60"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {(() => {
            const filtered = events.filter((ev) => {
              if (filter === "all") return true;
              if (filter === "created") return ev.type === "created";
              if (filter === "pending") return ev.type === "pending";
              if (filter === "approved") return ev.type === "decision" && ev.status === "approved";
              if (filter === "denied") return ev.type === "decision" && ev.status === "denied";
              return true;
            });
            if (filtered.length === 0) {
              return (
                <p className="text-[11px] text-muted-foreground italic px-2 py-3 text-center">
                  Nenhum evento neste filtro.
                </p>
              );
            }
            return (
              <ol className="space-y-2 relative">
                {filtered.map((ev, idx) => {
                  const isLast = idx === filtered.length - 1;
                  const { Icon, color, borderColor, label } = renderEventIcon(ev);

            return (
              <li
                key={ev.key}
                className="flex gap-2 text-[11px] border-l-2 pl-2 py-0.5 relative"
                style={{ borderColor }}
              >
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-bold ${color}`}>{label}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {format(parseISO(ev.at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {ev.authorName && (
                      <>
                        {" "}
                        por{" "}
                        <span className="font-semibold text-foreground">
                          {ev.authorName}
                        </span>
                        {ev.authorRole && (
                          <span className="text-muted-foreground/80">
                            {" "}
                            ({ev.authorRole.replace(/_/g, " ")})
                          </span>
                        )}
                      </>
                    )}
                    {ev.type === "pending" && (
                      <span className="italic"> — automático ao criar a reserva</span>
                    )}
                  </p>
                  {ev.response && (
                    <p className="text-foreground/90 whitespace-pre-wrap break-words leading-snug mt-0.5">
                      {ev.response}
                    </p>
                  )}
                </div>
                {!isLast && (
                  <span
                    aria-hidden
                    className="absolute left-[-1px] top-5 bottom-[-8px] w-[2px]"
                    style={{ background: "hsl(var(--border))" }}
                  />
                )}
              </li>
            );
          })}
              </ol>
            );
          })()}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquareQuote className="h-5 w-5 text-primary" />
              Justificativa do gestor
            </DialogTitle>
            <DialogDescription className="text-xs">
              Versão atual em destaque e histórico completo de edições.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-2 min-h-[120px]">
              {refreshing && (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-xs font-medium">Carregando versões…</p>
                </div>
              )}

              {!refreshing && error && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                  <p className="text-xs font-medium text-destructive">{error}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => loadHistory("refresh")}
                    className="mt-1"
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}

              {!refreshing && !error && justificationVersions.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-6">
                  Nenhuma justificativa registrada ainda.
                </p>
              )}

              {!refreshing && !error && latest && (
                <div
                  className={`rounded-lg border-2 p-3 ${
                    latest.gestor_status === "approved"
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-destructive/60 bg-destructive/5"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    {latest.gestor_status === "approved" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Versão atual
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {format(parseISO(latest.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground">
                    {latest.gestor_response}
                  </p>
                  {latest.decided_by_name && (
                    <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
                      Por <span className="font-semibold text-foreground">{latest.decided_by_name}</span>
                      {latest.decided_by_role && (
                        <span> ({latest.decided_by_role.replace(/_/g, " ")})</span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {!refreshing && !error && justificationVersions.length > 1 && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Versões anteriores ({justificationVersions.length - 1})
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <ol className="space-y-3">
                    {justificationVersions.slice(1).map((v, idx) => (
                      <li
                        key={v.id}
                        className="rounded-md border border-border/60 bg-muted/30 p-3"
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {v.gestor_status === "approved" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Versão {justificationVersions.length - 1 - idx}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {format(parseISO(v.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-xs whitespace-pre-wrap break-words leading-snug text-foreground/90">
                          {v.gestor_response}
                        </p>
                        {v.decided_by_name && (
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Por <span className="font-semibold text-foreground">{v.decided_by_name}</span>
                            {v.decided_by_role && (
                              <span> ({v.decided_by_role.replace(/_/g, " ")})</span>
                            )}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
