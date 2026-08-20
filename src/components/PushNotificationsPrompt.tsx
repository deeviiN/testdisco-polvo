import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePushSubscription } from "@/hooks/usePushSubscription";

const DISMISS_KEY = "push_prompt_dismissed_at";
const REMIND_AFTER_MS = 1000 * 60 * 60 * 24 * 3; // 3 dias

/**
 * Banner discreto que pede ao usuário logado para ativar notificações push
 * (sirene/atualizações no celular mesmo com app fechado). Aparece somente
 * quando o navegador suporta, ainda não está inscrito e não foi dispensado
 * recentemente.
 */
export default function PushNotificationsPrompt() {
  const { user } = useAuth();
  const { status, supported, subscribe, loading, error } = usePushSubscription();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !supported) {
      setVisible(false);
      return;
    }
    if (status !== "default" && status !== "granted-unsubscribed") {
      setVisible(false);
      return;
    }
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const dismissedAt = raw ? Number(raw) : 0;
      if (dismissedAt && Date.now() - dismissedAt < REMIND_AFTER_MS) {
        setVisible(false);
        return;
      }
    } catch { /* noop */ }
    setVisible(true);
  }, [user, supported, status]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setVisible(false);
  };

  const handleEnable = async () => {
    try {
      await subscribe();
      setVisible(false);
    } catch { /* erro já capturado pelo hook */ }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md">
      <div className="rounded-2xl border border-white/20 bg-[hsl(220,50%,18%)]/95 backdrop-blur shadow-2xl p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">Ativar sirene no celular</p>
            <p className="text-xs text-white/70 mt-1 leading-snug">
              Receba a troca de tempo e novidades mesmo com o aplicativo fechado, igual ao WhatsApp.
            </p>
            {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                disabled={loading}
                className="flex-1 h-10 rounded-xl bg-amber-400 text-[hsl(220,60%,15%)] text-sm font-bold disabled:opacity-60"
              >
                {loading ? "Ativando..." : "Ativar notificações"}
              </button>
              <button
                onClick={dismiss}
                className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium"
              >
                Depois
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-md hover:bg-white/10 text-white/60"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
