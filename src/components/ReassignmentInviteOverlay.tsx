import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowUp, X } from "lucide-react";
import { format } from "date-fns";

type Invite = {
  id: string;
  class_name: string | null;
  shift: string | null;
  absent_teacher_name: string | null;
  absent_period_number: number;
  covering_teacher_name: string | null;
  covering_period_number: number;
  covering_end_time: string | null;
  status: string;
  invite_date: string;
  school_id: string;
};

function norm(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

/**
 * Overlay in-app que aparece para o PROFESSOR quando um assistente
 * marca um colega como Ausente na mesma turma e o sistema o elege
 * (hierarquia: último tempo) para antecipar sua aula e cobrir.
 *
 * Match do destinatário: profile.full_name == covering_teacher_name
 * (case/acento-insensitive) e school_id igual.
 */
export default function ReassignmentInviteOverlay() {
  const { profile } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  const fetchPending = useCallback(async () => {
    if (!profile?.school_id || !profile?.full_name) return;
    const { data } = await supabase
      .from("reassignment_invites" as any)
      .select("*")
      .eq("school_id", profile.school_id)
      .eq("invite_date", today)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    const myName = norm(profile.full_name);
    const mine = ((data ?? []) as any[]).find((r: any) => norm(r.covering_teacher_name) === myName) as unknown as Invite | undefined;
    setInvite(mine ?? null);
  }, [profile?.school_id, profile?.full_name, today]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase
      .channel(`reassign-invites-${profile.school_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reassignment_invites", filter: `school_id=eq.${profile.school_id}` },
        () => fetchPending(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id, fetchPending]);

  const respond = async (accept: boolean) => {
    if (!invite || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("respond_reassignment_invite" as any, {
      p_invite_id: invite.id,
      p_accept: accept,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    const res = data as any;
    if (res?.ok) {
      toast({
        title: accept ? "Cobertura confirmada" : "Convite recusado",
        description: accept
          ? `Você cobrirá o ${invite.absent_period_number}º tempo da ${invite.class_name}.`
          : "O sistema vai convidar o próximo professor da fila.",
      });
      setInvite(null);
    } else if (res?.reason) {
      toast({ title: "Convite indisponível", description: res.reason, variant: "destructive" });
      setInvite(null);
    }
  };

  if (!invite) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-card border-4 border-amber-500 shadow-2xl p-5 space-y-4 animate-in zoom-in-95">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-amber-500 flex items-center justify-center shrink-0 animate-pulse">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">ALERTA</p>
            <h2 className="text-lg font-black leading-tight break-words">
              Turma {invite.class_name ?? "—"} sem professor no {invite.absent_period_number}º tempo
            </h2>
          </div>
        </div>

        <div className="rounded-2xl bg-muted/60 p-3 space-y-1 text-sm">
          <p>
            Você tem aula nessa turma no{" "}
            <b>{invite.covering_period_number}º tempo</b>
            {invite.covering_end_time ? ` (até ${invite.covering_end_time.slice(0, 5)})` : ""}.
          </p>
          <p className="text-muted-foreground text-xs">
            Ao aceitar, você antecipa sua aula para o {invite.absent_period_number}º tempo e o seu
            último tempo fica vago (turma sai mais cedo).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={busy}
            onClick={() => respond(false)}
            className="h-14 rounded-2xl bg-muted text-foreground font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <X className="h-5 w-5" /> NÃO POSSO
          </button>
          <button
            disabled={busy}
            onClick={() => respond(true)}
            className="h-14 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/30"
          >
            <ArrowUp className="h-5 w-5" /> ACEITAR SUBIR
          </button>
        </div>
      </div>
    </div>
  );
}
