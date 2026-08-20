import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

type PlanId = "mensal" | "anual_12" | "anual_24";

const OPTIONS: { id: PlanId; label: string; sub: string; planName: string }[] = [
  { id: "mensal",   label: "Mensal", sub: "R$ 199,90/mês",         planName: "Mensal" },
  { id: "anual_12", label: "1 ano",  sub: "R$ 2.278,86 · 5% off",  planName: "Anual (1 Ano)" },
  { id: "anual_24", label: "2 anos", sub: "R$ 4.317,84 · 10% off", planName: "Bianual (2 Anos)" },
];

interface Props {
  schoolId: string | null | undefined;
  onChange?: (planId: PlanId | null, planName: string | null) => void;
}

export default function PaymentPlanSelector({ schoolId, onChange }: Props) {
  const [current, setCurrent] = useState<PlanId | null>(null);
  const [saving, setSaving] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Nada vem pré-marcado ao abrir a tela: a opção salva anteriormente NÃO é
    // restaurada visualmente. Só fica marcada quando o usuário clicar.
    setCurrent(null);
    setLoading(false);
  }, [schoolId]);

  const handleSelect = async (plan: PlanId) => {
    if (!schoolId || saving) return;
    setSaving(plan);
    const { error } = await supabase
      .from("schools")
      .update({ payment_plan: plan })
      .eq("id", schoolId);
    setSaving(null);
    if (error) {
      toast.error("Não foi possível salvar a forma de pagamento.");
      return;
    }
    setCurrent(plan);
    const opt = OPTIONS.find(o => o.id === plan);
    onChange?.(plan, opt?.planName ?? null);
    toast.success("Forma de pagamento salva. O plano abaixo foi atualizado.");
  };

  if (!schoolId) return null;

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 backdrop-blur-md p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-white font-bold text-sm">Forma de pagamento do contrato</h3>
        <span className="text-[10px] text-white/60">Fidelidade: 24 meses</span>
      </div>
      <p className="text-[11px] text-white/70 leading-snug">
        Escolha aqui — o plano abaixo será marcado automaticamente e ficará travado nesta escolha.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {OPTIONS.map((o) => {
          const active = current === o.id;
          const busy = saving === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={loading || !!saving}
              onClick={() => handleSelect(o.id)}
              className={[
                "relative text-left rounded-lg border px-3 py-2 transition-all",
                active
                  ? "border-amber-400 bg-amber-400/15 text-white shadow-md shadow-amber-500/20"
                  : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm break-words">{o.label}</span>
                {active && !busy && <Check className="h-4 w-4 text-amber-300 shrink-0" />}
                {busy && <Loader2 className="h-4 w-4 animate-spin text-white/80 shrink-0" />}
              </div>
              <div className="text-[11px] text-white/70 break-words">{o.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
