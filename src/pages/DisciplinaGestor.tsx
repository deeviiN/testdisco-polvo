import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Scale, ShieldCheck, ShieldX, ShieldAlert, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Row {
  user_id: string;
  full_name: string;
  discipline_status: string;
  discipline_total_infractions: number;
  discipline_suspended_until: string | null;
  discipline_blocked_at: string | null;
}

export default function DisciplinaGestor() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id,full_name,discipline_status,discipline_total_infractions,discipline_suspended_until,discipline_blocked_at")
      .eq("school_id", profile.school_id)
      .gt("discipline_total_infractions", 0)
      .order("discipline_status", { ascending: true })
      .order("discipline_total_infractions", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [profile?.school_id]);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (user_id: string) => {
    if (!confirm("Confirmar desbloqueio? O usuário voltará a ter acesso, mas qualquer 2 advertências novas geram suspensão automática de 15 dias.")) return;
    setSubmitting(user_id);
    const { error } = await supabase.rpc("manager_unblock_user", { _user_id: user_id });
    setSubmitting(null);
    if (error) {
      toast.error(error.message || "Falha ao desbloquear");
      return;
    }
    toast.success("Usuário desbloqueado.");
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Scale className="w-5 h-5" />
        <span className="font-bold text-base flex-1">Disciplina — gestão</span>
      </div>

      <div className="p-4 space-y-3">
        <Button
          variant="outline"
          onClick={() => navigate("/gestor/disciplina/config")}
          className="w-full h-12 justify-start font-bold"
        >
          <Settings2 className="w-5 h-5 mr-2" />
          Configurações de punição
        </Button>
        {loading && <div className="text-center text-muted-foreground py-8">Carregando…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-center text-muted-foreground py-12">Nenhum usuário com advertências.</div>
        )}
        {rows.map((r) => {
          const isBlocked = r.discipline_status === "blocked_manager";
          const isSusp = r.discipline_status === "suspended_auto";
          const Icon = isBlocked ? ShieldX : isSusp ? ShieldAlert : ShieldCheck;
          const color = isBlocked ? "text-red-500" : isSusp ? "text-red-600" : "text-green-500";
          const suspUntil = r.discipline_suspended_until
            ? new Date(r.discipline_suspended_until).toLocaleDateString("pt-BR")
            : null;
          return (
            <div key={r.user_id} className="rounded-xl border bg-card p-3">
              <div className="flex items-start gap-3">
                <Icon className={`w-8 h-8 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold break-words">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.discipline_total_infractions} advertência(s) acumulada(s)
                  </div>
                  {isBlocked && <div className="text-xs font-bold text-red-500 mt-0.5">Bloqueado — aguarda desbloqueio</div>}
                  {isSusp && suspUntil && (
                    <div className="text-xs font-bold text-red-600 mt-0.5">Suspenso até {suspUntil} (automático)</div>
                  )}
                </div>
              </div>
              {isBlocked && (
                <Button
                  onClick={() => unblock(r.user_id)}
                  disabled={submitting === r.user_id}
                  className="w-full h-12 mt-3 font-bold bg-green-600 hover:bg-green-700 text-white"
                >
                  Desbloquear usuário
                </Button>
              )}
              {isSusp && (
                <div className="mt-3 text-xs bg-muted/50 rounded p-2">
                  Suspensão automática de 15 dias. Nem o gestor pode liberar.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
