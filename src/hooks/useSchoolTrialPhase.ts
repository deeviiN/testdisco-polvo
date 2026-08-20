import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type TrialPhase = "active" | "trial" | "restricted" | "blocked" | "loading";

export interface SchoolTrialPhase {
  phase: TrialPhase;
  daysSinceApproval: number;
  subscriptionActive: boolean;
  allowedSector: string | null;
  daysRemainingInPhase: number | null;
}

/**
 * Retorna a fase da escola conforme o ciclo trial:
 * - 0–10 dias: 'trial' (acesso livre)
 * - 10–20 dias sem assinatura: 'restricted' (só setor permitido)
 * - 20+ dias sem assinatura: 'blocked' (só /subscription, documentos, perfil)
 * - assinatura ativa: 'active'
 */
export function useSchoolTrialPhase(): SchoolTrialPhase {
  const { profile } = useAuth();
  const [state, setState] = useState<SchoolTrialPhase>({
    phase: "loading",
    daysSinceApproval: 0,
    subscriptionActive: false,
    allowedSector: null,
    daysRemainingInPhase: null,
  });

  useEffect(() => {
    if (!profile) return;
    // Admins nunca são bloqueados
    if (profile.role === "admin") {
      setState({
        phase: "active",
        daysSinceApproval: 0,
        subscriptionActive: true,
        allowedSector: null,
        daysRemainingInPhase: null,
      });
      return;
    }
    if (!profile.school_id) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_school_trial_phase" as any);
      if (cancelled || error) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      const phase = (row.phase as TrialPhase) || "trial";
      const days = Number(row.days_since_approval ?? 0);
      let remaining: number | null = null;
      if (phase === "trial") remaining = Math.max(0, 10 - days);
      else if (phase === "restricted") remaining = Math.max(0, 15 - days);
      setState({
        phase,
        daysSinceApproval: days,
        subscriptionActive: !!row.subscription_active,
        allowedSector: row.allowed_sector ?? null,
        daysRemainingInPhase: remaining,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.school_id, profile?.role]);

  return state;
}
