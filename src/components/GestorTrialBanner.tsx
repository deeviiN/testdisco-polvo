import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Clock, AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type TrialStatus = {
  is_approved: boolean;
  approved_until: string | null;
  trial_expired: boolean;
  school_subscription_status: string | null;
  school_subscription_end_date: string | null;
  subscription_source: 'assinatura_individual' | 'assinatura_escola' | 'sem_assinatura';
};

/**
 * Banner global exibido apenas para gestores (gestor_pedagogico / chef_projeto_vida).
 * Mostra status atual: Aguardando aprovação · Trial ativo (Xd) · Trial expirado · Assinatura ativa.
 * Some na página /subscription para não duplicar.
 */
export default function GestorTrialBanner() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isManager =
    profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida";

  const logErrorToBackend = async (
    rpcName: string,
    err: any,
    context: string,
  ) => {
    try {
      await supabase.rpc("log_client_error" as any, {
        _rpc: rpcName,
        _code: String(err?.code ?? err?.status ?? ""),
        _message: String(err?.message ?? ""),
        _details: err?.details ? String(err.details) : null,
        _hint: err?.hint ? String(err.hint) : null,
        _context: context,
      });
    } catch {
      // Silencioso: log de log não pode quebrar UI
    }
  };

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc("get_my_trial_status" as any);
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row) setStatus(row as TrialStatus);
      toast.success("Status atualizado");
    } catch (e: any) {
      const code = e?.code ?? e?.status ?? "sem código";
      const message = e?.message ?? "Erro desconhecido";
      const details = e?.details ? ` · ${e.details}` : "";
      const hint = e?.hint ? ` · dica: ${e.hint}` : "";
      const description = `RPC: get_my_trial_status · [${code}] ${message}${details}${hint}`;
      const fullError = `[Erro Recarregar Status]\nRPC: get_my_trial_status\nCódigo: ${code}\nMensagem: ${message}${e?.details ? `\nDetalhes: ${e.details}` : ""}${e?.hint ? `\nDica: ${e.hint}` : ""}\nHorário: ${new Date().toISOString()}`;

      // Envio automático para log privado no backend
      logErrorToBackend("get_my_trial_status", e, "GestorTrialBanner.fetchStatus");

      toast.error("Falha ao atualizar status", {
        description,
        duration: 10000,
        action: {
          label: "Copiar erro",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(fullError);
              toast.success("Erro copiado para a área de transferência");
              // Reforça envio ao backend marcando ação do usuário
              logErrorToBackend("get_my_trial_status", e, "GestorTrialBanner.copyError");
            } catch {
              toast.error("Não foi possível copiar");
            }
          },
        },
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user || !isManager) { setStatus(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_my_trial_status" as any);
      if (cancelled) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row) setStatus(row as TrialStatus);
    })();
    return () => { cancelled = true; };
  }, [user, isManager, profile?.is_approved, location.pathname]);

  if (!isManager || !status) return null;
  // Não mostra dentro de páginas administrativas/auth/subscription
  const hidePaths = ["/subscription", "/auth", "/", "/admin", "/admin/global", "/gestor"];
  if (hidePaths.some((p) => location.pathname === p)) return null;


  const subActive = 
    ["active", "paid"].includes(status.school_subscription_status || "") && 
    !!status.school_subscription_end_date;

  // Caso 1: Assinatura ativa → não polui a tela
  if (subActive) return null;

  // Caso 2: Aguardando aprovação do admin
  if (!status.is_approved) {
    return (
      <Banner
        icon={<Clock className="h-4 w-4" />}
        tone="warning"
        title="Aguardando aprovação do administrador"
        subtitle="Seu trial de 7 dias começa assim que o admin aprovar seu cadastro."
        onRefresh={fetchStatus}
        refreshing={refreshing}
      />
    );
  }

  // Caso 3: Trial expirado sem assinatura
  if (status.trial_expired) {
    return (
      <Banner
        icon={<ShieldAlert className="h-4 w-4" />}
        tone="destructive"
        title="Trial expirado · acesso bloqueado"
        subtitle="Conclua a assinatura para liberar o app."
        action={{ label: "Assinar agora", onClick: () => navigate("/subscription") }}
        onRefresh={fetchStatus}
        refreshing={refreshing}
      />
    );
  }

  // Caso 4: Trial ativo → mostra dias restantes e data
  if (status.approved_until) {
    const end = new Date(status.approved_until);
    const msLeft = end.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    const dateLabel = end.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    const sourceLabel = status.subscription_source === 'assinatura_individual' ? 'Assinatura Individual' : 'Assinatura Escola';
    const urgent = daysLeft <= 2;

    return (
      <Banner
        icon={urgent ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        tone={urgent ? "destructive" : "info"}
        title={`Trial ativo · ${daysLeft} ${daysLeft === 1 ? "dia restante" : "dias restantes"}`}
        subtitle={`Expira em ${dateLabel}. [${sourceLabel}] Assine para manter o acesso.`}
        action={{ label: "Assinar", onClick: () => navigate("/subscription") }}
        onRefresh={fetchStatus}
        refreshing={refreshing}
      />
    );
  }

  return null;
}

type BannerProps = {
  icon: React.ReactNode;
  tone: "info" | "warning" | "destructive";
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
  onRefresh?: () => void;
  refreshing?: boolean;
};

function Banner({ icon, tone, title, subtitle, action, onRefresh, refreshing }: BannerProps) {
  const palette = {
    info: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-warning/15 text-warning-foreground border-warning/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-3 mt-2 mb-1 rounded-xl border px-3 py-2 flex items-center gap-2 shadow-sm ${palette}`}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight break-words">{title}</p>
        <p className="text-[11px] opacity-80 leading-tight break-words">{subtitle}</p>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Recarregar status"
          title="Recarregar status"
          className="shrink-0 p-1.5 rounded-lg hover:bg-foreground/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
