import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowRightLeft, Check, X, Loader2, User, School as SchoolIcon, Inbox } from "lucide-react";
import { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coordenador(a) Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  secretario_escolar: "Assistente de Aluno",
};

interface RequestRow {
  id: string;
  user_id: string;
  from_school_id: string;
  to_school_id: string;
  requested_role: string;
  reason: string | null;
  status: string;
  created_at: string;
  applicant_name?: string;
  applicant_email?: string;
  from_school_name?: string;
}

export default function SchoolTransferRequests() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [schoolName, setSchoolName] = useState<string>("");

  useEffect(() => {
    if (!profile?.school_id) return;
    supabase.from("schools").select("name").eq("id", profile.school_id).maybeSingle()
      .then(({ data }) => setSchoolName((data as any)?.name || ""));
  }, [profile?.school_id]);

  // Guard: only managers
  useEffect(() => {
    if (loading) return;
    if (!profile) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!["gestor_pedagogico", "chef_projeto_vida"].includes(profile.role)) {
      navigate("/sectors", { replace: true });
    }
  }, [profile, loading, navigate]);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoadingData(true);
    const { data, error } = await (supabase as any)
      .from("school_transfer_requests")
      .select("*")
      .eq("to_school_id", profile.school_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar solicitações", { description: error.message });
      setLoadingData(false);
      return;
    }

    const list: RequestRow[] = (data as any[]) || [];
    // Enrich with applicant + from-school names
    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    const fromIds = Array.from(new Set(list.map((r) => r.from_school_id)));

    const [profilesRes, schoolsRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      Promise.all(
        fromIds.map((id) =>
          (supabase as any).rpc("get_school_public_info", { _school_id: id }).then((r: any) => ({
            id,
            name: r.data?.[0]?.name || "—",
          }))
        )
      ),
    ]);

    const nameByUser = new Map<string, string>();
    (profilesRes.data as any[] | undefined)?.forEach((p: any) => nameByUser.set(p.user_id, p.full_name));
    const nameBySchool = new Map<string, string>();
    (schoolsRes as any[]).forEach((s) => nameBySchool.set(s.id, s.name));

    setRequests(
      list.map((r) => ({
        ...r,
        applicant_name: nameByUser.get(r.user_id) || "Usuário",
        from_school_name: nameBySchool.get(r.from_school_id) || "—",
      }))
    );
    setLoadingData(false);
  }, [profile?.school_id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (req: RequestRow) => {
    if (!confirm(`Aprovar transferência de ${req.applicant_name} para sua escola como ${ROLE_LABELS[req.requested_role]}?`)) return;
    setActingId(req.id);
    const loadingId = toast.loading("Aprovando...");
    const { error } = await (supabase as any).rpc("approve_school_transfer", {
      _request_id: req.id,
      _note: notes[req.id]?.trim() || null,
    });
    if (error) {
      toast.error("Erro ao aprovar.", { id: loadingId, description: error.message });
    } else {
      toast.success("Transferência aprovada!", {
        id: loadingId,
        description: "O usuário foi vinculado à sua escola e está pendente de aprovação de cadastro.",
      });
      await load();
    }
    setActingId(null);
  };

  const handleReject = async (req: RequestRow) => {
    const note = notes[req.id]?.trim();
    if (!confirm(`Rejeitar a solicitação de ${req.applicant_name}?`)) return;
    setActingId(req.id);
    const loadingId = toast.loading("Rejeitando...");
    const { error } = await (supabase as any).rpc("reject_school_transfer", {
      _request_id: req.id,
      _note: note || null,
    });
    if (error) {
      toast.error("Erro ao rejeitar.", { id: loadingId, description: error.message });
    } else {
      toast.success("Solicitação rejeitada.", { id: loadingId });
      await load();
    }
    setActingId(null);
  };

  return (
    <div className="pb-6 pt-16">
      <div className="px-3">
        <GestorPremiumHeader
          title={schoolName || "—"}
          subtitle="Solicitações de transferência"
          icon={<ArrowRightLeft className="h-5 w-5 sm:h-6 sm:w-6 text-amber-950" />}
          right={
            requests.length > 0 ? (
              <span className="px-2 py-1 rounded-lg bg-amber-400/30 text-amber-50 text-xs font-bold">
                {requests.length}
              </span>
            ) : null
          }
        />
      </div>

        <div className="px-3 pt-3 max-w-2xl mx-auto space-y-2">
          {loadingData ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : requests.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="p-8 flex flex-col items-center text-center gap-2">
                <Inbox className="h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm font-medium">Nenhuma solicitação pendente</p>
                <p className="text-xs text-muted-foreground">
                  Quando alguém pedir transferência para esta escola, aparecerá aqui.
                </p>
              </CardContent>
            </Card>
          ) : (
            requests.map((req) => (
              <Card key={req.id} className="border-border/40 shadow-card">
                <CardContent className="p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold break-words">{req.applicant_name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <SchoolIcon className="h-3 w-3" /> Vem de: <span className="font-medium">{req.from_school_name}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Cargo solicitado: <span className="font-bold text-foreground">{ROLE_LABELS[req.requested_role] || req.requested_role}</span>
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        Enviada em {new Date(req.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  {req.reason && (
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Motivo</p>
                      <p className="text-xs italic break-words">"{req.reason}"</p>
                    </div>
                  )}

                  <Textarea
                    value={notes[req.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                    placeholder="Observação (opcional) — visível no log de auditoria"
                    maxLength={300}
                    className="text-xs min-h-[50px]"
                  />

                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      onClick={() => handleReject(req)}
                      disabled={actingId === req.id}
                      variant="outline"
                      className="h-10 rounded-lg gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      {actingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Rejeitar
                    </Button>
                    <Button
                      onClick={() => handleApprove(req)}
                      disabled={actingId === req.id}
                      className="h-10 rounded-lg gap-1.5 text-xs bg-gradient-to-r from-primary to-primary/80"
                    >
                      {actingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Aprovar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
  );
}
