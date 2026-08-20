import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  CreditCard,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type DeadlineRow = {
  subscription_deadline: string | null;
  days_remaining: number | null;
  grace_period_days: number;
  is_blocked: boolean;
  in_grace: boolean;
};

const HIDE_PREF_KEY = "gestor.subscriptionInfo.hiddenByDefault";

/**
 * Item discreto e colapsável dentro do dropdown de Configurações.
 * O usuário pode escolher manter a informação 100% oculta até expandir
 * a seção (preferência salva em localStorage).
 */
export default function SubscriptionDeadlineMenuItem({
  dropdownOpen = false,
}: {
  dropdownOpen?: boolean;
} = {}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [row, setRow] = useState<DeadlineRow | null>(null);
  const [hideByDefault, setHideByDefault] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_PREF_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_PREF_KEY) !== "1";
    } catch {
      return true;
    }
  });

  // Sempre que o dropdown de Configurações abrir, força expansão automática,
  // independentemente da preferência "manter oculto por padrão".
  useEffect(() => {
    if (dropdownOpen) setExpanded(true);
  }, [dropdownOpen]);

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

  const togglePref = (next: boolean) => {
    setHideByDefault(next);
    try {
      localStorage.setItem(HIDE_PREF_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    // Aplica imediatamente o estado inicial coerente com a preferência
    setExpanded(!next);
  };

  if (!isManager || !row || !row.subscription_deadline) return null;

  const end = new Date(row.subscription_deadline);
  const days = row.days_remaining ?? 0;
  const dateLabel = end.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let title = `Próximo pagamento em ${days} ${days === 1 ? "dia" : "dias"}`;
  let subtitle = `Vence em ${dateLabel}`;
  let icon = <CheckCircle2 className="h-3.5 w-3.5" />;
  let chip = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  if (row.is_blocked) {
    title = "Assinatura expirada";
    subtitle = `Bloqueada após carência (${dateLabel})`;
    icon = <ShieldAlert className="h-3.5 w-3.5" />;
    chip = "bg-destructive/15 text-destructive";
  } else if (row.in_grace) {
    const graceLeft = Math.max(
      0,
      row.grace_period_days +
        Math.ceil((end.getTime() - Date.now()) / 86400000),
    );
    title = `Em carência · ${graceLeft} ${graceLeft === 1 ? "dia" : "dias"}`;
    subtitle = `Venceu em ${dateLabel}`;
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    chip = "bg-destructive/15 text-destructive";
  } else if (days <= 14) {
    icon = <Clock className="h-3.5 w-3.5" />;
    chip =
      days <= 5
        ? "bg-destructive/15 text-destructive"
        : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }

  return (
    <div className="px-1 pt-0.5">
      {/* Cabeçalho colapsável */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-muted/60 transition-colors"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CreditCard className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-sm text-left">Assinatura</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="mt-1 mb-1 ml-1 mr-1 rounded-lg border border-border/50 bg-muted/30 p-2">
          <button
            type="button"
            onClick={() => navigate("/subscription")}
            className="w-full flex items-center gap-2 text-left rounded-md hover:bg-background/60 p-1 transition-colors"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded ${chip}`}
            >
              {icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-medium truncate">
                {title}
              </span>
              <span className="block text-[10px] text-muted-foreground truncate">
                {subtitle}
              </span>
            </span>
          </button>

          <label className="mt-2 flex items-center gap-2 px-1 text-[10px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideByDefault}
              onChange={(e) => togglePref(e.target.checked)}
              className="h-3 w-3 accent-primary"
            />
            <span>Manter oculto até eu expandir</span>
          </label>
        </div>
      )}
    </div>
  );
}
