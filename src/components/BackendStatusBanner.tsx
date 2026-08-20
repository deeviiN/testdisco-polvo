import { useEffect, useState, useCallback } from "react";
import { WifiOff, RefreshCw, X, ServerCrash, Smartphone, Plane, RotateCcw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSupportContact } from "@/hooks/useSupportContact";

type Status = "ok" | "offline" | "backend_down";

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 8_000;

async function pingBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    const url = `${(supabase as any).supabaseUrl}/rest/v1/?select=1`;
    const res = await fetch(url, {
      method: "HEAD",
      headers: { apikey: (supabase as any).supabaseKey },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    // Qualquer resposta HTTP (mesmo 401/404) significa que o backend está vivo.
    // Só consideramos "fora do ar" se for erro 5xx do servidor.
    return res.status < 500;
  } catch {
    return false;
  }
}

export default function BackendStatusBanner() {
  const [status, setStatus] = useState<Status>("ok");
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const { contact } = useSupportContact();

  const check = useCallback(async () => {
    setChecking(true);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setChecking(false);
      return;
    }
    const ok = await pingBackend();
    setStatus(ok ? "ok" : "backend_down");
    setChecking(false);
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, PING_INTERVAL_MS);
    const onOnline = () => check();
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [check]);

  useEffect(() => {
    if (status !== "ok") setDismissed(false);
  }, [status]);

  if (status === "ok" || dismissed) return null;

  const isOffline = status === "offline";

  // Cores e conteúdo por estado
  const accent = isOffline ? "amber" : "red";
  const ringClass = isOffline ? "ring-amber-400/40" : "ring-red-400/40";
  const bgClass = "bg-gradient-to-b from-[hsl(220,25%,22%)] to-[hsl(220,30%,14%)]";
  const HeroIcon = isOffline ? WifiOff : ServerCrash;
  const title = isOffline ? "Sem internet no seu celular" : "App fora do ar no seu aparelho";
  const subtitle = isOffline
    ? "Seu celular não está conectado. Siga os passos abaixo:"
    : "Não estamos conseguindo carregar agora. Tente os passos abaixo:";

  const tips = isOffline
    ? [
        { icon: Plane, title: "1. Tire o modo avião", desc: "Veja se o ícone de aviãozinho está ligado e desligue." },
        { icon: Smartphone, title: "2. Ligue Wi-Fi ou dados móveis", desc: "Abra os ajustes do celular e ative a internet." },
        { icon: RotateCcw, title: "3. Mude de lugar", desc: "Vá perto de uma janela ou do roteador." },
      ]
    : [
        { icon: RefreshCw, title: "1. Espere meio minuto", desc: "Às vezes resolve sozinho. Toque em \"Tentar de novo\"." },
        { icon: RotateCcw, title: "2. Feche e abra o app", desc: "Ou toque em \"Recarregar app\" aqui embaixo." },
        { icon: Smartphone, title: "3. Chame o suporte", desc: `Se não voltar, fale no WhatsApp ${contact.display_label}.` },
      ];

  return (
    <div className="fixed inset-x-0 top-0 z-[80] px-3 pt-3 pointer-events-none">
      <div
        role="alert"
        aria-live="assertive"
        className={`relative pointer-events-auto mx-auto w-full max-w-md rounded-3xl overflow-hidden shadow-2xl ring-1 ${ringClass} ${bgClass} text-white animate-in slide-in-from-top-4 fade-in duration-300`}
      >
        {/* Triângulo de exclamação amarelo centralizado como marca d'água */}
        <AlertTriangle
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto h-56 w-56 text-yellow-400/15"
          strokeWidth={2}
          fill="currentColor"
        />
        {/* Topo: ícone grande + título */}
        <div className="relative px-5 pt-5 pb-3">
          <button
            onClick={() => setDismissed(true)}
            aria-label="Fechar aviso"
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
                <HeroIcon className="h-9 w-9" strokeWidth={2.2} />
              </div>
              <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-${accent}-300 ring-2 ring-white/40 animate-pulse`} />
            </div>
            <h2 className="mt-3 text-xl font-extrabold leading-tight">{title}</h2>
            <p className="mt-1 text-sm text-white/90 leading-snug max-w-[280px]">{subtitle}</p>
          </div>
        </div>

        {/* Dicas em cards horizontais */}
        <div className="px-3 pb-3">
          <div className="rounded-2xl bg-black/15 backdrop-blur-sm p-2 space-y-1.5">
            {tips.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2"
                >
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-white/20 flex items-center justify-center">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-tight">{tip.title}</p>
                    <p className="text-[12px] text-white/80 leading-snug">{tip.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ações */}
        <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-2">
          <button
            onClick={check}
            disabled={checking}
            className="h-12 rounded-xl bg-white text-foreground text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-60 shadow-md"
            style={{ color: isOffline ? "hsl(28,85%,35%)" : "hsl(0,70%,35%)" }}
          >
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            Tentar de novo
          </button>
          <button
            onClick={() => window.location.reload()}
            className="h-12 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-bold flex items-center justify-center gap-2 ring-1 ring-white/25 transition active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            Recarregar app
          </button>
        </div>

        {/* Link para diagnóstico detalhado */}
        <div className="px-4 pb-2 text-center">
          <a
            href="/diagnostico"
            className="text-[12px] font-bold text-white underline underline-offset-4 hover:text-yellow-300"
          >
            Rodar teste de conexão detalhado
          </a>
        </div>

        {/* Contato de suporte */}
        <div className="px-4 pb-4 pt-1 text-center">
          <p className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">Suporte WhatsApp</p>
          <a
            href={`https://wa.me/${contact.display_label.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-0.5 text-base font-extrabold text-yellow-300 tracking-wide whitespace-nowrap"
          >
            {contact.display_label}
          </a>
        </div>
      </div>
    </div>
  );
}
