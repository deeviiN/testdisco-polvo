import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface DecisionRow {
  id: string;
  user_id: string;
  decision: string; // 'approved' | 'rejected'
  reason: string | null;
  decided_by_name: string | null;
  intended_role: string | null;
  acknowledged_at: string | null;
  created_at: string;
  full_name?: string | null;
  school_id?: string | null;
  school_name?: string | null;
}

/**
 * Detecta a última decisão (aprovada/rejeitada) tomada pelo gestor sobre o
 * cadastro do usuário logado e exibe um modal explicativo. Em caso de
 * rejeição, mostra a justificativa do gestor. Marca como reconhecida ao fechar.
 *
 * Funciona mesmo quando o profile foi removido (rejeição), pois consulta
 * `profile_approval_decisions` diretamente pelo user_id.
 */
export default function ApprovalDecisionWatcher() {
  const { user } = useAuth();
  const [decision, setDecision] = useState<DecisionRow | null>(null);
  const ackingRef = useRef(false);

  const markAcknowledged = async (id: string) => {
    await supabase
      .from("profile_approval_decisions")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
  };

  const fetchSchoolName = async (schoolId?: string | null): Promise<string | null> => {
    if (!schoolId) return null;
    const { data } = await supabase.from("schools").select("name").eq("id", schoolId).maybeSingle();
    return (data?.name as string) ?? null;
  };

  // Carrega decisão mais recente não reconhecida
  const loadLatest = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("profile_approval_decisions")
      .select("id, user_id, decision, reason, decided_by_name, intended_role, acknowledged_at, created_at, school_id, full_name")
      .eq("user_id", user.id)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const school_name = await fetchSchoolName((data as any).school_id);
      const row = { ...(data as DecisionRow), school_name };
      if (row.decision === "approved") {
        return;
      }
      setDecision(row);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setDecision(null);
      return;
    }
    loadLatest();

    // Realtime: nova decisão sobre este usuário
    const channel = supabase
      .channel(`approval-decision:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profile_approval_decisions",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as DecisionRow;
          if (row.acknowledged_at) return;
          const school_name = await fetchSchoolName(row.school_id);
          if (row.decision === "approved") {
            toast.success("Seu cadastro foi aprovado!", { duration: 8000 });
            try {
              navigator.vibrate?.([150, 80, 150]);
            } catch {
              /* ignore */
            }
            return;
          } else {
            setDecision({ ...row, school_name });
            toast.error("Seu cadastro foi rejeitado.", { duration: 8000 });
          }
          try {
            navigator.vibrate?.([150, 80, 150]);
          } catch {
            /* ignore */
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const acknowledge = async () => {
    if (!decision || ackingRef.current) return;
    ackingRef.current = true;
    await markAcknowledged(decision.id);
    setDecision(null);
    ackingRef.current = false;
  };

  if (!decision) return null;
  const approved = decision.decision === "approved";
  if (approved) return null;

  return (
    <AlertDialog open onOpenChange={(o) => !o && acknowledge()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-center mb-2">
            {approved ? (
              <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            )}
          </div>
          <AlertDialogTitle className="text-center">
            {approved ? "Cadastro aprovado!" : "Cadastro rejeitado"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm break-words">
            {approved ? (
              <>
                {decision.full_name ? (
                  <><span className="font-semibold text-foreground">{decision.full_name}</span>, seu </>
                ) : "Seu "}
                cadastro foi aprovado
                {decision.school_name ? (
                  <> na escola <span className="font-semibold text-foreground">{decision.school_name}</span></>
                ) : null}
                {decision.decided_by_name ? (
                  <> pelo(a) gestor(a) <span className="font-semibold text-foreground">{decision.decided_by_name}</span></>
                ) : null}
                . Você já pode usar todos os recursos da plataforma.
              </>
            ) : (
              <>
                {decision.decided_by_name ? (
                  <><span className="font-semibold text-foreground">{decision.decided_by_name}</span></>
                ) : "O(a) gestor(a)"}
                {decision.school_name ? (
                  <> da escola <span className="font-semibold text-foreground">{decision.school_name}</span></>
                ) : null}
                {" "}avaliou e rejeitou o cadastro
                {decision.full_name ? (
                  <> de <span className="font-semibold text-foreground">{decision.full_name}</span></>
                ) : null}
                .
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!approved && decision.reason && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mt-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-destructive mb-1">
              Justificativa do gestor
            </p>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {decision.reason}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogAction onClick={acknowledge}>Entendi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
