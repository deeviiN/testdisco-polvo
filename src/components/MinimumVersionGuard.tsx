import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type VersionPayload = {
  latest_version?: string | null;
  latest_build_time?: number | null;
  minimum_supported_version?: string | null;
  minimum_supported_build_time?: number | null;
};

type MinimumVersionGuardProps = {
  children: ReactNode;
};

const CHECK_INTERVAL_MS = 5 * 60_000;
const VERSION_CHECK_TIMEOUT_MS = 3_000;

function formatBuildDate(buildTime?: number) {
  if (!buildTime) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(buildTime));
}

export default function MinimumVersionGuard({ children }: MinimumVersionGuardProps) {
  const [status, setStatus] = useState<"checking" | "ok" | "blocked">("checking");
  const [remoteVersion, setRemoteVersion] = useState<VersionPayload | null>(null);
  const [reloading, setReloading] = useState(false);
  const checkInFlightRef = useRef(false);
  const checkControllerRef = useRef<AbortController | null>(null);

  const checkVersion = useCallback(() => {
    // Nunca disputar o lock de autenticação enquanto o usuário está entrando.
    // O cliente de auth já cuida da sessão; uma RPC concorrente aqui fazia o
    // login aguardar/roubar o mesmo lock quando o backend estava lento.
    const path = window.location.pathname;
    if (path === "/auth" || path.startsWith("/auth/") || path === "/admin/login") {
      setStatus("ok");
      return;
    }

    // Uma Promise.race não cancela a consulta que perdeu a corrida. Quando o
    // backend ficava lento, uma nova chamada era criada a cada 15 segundos em
    // cada aparelho, saturando as conexões e bloqueando inclusive o login.
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    const controller = new AbortController();
    checkControllerRef.current = controller;

    const fallbackId = window.setTimeout(() => {
      controller.abort();
      setStatus((current) => (current === "blocked" ? current : "ok"));
    }, VERSION_CHECK_TIMEOUT_MS);

    void Promise.resolve(
      supabase.rpc("get_app_version_manifest").abortSignal(controller.signal)
    )
      .then(({ data, error }) => {
        if (error) {
          console.warn("[VersionGate] Falha ao consultar manifesto remoto.", error);
          setStatus((current) => (current === "blocked" ? current : "ok"));
          return;
        }
        const payload = (Array.isArray(data) ? data[0] : data) as VersionPayload | null | undefined;
        if (!payload) {
          setStatus("ok");
          return;
        }
        const minimumSupportedBuildTime = Number(payload.minimum_supported_build_time ?? 0);
        setRemoteVersion(payload);
        if (minimumSupportedBuildTime > __APP_BUILD_TIME__) {
          console.warn("[VersionGate] Versão antiga bloqueada pelo backend.", {
            currentVersion: __APP_VERSION__,
            currentBuildTime: __APP_BUILD_TIME__,
            minimumSupportedVersion: payload.minimum_supported_version,
            minimumSupportedBuildTime,
          });
          setStatus("blocked");
          return;
        }
        setStatus("ok");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("[VersionGate] Falha ao verificar versão mínima.", error);
        setStatus((current) => (current === "blocked" ? current : "ok"));
      })
      .finally(() => {
        window.clearTimeout(fallbackId);
        checkInFlightRef.current = false;
        if (checkControllerRef.current === controller) checkControllerRef.current = null;
      });
  }, []);

  useEffect(() => {
    void checkVersion();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkVersion();
    }, CHECK_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
      checkControllerRef.current?.abort();
      checkControllerRef.current = null;
      checkInFlightRef.current = false;
    };
  }, [checkVersion]);

  // Block keyboard shortcuts and right-click while blocked
  useEffect(() => {
    if (status !== "blocked") return;
    const block = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const blockKey = (e: KeyboardEvent) => {
      // Allow only F5 / Ctrl+R / Cmd+R for reloading
      const isReload = e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r");
      if (!isReload) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("keydown", blockKey, true);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("keydown", blockKey, true);
      document.body.style.overflow = "";
    };
  }, [status]);

  const handleUpdateNow = async () => {
    setReloading(true);
    try {
      // Limpa caches do Service Worker para garantir versão fresca
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn("[VersionGate] Falha ao limpar caches:", e);
    }
    const forceUpdate = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
    if (forceUpdate) {
      try { await forceUpdate(); } catch { /* ignore */ }
    }
    // Bypass cache adicionando query param
    const url = new URL(window.location.href);
    url.searchParams.set("__v", Date.now().toString());
    window.location.replace(url.toString());
  };

  if (status === "checking") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-6 text-foreground">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-semibold">Verificando versão mais recente…</p>
        </div>
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-required-title"
        className="fixed inset-0 z-[2147483647] flex items-center justify-center px-4 py-6 overflow-hidden"
        style={{
          background:
            "linear-gradient(160deg, hsl(220, 90%, 8%) 0%, hsl(220, 60%, 14%) 60%, hsl(220, 90%, 6%) 100%)",
        }}
      >
        {/* Animated glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, hsla(0, 80%, 60%, 0.25) 0%, transparent 60%)",
          }}
        />

        <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-7 shadow-2xl animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-destructive/30 blur-2xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-destructive/20 border-2 border-destructive/50 text-destructive">
                <ShieldAlert className="h-10 w-10" />
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] font-bold text-destructive mb-3">
              <Lock className="h-3 w-3" />
              Acesso bloqueado
            </div>

            <h1 id="update-required-title" className="text-3xl font-extrabold tracking-tight text-white">
              Atualização obrigatória
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Esta versão do aplicativo foi descontinuada. Para continuar usando o sistema com segurança, atualize agora para a versão mais recente.
            </p>

            <div className="mt-5 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-left text-xs space-y-1.5 font-mono">
              <p className="flex justify-between gap-2">
                <span className="text-white/60">Versão atual</span>
                <span className="text-white font-bold">v{__APP_VERSION__}</span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-white/60">Versão mínima</span>
                <span className="text-white font-bold">
                  v{remoteVersion?.minimum_supported_version ?? remoteVersion?.latest_version ?? "mais recente"}
                </span>
              </p>
              {remoteVersion?.minimum_supported_build_time ? (
                <p className="flex justify-between gap-2">
                  <span className="text-white/60">Liberada em</span>
                  <span className="text-white font-bold">
                    {formatBuildDate(Number(remoteVersion.minimum_supported_build_time))} UTC
                  </span>
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              size="lg"
              onClick={handleUpdateNow}
              disabled={reloading}
              className="mt-6 h-14 w-full gap-2 font-extrabold text-base uppercase tracking-wider bg-white text-destructive hover:bg-white/90"
            >
              {reloading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Atualizando…
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5" /> Atualizar agora
                </>
              )}
            </Button>

            <p className="mt-4 text-[11px] text-white/50">
              O acesso permanecerá bloqueado até você recarregar a página.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
