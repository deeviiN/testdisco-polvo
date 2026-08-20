import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, Wifi, WifiOff, RefreshCw, ArrowLeft, ShieldAlert, Globe, Server } from "lucide-react";

type StepStatus = "idle" | "running" | "ok" | "fail";
type Step = {
  key: string;
  label: string;
  icon: typeof Wifi;
  status: StepStatus;
  detail?: string;
  hint?: string;
};

const SUPABASE_URL = "https://bypnkfypgxmpmvvkpyts.supabase.co";
const TIMEOUT_MS = 8000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export default function Diagnostico() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Step[]>([
    { key: "online", label: "Seu aparelho está conectado à internet", icon: Wifi, status: "idle" },
    { key: "dns", label: "Consegue alcançar sites públicos (Google)", icon: Globe, status: "idle" },
    { key: "backend", label: "Consegue alcançar o servidor do app", icon: Server, status: "idle" },
    { key: "cors", label: "Servidor responde sem bloqueio de segurança", icon: ShieldAlert, status: "idle" },
  ]);
  const [running, setRunning] = useState(false);

  const update = (key: string, patch: Partial<Step>) =>
    setSteps((s) => s.map((st) => (st.key === key ? { ...st, ...patch } : st)));

  const run = useCallback(async () => {
    setRunning(true);
    setSteps((s) => s.map((st) => ({ ...st, status: "idle", detail: undefined, hint: undefined })));

    // 1) navigator.onLine
    update("online", { status: "running" });
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    update("online", {
      status: online ? "ok" : "fail",
      detail: online ? "Wi-Fi ou dados móveis ativos" : "Sem conexão detectada",
      hint: online ? undefined : "Verifique modo avião, Wi-Fi ou dados móveis do celular.",
    });

    // 2) DNS/rede geral — Google
    update("dns", { status: "running" });
    try {
      await withTimeout(
        fetch("https://www.google.com/generate_204", { mode: "no-cors", cache: "no-store" }),
        TIMEOUT_MS,
      );
      update("dns", { status: "ok", detail: "Internet aberta funcionando" });
    } catch (e) {
      update("dns", {
        status: "fail",
        detail: e instanceof Error ? e.message : "Falha ao acessar internet",
        hint: "Sua rede parece bloquear tudo. Troque para dados móveis (4G/5G) e teste de novo.",
      });
    }

    // 3) Backend HEAD
    update("backend", { status: "running" });
    let backendOk = false;
    try {
      const res = await withTimeout(
        fetch(`${SUPABASE_URL}/rest/v1/`, { method: "HEAD", cache: "no-store", mode: "cors" }),
        TIMEOUT_MS,
      );
      backendOk = res.status < 500;
      update("backend", {
        status: backendOk ? "ok" : "fail",
        detail: `Servidor respondeu (HTTP ${res.status})`,
        hint: backendOk ? undefined : "Servidor está retornando erro. Aguarde 1 minuto e tente novamente.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao alcançar servidor";
      update("backend", {
        status: "fail",
        detail: msg === "timeout" ? "Tempo esgotado (>8s sem resposta)" : `Failed to fetch — ${msg}`,
        hint:
          "O navegador não consegue chegar ao servidor. Causas comuns:\n" +
          "• Extensão bloqueando (uBlock, AdGuard, antivírus com proteção web)\n" +
          "• Rede da escola/empresa bloqueando *.supabase.co\n" +
          "• Service Worker antigo travado\n\n" +
          "Teste em ABA ANÔNIMA e/ou usando dados móveis (4G).",
      });
    }

    // 4) CORS test com GET simples
    update("cors", { status: "running" });
    if (!backendOk) {
      update("cors", { status: "fail", detail: "Não testado — servidor inacessível" });
    } else {
      try {
        const res = await withTimeout(
          fetch(`${SUPABASE_URL}/rest/v1/?select=1`, {
            method: "GET",
            cache: "no-store",
            mode: "cors",
            headers: { apikey: "sb_publishable_9_9W7wnX3T2udGjitHYxZQ_vGVgJJfK" },
          }),
          TIMEOUT_MS,
        );
        // 401 é OK aqui — significa que o servidor respondeu.
        update("cors", {
          status: "ok",
          detail: `Comunicação com backend OK (HTTP ${res.status})`,
        });
      } catch (e) {
        update("cors", {
          status: "fail",
          detail: e instanceof Error ? e.message : "Falha CORS",
          hint: "Extensão ou proxy pode estar removendo os cabeçalhos CORS. Teste em aba anônima.",
        });
      }
    }

    setRunning(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const allOk = steps.every((s) => s.status === "ok");
  const anyFail = steps.some((s) => s.status === "fail");

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[hsl(220,50%,28%)] via-[hsl(230,45%,24%)] to-[hsl(240,50%,20%)] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-md">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>

        <header className="text-center mb-5">
          <div className="mx-auto mb-3 h-16 w-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
            {running ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : allOk ? (
              <CheckCircle2 className="h-9 w-9 text-emerald-300" />
            ) : anyFail ? (
              <WifiOff className="h-9 w-9 text-amber-300" />
            ) : (
              <Wifi className="h-9 w-9" />
            )}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Teste de conexão</h1>
          <p className="mt-1 text-sm text-white/80">
            Verificando se seu aparelho consegue falar com o servidor do app.
          </p>
        </header>

        <ol className="space-y-2">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <li
                key={s.key}
                className="rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-white/15 flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-tight">{s.label}</p>
                    {s.detail && (
                      <p className="text-[12px] text-white/70 leading-snug mt-0.5 break-words">
                        {s.detail}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {s.status === "running" && <Loader2 className="h-5 w-5 animate-spin text-white/70" />}
                    {s.status === "ok" && <CheckCircle2 className="h-6 w-6 text-emerald-300" />}
                    {s.status === "fail" && <XCircle className="h-6 w-6 text-red-300" />}
                  </div>
                </div>
                {s.status === "fail" && s.hint && (
                  <div className="mt-2 rounded-xl bg-amber-400/15 ring-1 ring-amber-300/40 p-3 text-[12px] text-amber-100 whitespace-pre-line">
                    {s.hint}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={run}
            disabled={running}
            className="h-12 rounded-xl bg-white text-[hsl(220,50%,28%)] font-extrabold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
            Testar de novo
          </button>
          <button
            onClick={() => window.location.reload()}
            className="h-12 rounded-xl bg-white/15 hover:bg-white/25 ring-1 ring-white/25 font-bold flex items-center justify-center gap-2 active:scale-95"
          >
            Recarregar app
          </button>
        </div>

        {allOk && !running && (
          <div className="mt-4 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-300/40 p-3 text-sm text-emerald-100 text-center font-semibold">
            Tudo certo! Seu aparelho está conseguindo falar com o servidor.
          </div>
        )}

        {anyFail && !running && (
          <div className="mt-4 rounded-2xl bg-white/10 ring-1 ring-white/15 p-3 text-[12px] text-white/85">
            <p className="font-bold mb-1">Precisa de ajuda?</p>
            <p>
              Suporte WhatsApp:{" "}
              <a
                href="https://wa.me/5511925686565"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-300 font-extrabold"
              >
                (11) 92568-6565
              </a>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
