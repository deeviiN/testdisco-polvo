import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileSignature, X } from "lucide-react";
import { CURRENT_CONTRACT_VERSION } from "@/lib/contractVersion";

const DISMISS_KEY = "reacceptance-banner-dismissed-until";

/**
 * Banner âmbar fixo no painel do gestor/chef pedindo aceite do novo contrato
 * quando `schools.contract_version` é diferente da versão atual.
 * Não bloqueia o uso do app — pode ser fechado por 24h.
 */
export default function ReacceptanceBanner() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [needsReaceite, setNeedsReaceite] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (until && Date.now() < until) setDismissed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!profile?.school_id) return;
    const isManager = profile.role === "gestor_pedagogico" || profile.role === "chef_projeto_vida";
    if (!isManager) return;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("contract_version")
        .eq("id", profile.school_id!)
        .maybeSingle();
      const current = (data as { contract_version?: string | null } | null)?.contract_version ?? null;
      setNeedsReaceite(current !== CURRENT_CONTRACT_VERSION);
    })();
  }, [profile?.school_id, profile?.role]);

  if (!needsReaceite || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="sticky top-0 z-40 bg-amber-500 text-amber-950 border-b border-amber-700 shadow-lg">
      <div className="max-w-screen-xl mx-auto px-3 py-2 flex items-center gap-2">
        <FileSignature className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-bold leading-tight break-words">
            Novo contrato disponível
          </p>
          <p className="text-[11px] sm:text-xs leading-tight break-words">
            Confirme o aceite para manter sua assinatura ativa.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 px-3 bg-amber-950 text-amber-100 hover:bg-amber-900 font-bold text-xs shrink-0"
          onClick={() => navigate("/subscription?reaceite=1")}
        >
          Aceitar agora
        </Button>
        <button
          aria-label="Fechar por 24h"
          className="p-1 rounded hover:bg-amber-600/40 shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
