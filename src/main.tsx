import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/premium-buttons.css";
import { installRuntimeLogCapture } from "@/lib/runtimeLogs";
import { installSupabaseNoCacheFetch } from "@/lib/patchSupabaseFetch";

installSupabaseNoCacheFetch();
installRuntimeLogCapture();




// When the NEW service worker takes control, reload the page so the user
// sees the latest version immediately. Guarded to fire only once.
let reloadingFromSW = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingFromSW) return;
    reloadingFromSW = true;
    console.info("[PWA] Novo service worker assumiu o controle; recarregando app.");
    window.location.reload();
  });
}

// Show in-app banner asking the user to update when a new SW is ready.
function showUpdateBanner(onAccept: () => void) {
  if (document.getElementById("pwa-update-prompt")) return;

  const banner = document.createElement("div");
  banner.id = "pwa-update-prompt";
  banner.setAttribute("role", "alertdialog");
  banner.setAttribute("aria-live", "assertive");
  banner.innerHTML = `
    <style>
      #pwa-update-prompt {
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        z-index: 99999;
        max-width: calc(100vw - 24px);
        width: 360px;
        background: #1a8a5c;
        color: white;
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: pwa-slide-up 0.35s ease-out;
      }
      @keyframes pwa-slide-up {
        from { transform: translate(-50%, 120%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
      #pwa-update-prompt .pwa-text { flex: 1; font-size: 13px; line-height: 1.3; font-weight: 600; }
      #pwa-update-prompt .pwa-sub { font-weight: 400; opacity: 0.9; font-size: 11px; margin-top: 2px; }
      #pwa-update-prompt button {
        border: 0;
        background: white;
        color: #1a8a5c;
        font-weight: 700;
        font-size: 13px;
        padding: 9px 14px;
        border-radius: 10px;
        cursor: pointer;
        white-space: nowrap;
      }
      #pwa-update-prompt .pwa-close {
        background: transparent;
        color: rgba(255,255,255,0.85);
        padding: 4px 8px;
        font-weight: 700;
        font-size: 18px;
      }
    </style>
    <div class="pwa-text">
      Nova versão disponível
      <div class="pwa-sub">Toque em Atualizar para carregar as novidades.</div>
    </div>
    <button id="pwa-update-btn" type="button">Atualizar</button>
    <button id="pwa-close-btn" type="button" class="pwa-close" aria-label="Depois">×</button>
  `;
  document.body.appendChild(banner);

  document.getElementById("pwa-update-btn")?.addEventListener("click", () => {
    banner.remove();
    onAccept();
  });
  document.getElementById("pwa-close-btn")?.addEventListener("click", () => {
    banner.remove();
  });
}

let forceUpdateInProgress = false;

// Sinaliza globalmente que uma nova versão está disponível para ser aplicada
// pelo botão "Atualizar". Telas (ex.: GestorPanel) escutam o evento
// `app:update-available` para piscar o botão de atualização.
function signalUpdateAvailable(source: string) {
  const w = window as unknown as { __appUpdateAvailable?: boolean };
  if (w.__appUpdateAvailable) return;
  w.__appUpdateAvailable = true;
  console.info(`[PWA] Atualização disponível (${source}).`);
  try {
    window.dispatchEvent(new CustomEvent("app:update-available", { detail: { source } }));
  } catch {
    // ignore
  }
}

async function clearAppCaches() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

async function forceAppUpdate() {
  if (forceUpdateInProgress) return;
  forceUpdateInProgress = true;
  try {
    await clearAppCaches();
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        try {
          await r.update();
          r.waiting?.postMessage({ type: "SKIP_WAITING" });
          r.installing?.postMessage({ type: "SKIP_WAITING" });
        } catch {
          // ignore
        }
      }
      await Promise.all(regs.map((r) => r.unregister()));
    }
    try {
      const removeIfMatch = (storage: Storage) => {
        const toRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && /version|build|sw[-_:]|pwa|update/i.test(k)) toRemove.push(k);
        }
        toRemove.forEach((k) => storage.removeItem(k));
      };
      removeIfMatch(localStorage);
      removeIfMatch(sessionStorage);
    } catch {
      // ignore
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("__upd", Date.now().toString());
    window.location.replace(url.toString());
  }
}

function startFastVersionPolling() {
  if (!import.meta.env.PROD) return;

  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== "visible") return;
    checking = true;
    try {
      const response = await fetch(`/version.json?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return;
      const remote = (await response.json()) as { buildTime?: number };
      if (Number(remote.buildTime ?? 0) > __APP_BUILD_TIME__) {
        console.info("[PWA] Nova build detectada por version.json.", remote);
        signalUpdateAvailable("version.json");
      }
    } catch (error) {
      console.warn("[PWA] Falha ao consultar version.json.", error);
    } finally {
      checking = false;
    }
  };

  void check();
  window.addEventListener("focus", () => void check());
  document.addEventListener("visibilitychange", () => void check());
  window.setInterval(() => void check(), 60_000);
}

async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");

  if (isInIframe || isPreviewHost) {
    // No preview do Lovable: nunca usar SW/cache. Garante que cada abertura
    // mostre a build mais recente sem precisar "forçar atualização".
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      console.info("[PWA] Preview detectado: SW e caches limpos para sempre abrir na última versão.");
    } catch (err) {
      console.warn("[PWA] Falha ao limpar SW/cache no preview.", err);
    }
    return;
  }

  try {
    const serviceWorkerUrl = `/sw.js?v=${__APP_VERSION__}`;
    console.info(`[PWA] Registrando service worker em ${serviceWorkerUrl}`);

    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: "/",
      updateViaCache: "none",
    });

    // Sempre que o app abre, força verificação imediata de nova versão
    // e ativa o worker em espera automaticamente, sem pedir confirmação.
    // Assim o usuário sempre vê a última atualização ao abrir o app.
    const autoActivateWaiting = () => {
      const waiting = registration.waiting;
      if (waiting) {
        console.info("[PWA] Auto-ativando nova versão em espera ao abrir o app.");
        waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    try {
      await registration.update();
    } catch (err) {
      console.warn("[PWA] Falha ao verificar atualização na abertura.", err);
    }
    autoActivateWaiting();

    console.info("[PWA] Service worker registrado.", {
      active: registration.active?.scriptURL ?? null,
      waiting: registration.waiting?.scriptURL ?? null,
      installing: registration.installing?.scriptURL ?? null,
    });

    // Quando há um worker em espera/instalado, NÃO aplica sozinho:
    // apenas sinaliza para que o botão "Atualizar" pisque e o gestor decida.
    const notifyWaiting = () => {
      if (registration.waiting) {
        signalUpdateAvailable("sw.waiting");
      }
    };

    if (registration.waiting) {
      notifyWaiting();
    }

    navigator.serviceWorker.ready.then((readyRegistration) => {
      console.info("[PWA] Service worker pronto.", {
        active: readyRegistration.active?.scriptURL ?? null,
      });
    });

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      console.info("[PWA] Update encontrado; instalando novo service worker.");

      newWorker.addEventListener("statechange", () => {
        console.info(`[PWA] Estado do novo service worker: ${newWorker.state}`);

        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          signalUpdateAvailable("sw.updatefound");
        }
      });
    });

    const checkForUpdates = () => {
      if (document.visibilityState !== "visible") return;

      registration
        .update()
        .then(() => {
          console.info("[PWA] Verificação de atualização executada.");
        })
        .catch((error) => {
          console.warn("[PWA] Falha ao verificar atualização.", error);
        });
    };

    checkForUpdates();
    window.addEventListener("focus", checkForUpdates);
    document.addEventListener("visibilitychange", checkForUpdates);
    setInterval(checkForUpdates, 60_000);
  } catch (error) {
    console.warn("[PWA] Falha ao registrar service worker.", error);
  }
}

startFastVersionPolling();
void registerAppServiceWorker();

// Expose a hard-refresh helper: ativa SW em espera, desregistra todos,
// limpa todos os caches + storage de versão e recarrega forçando rede.
// Usado pelo botão "Forçar atualização" no menu de configurações e no rodapé.
(window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate = forceAppUpdate;

// Hide splash screen once React renders
const hideSplash = () => {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 400);
  }
};

createRoot(document.getElementById("root")!).render(<App />);

// Hide splash after first paint
requestAnimationFrame(() => {
  requestAnimationFrame(hideSplash);
});
