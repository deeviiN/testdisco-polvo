import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type DeadlineRow = {
  subscription_deadline: string | null;
  days_remaining: number | null;
  grace_period_days: number;
  is_blocked: boolean;
  in_grace: boolean;
  school_name: string | null;
};

/**
 * Banner exibido no painel do gestor com a contagem regressiva do prazo
 * de assinatura. Trabalha em conjunto com GestorTrialBanner (trial 7d).
 * Sincronizado pela rotina diária `sync_gestor_subscription_deadlines`.
 */
export default function SubscriptionDeadlineBanner() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [row, setRow] = useState<DeadlineRow | null>(null);

  const isManager =
    profile?.role === "gestor_pedagogico" ||
    profile?.role === "chef_projeto_vida";

  useEffect(() => {
    if (!user || !isManager) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc(
        "get_my_subscription_deadline" as any,
      );
      if (cancelled) return;
      const r: any = Array.isArray(data) ? data[0] : data;
      if (r) setRow(r as DeadlineRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isManager, profile?.is_approved]);

  if (!isManager || !row || !row.subscription_deadline) return null;

  const end = new Date(row.subscription_deadline);
  const days = row.days_remaining ?? 0;
  const dateLabel = end.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Bloqueado
  if (row.is_blocked) {
    return (
      <Banner
        tone="destructive"
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Assinatura expirada · acesso bloqueado"
        subtitle={`Expirou em ${dateLabel} e o período de carência (${row.grace_period_days} dias) terminou.`}
        action={{ label: "Regularizar", onClick: () => navigate("/subscription") }}
      />
    );
  }

  // Em carência
  if (row.in_grace) {
    const graceLeft = Math.max(
      0,
      row.grace_period_days +
        Math.ceil((end.getTime() - Date.now()) / 86400000),
    );
    return (
      <Banner
        tone="destructive"
        icon={<AlertTriangle className="h-4 w-4" />}
        title={`Em carência · ${graceLeft} ${graceLeft === 1 ? "dia" : "dias"} antes do bloqueio`}
        subtitle={`Assinatura venceu em ${dateLabel}. Pague agora para evitar bloqueio automático.`}
        action={{ label: "Pagar", onClick: () => navigate("/subscription") }}
      />
    );
  }

  // Expirando em <= 14 dias
  if (days <= 14) {
    const urgent = days <= 5;
    return (
      <Banner
        tone={urgent ? "destructive" : "warning"}
        icon={<AlertTriangle className="h-4 w-4" />}
        title={`Próximo pagamento em ${days} ${days === 1 ? "dia" : "dias"}`}
        subtitle={`Vencimento da mensalidade em ${dateLabel}. Pague para manter o acesso.`}
        action={{ label: "Pagar", onClick: () => navigate("/subscription") }}
      />
    );
  }

  // Ativa, distante. Mostra discreto
  return (
    <Banner
      tone="info"
      icon={<CheckCircle2 className="h-4 w-4" />}
      title={`Assinatura ativa · ${days} dias até o próximo pagamento`}
      subtitle={`Sua mensalidade vence em ${dateLabel}.`}
    />
  );
}

type BannerProps = {
  tone: "info" | "warning" | "destructive";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
};

function Banner({ tone, icon, title, subtitle, action }: BannerProps) {
  const palette = {
    info: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`ml-3 mr-20 sm:mx-auto sm:max-w-[80%] mt-1.5 mb-1 rounded-lg border px-2.5 py-1 flex items-center gap-1.5 shadow-sm ${palette}`}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold leading-tight break-words">{title}</p>
        <p className="text-[10px] opacity-80 leading-tight break-words">
          {subtitle}
        </p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-foreground text-background hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
