import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, User, Phone, Calendar, Clock,
  MapPin, CheckCircle2, XCircle, FileText, Inbox, Sparkles, Type,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import BookingGestorHistory from "@/components/BookingGestorHistory";
import GestorThemeShell, { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";
import GestorComunicadoButton from "@/components/gestor/GestorComunicadoButton";

const REJECTION_PRESETS = [
  "Conflito de uso: o ambiente já está reservado para atividade pedagógica neste horário.",
  "Necessidade institucional: o espaço será utilizado pela direção escolar nesta data.",
  "Falta de informações suficientes sobre o evento (responsáveis, público, finalidade).",
  "Solicitação fora do prazo mínimo de antecedência exigido pela escola.",
  "Atividade incompatível com a finalidade pedagógica do ambiente solicitado.",
  "Indisponibilidade de servidor responsável para acompanhar o evento.",
];

interface ExternalRequest {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  sector: string;
  topic: string | null;
  description: string | null;
  visitor_name: string | null;
  visitor_info: string | null;
  user_id: string;
  created_at: string;
  gestor_communique: string | null;
  gestor_announcement: string | null;
  gestor_status?: string;
  gestor_response?: string | null;
  requester?: {
    full_name: string;
    phone: string | null;
    role: string;
  } | null;
}

const sectorMap: Record<string, string> = {
  quadra: "Quadra Escolar",
  informatica: "Sala de Informática",
  patio: "Pátio",
  sala_professores: "Sala dos Professores",
  projeto_vida: "Sala Projeto Vida",
};

const ExternalEventRequests = () => {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { profile, loading } = useAuth();
  const [requests, setRequests] = useState<ExternalRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ExternalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [schoolName, setSchoolName] = useState<string>("");
  const [fontSize, setFontSize] = useState<"default" | "large" | "xlarge">(() => {
    if (typeof window === "undefined") return "default";
    const saved = localStorage.getItem("ext-req-font-size");
    return saved === "large" || saved === "xlarge" ? saved : "default";
  });

  useEffect(() => {
    if (!profile?.school_id) return;
    supabase
      .from("schools")
      .select("name")
      .eq("id", profile.school_id)
      .maybeSingle()
      .then(({ data }) => setSchoolName(data?.name ?? ""));
  }, [profile?.school_id]);

  useEffect(() => {
    try { localStorage.setItem("ext-req-font-size", fontSize); } catch {}
  }, [fontSize]);

  const fontScaleClass =
    fontSize === "xlarge" ? "text-[125%] leading-relaxed" :
    fontSize === "large" ? "text-[112%]" : "";

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!["gestor_pedagogico", "coord_pedagogico", "supervisor", "chef_projeto_vida"].includes(profile.role)) {
      navigate("/sectors", { replace: true });
    }
  }, [profile, loading, navigate]);

  const loadRequests = async () => {
    if (!profile?.school_id) return;
    setLoadingData(true);
    let query = supabase
      .from("bookings")
      .select("id, booking_date, start_time, end_time, sector, topic, description, visitor_name, visitor_info, user_id, created_at, gestor_communique, gestor_announcement, gestor_status, gestor_response")
      .eq("school_id", profile.school_id)
      .eq("event_type", "evento_externo");

    if (tab === "pending") {
      query = query.eq("gestor_status", "pending");
    } else {
      query = query.in("gestor_status", ["approved", "denied"]);
    }

    const { data: bookings } = await query
      .order("booking_date", { ascending: tab === "pending" })
      .order("start_time", { ascending: true });

    if (!bookings || bookings.length === 0) {
      setRequests([]);
      setLoadingData(false);
      return;
    }

    const userIds = [...new Set(bookings.map((b) => b.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, role")
      .in("user_id", userIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const enriched: ExternalRequest[] = (bookings as any[]).map((b) => ({
      ...b,
      requester: profileMap.get(b.user_id) ?? null,
    }));
    setRequests(enriched);
    setLoadingData(false);
  };

  useEffect(() => {
    loadRequests();
  }, [profile?.school_id, tab]);

  const approve = async (req: ExternalRequest) => {
    setActionId(req.id);
    const { error } = await supabase
      .from("bookings")
      .update({
        gestor_status: "approved",
        gestor_response: null,
        gestor_responded_by: profile!.user_id,
        gestor_responded_at: new Date().toISOString(),
      })
      .eq("id", req.id);
    setActionId(null);
    if (error) {
      toast({ title: "Erro ao aprovar solicitação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Solicitação aprovada" });
    await loadRequests();
  };

  const openReject = (req: ExternalRequest) => {
    setRejectTarget(req);
    setRejectReason("");
  };

  const suggestWithAI = async () => {
    if (!rejectTarget) return;
    setAiSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gestor-suggest-rejection", {
        body: {
          visitor_name: rejectTarget.visitor_name,
          sector: sectorMap[rejectTarget.sector] ?? rejectTarget.sector,
          booking_date: rejectTarget.booking_date,
          start_time: rejectTarget.start_time?.slice(0, 5),
          end_time: rejectTarget.end_time?.slice(0, 5),
          topic: rejectTarget.topic,
          description: rejectTarget.description,
          gestor_communique: rejectTarget.gestor_communique,
          hint: rejectReason.trim() || null,
        },
      });
      if (error) throw error;
      const suggestion = (data as { suggestion?: string; error?: string })?.suggestion;
      if (!suggestion) throw new Error((data as any)?.error ?? "Sem sugestão.");
      setRejectReason(suggestion);
    } catch (e) {
      toast({
        title: "Não foi possível gerar com IA",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setAiSuggesting(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 10) {
      toast({
        title: "Justificativa muito curta",
        description: "Descreva ao menos 10 caracteres explicando o motivo.",
        variant: "destructive",
      });
      return;
    }
    setSubmittingReject(true);
    const { error } = await supabase
      .from("bookings")
      .update({
        gestor_status: "denied",
        gestor_response: reason,
        gestor_responded_by: profile!.user_id,
        gestor_responded_at: new Date().toISOString(),
      })
      .eq("id", rejectTarget.id);
    setSubmittingReject(false);
    if (error) {
      toast({ title: "Erro ao recusar solicitação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Solicitação recusada", description: "A justificativa foi enviada ao solicitante." });
    setRejectTarget(null);
    setRejectReason("");
    await loadRequests();
  };

  return (
    <GestorThemeShell enabled>
    <>
    <div className={`fixed inset-x-0 top-16 bottom-0 flex flex-col text-[15px] sm:text-base ${fontScaleClass}`}>
        <div className="max-w-5xl w-full mx-auto px-3 sm:px-6 pb-2 shrink-0">
          <GestorPremiumHeader
            title={schoolName || "—"}
            subtitle="Solicitações de Eventos Externos"
            right={
              <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500 font-bold">
                {requests.length}
              </Badge>
            }
          />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-5xl w-full mx-auto px-3 sm:px-6 pb-32 space-y-6">
            {/* Abas: Pendentes / Já decididas */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-amber-400/20">
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={`h-12 sm:h-11 rounded-lg text-[15px] sm:text-sm font-bold transition-colors ${
                  tab === "pending"
                    ? "bg-amber-500 text-amber-950"
                    : "text-amber-100/70 hover:bg-white/10"
                }`}
              >
                Pendentes
              </button>
              <button
                type="button"
                onClick={() => setTab("decided")}
                className={`h-12 sm:h-11 rounded-lg text-[15px] sm:text-sm font-bold transition-colors ${
                  tab === "decided"
                    ? "bg-amber-500 text-amber-950"
                    : "text-amber-100/70 hover:bg-white/10"
                }`}
              >
                Já decididas
              </button>
            </div>

            {loadingData ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
              </div>
            ) : requests.length === 0 ? (
              <Card className="p-10 border-amber-400/20 bg-white/5 backdrop-blur-md text-center">
                <Inbox className="h-12 w-12 text-amber-300/60 mx-auto mb-3" />
                <p className="text-white font-bold">
                  {tab === "pending" ? "Nenhuma solicitação pendente" : "Nenhuma solicitação decidida"}
                </p>
                <p className="text-amber-100/60 text-sm mt-1">
                  {tab === "pending"
                    ? "Quando alguém solicitar um ambiente para uso externo, ele aparecerá aqui."
                    : "Aprovações e recusas aparecerão aqui para reedição se necessário."}
                </p>
              </Card>
            ) : (
              requests.map((req) => (
                <Card
                  key={req.id}
                  className="p-6 sm:p-4 -mx-2 sm:mx-0 border-amber-400/40 bg-gradient-to-br from-[hsl(220,55%,22%)] to-[hsl(225,50%,16%)] backdrop-blur-md shadow-lg shadow-black/30 space-y-5 sm:space-y-4"
                >
                  {/* Solicitante */}
                  <div className="flex items-start gap-4 sm:gap-3 pb-4 sm:pb-3 border-b border-white/10">
                    <div className="w-14 h-14 sm:w-11 sm:h-11 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                      <User className="h-7 w-7 sm:h-5 sm:w-5 text-amber-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-[22px] sm:text-lg break-words leading-tight">
                        {req.requester?.full_name ?? "Usuário"}
                      </p>
                      <p className="text-amber-100/60 text-base sm:text-sm capitalize mt-1 sm:mt-0.5">
                        {req.requester?.role?.replace(/_/g, " ") ?? "—"}
                      </p>
                      {req.requester?.phone && (
                        <p className="text-amber-100/70 text-base sm:text-sm flex items-center gap-1.5 mt-1.5 sm:mt-1">
                          <Phone className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> {req.requester.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status atual (aba decididas) + setor à direita */}
                  {tab === "decided" && req.gestor_status && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {req.gestor_status === "approved" ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 font-bold gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Aprovado
                        </Badge>
                      ) : (
                        <Badge className="bg-destructive text-white hover:bg-destructive font-bold gap-1">
                          <XCircle className="h-3 w-3" /> Recusado
                        </Badge>
                      )}
                      <div className="flex items-center gap-1.5 text-amber-100/90 text-sm font-semibold">
                        <MapPin className="h-4 w-4 text-amber-300" />
                        {sectorMap[req.sector] ?? req.sector}
                      </div>
                    </div>
                  )}

                  {/* Dados do agendamento */}
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-2 text-[17px] sm:text-sm">
                    <div className="flex items-center gap-2 text-amber-100/80">
                      <Calendar className="h-5 w-5 sm:h-4 sm:w-4 text-amber-300" />
                      {format(new Date(`${req.booking_date}T00:00:00`), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-2 text-amber-100/80">
                      <Clock className="h-5 w-5 sm:h-4 sm:w-4 text-amber-300" />
                      {req.start_time?.slice(0, 5)} - {req.end_time?.slice(0, 5)}
                    </div>
                    {tab !== "decided" && (
                      <div className="flex items-center gap-2 text-amber-100/80 col-span-2">
                        <MapPin className="h-5 w-5 sm:h-4 sm:w-4 text-amber-300" />
                        {sectorMap[req.sector] ?? req.sector}
                      </div>
                    )}
                  </div>


                  {/* Solicitação do usuário (texto livre, intacto) */}
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 sm:p-4 -mx-1 sm:mx-0">
                    <p className="text-amber-200 text-base sm:text-sm uppercase tracking-wider font-bold flex items-center gap-2 mb-3 sm:mb-2.5">
                      <FileText className="h-5 w-5 sm:h-4 sm:w-4" /> Solicitação
                    </p>
                    {req.gestor_communique ? (
                      <p className="text-white/95 text-[19px] sm:text-[17px] whitespace-pre-wrap break-words leading-relaxed text-justify hyphens-auto">
                        {req.gestor_communique}
                      </p>
                    ) : (
                      <p className="italic text-amber-100/60 text-[18px] sm:text-base">Sem solicitação informada.</p>
                    )}
                  </div>

                  {/* Justificativa (somente em recusa) */}
                  {tab === "decided" && req.gestor_status === "denied" && req.gestor_response && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 sm:p-4 -mx-1 sm:mx-0">
                      <p className="text-red-200 text-base sm:text-sm uppercase tracking-wider font-bold flex items-center gap-2 mb-3 sm:mb-2.5">
                        <XCircle className="h-5 w-5 sm:h-4 sm:w-4" /> Justificativa da Recusa
                      </p>
                      <p className="text-white/95 text-[19px] sm:text-[17px] whitespace-pre-wrap break-words leading-relaxed text-justify hyphens-auto">
                        {req.gestor_response}
                      </p>
                    </div>
                  )}



                  {/* Histórico de versões da decisão */}
                  {tab === "decided" && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <BookingGestorHistory bookingId={req.id} />
                    </div>
                  )}

                  {/* Ações: na aba decididas-aprovado, não mostrar Recusar/Aprovar (já decidido) */}
                  {!(tab === "decided" && req.gestor_status === "approved") && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        onClick={() => openReject(req)}
                        disabled={actionId === req.id || submittingReject}
                        className="h-12 bg-destructive hover:bg-destructive/90 text-white font-bold gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        {tab === "decided" && req.gestor_status === "denied" ? "Editar recusa" : "Recusar"}
                      </Button>
                      <Button
                        onClick={() => approve(req)}
                        disabled={actionId === req.id || submittingReject}
                        className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                      >
                        {actionId === req.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {tab === "decided" && req.gestor_status === "approved" ? "Reconfirmar" : "Aprovar"}
                      </Button>
                    </div>
                  )}

                  {/* Gerar Comunicado (PT / EN / ES) */}
                  <GestorComunicadoButton
                    bookingId={req.id}
                    eventType="evento_externo"
                    sector={req.sector}
                    sectorLabel={sectorMap[req.sector] ?? req.sector}
                    bookingDate={req.booking_date}
                    startTime={req.start_time?.slice(0, 5)}
                    endTime={req.end_time?.slice(0, 5)}
                    topic={req.topic}
                    description={req.description}
                    visitorName={req.visitor_name}
                    visitorInfo={req.visitor_info}
                    requesterName={req.requester?.full_name}
                    originalRequest={req.gestor_communique}
                    initialComunicado={req.gestor_announcement}
                  />
                </Card>
              ))
            )}
          </div>
        </div>
      </div>


      {/* Modal de rejeição com justificativas pré-definidas */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open && !submittingReject) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-destructive text-base">
              <XCircle className="h-5 w-5" /> Recusar solicitação
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione uma justificativa pronta ou edite o texto antes de enviar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                Justificativas frequentes
              </p>
              <div className="grid gap-1 max-h-32 overflow-y-auto pr-1">
                {REJECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectReason(preset)}
                    className={`text-left text-[13px] leading-snug rounded-lg border px-3 py-1.5 transition-colors ${
                      rejectReason === preset
                        ? "border-destructive bg-destructive/10 text-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                  Mensagem ao solicitante
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={suggestWithAI}
                  disabled={aiSuggesting || submittingReject}
                  className="h-7 px-2 text-[11px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                >
                  {aiSuggesting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Sugerir com IA
                </Button>
              </div>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Edite ou escreva uma justificativa fundamentada (mín. 10 caracteres)… ou clique em 'Sugerir com IA' para gerar um texto curto."
                rows={8}
                className="resize-none text-[15px] leading-relaxed px-4 py-3 min-h-[180px]"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {rejectReason.trim().length}/500 caracteres · a IA gera 2-4 linhas
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 mt-3 flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
              disabled={submittingReject}
              className="flex-1 h-10"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmReject}
              disabled={submittingReject || rejectReason.trim().length < 10}
              className="flex-1 h-10 bg-destructive hover:bg-destructive/90 text-white gap-2"
            >
              {submittingReject ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
    </GestorThemeShell>
  );
};

export default ExternalEventRequests;
