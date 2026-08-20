// Captura logs de runtime do app (erros, warnings, falhas de rede)
// para exibição em um painel interno visível ao gestor.

export type RuntimeLogLevel = "error" | "warn" | "info" | "network";

export interface RuntimeLogEntry {
  id: string;
  ts: number;
  level: RuntimeLogLevel;
  message: string;
  detail?: string;
  source?: string;
}

const MAX_LOGS = 300;
let logs: RuntimeLogEntry[] = [];
const listeners = new Set<(l: RuntimeLogEntry[]) => void>();
let installed = false;

function emit() {
  for (const l of listeners) l(logs);
}

function push(entry: Omit<RuntimeLogEntry, "id" | "ts">) {
  const e: RuntimeLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    ...entry,
  };
  logs = [e, ...logs].slice(0, MAX_LOGS);
  emit();
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

export function installRuntimeLogCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    push({
      level: "error",
      message: args.map(safeStringify).join(" ").slice(0, 500),
      source: "console.error",
    });
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    const message = args.map(safeStringify).join(" ").slice(0, 500);
    // Ignora ruído de scripts externos do preview (Lovable CDN, etc.)
    const isExternalNoise =
      message.includes("Unknown message type: RESET_BLANK_CHECK") ||
      message.includes("gpteng.co");
    if (!isExternalNoise) {
      push({
        level: "warn",
        message,
        source: "console.warn",
      });
    }
    origWarn(...args);
  };

  window.addEventListener("error", (ev) => {
    push({
      level: "error",
      message: ev.message || "Erro JavaScript",
      detail: ev.error?.stack || `${ev.filename}:${ev.lineno}:${ev.colno}`,
      source: "window.error",
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    push({
      level: "error",
      message: `Promise rejeitada: ${safeStringify(ev.reason).slice(0, 400)}`,
      source: "unhandledrejection",
    });
  });

  // Intercepta falhas de fetch
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
    try {
      const res = await origFetch(...args);
      if (!res.ok && res.status >= 400) {
        push({
          level: "network",
          message: `${res.status} ${res.statusText} — ${url}`,
          source: "fetch",
        });
      }
      return res;
    } catch (err) {
      push({
        level: "error",
        message: `Falha de rede: ${url}`,
        detail: safeStringify(err),
        source: "fetch",
      });
      throw err;
    }
  };

  push({ level: "info", message: "Painel de logs iniciado", source: "runtime" });
}

export function getRuntimeLogs(): RuntimeLogEntry[] {
  return logs;
}

export function clearRuntimeLogs() {
  logs = [];
  emit();
}

export function subscribeRuntimeLogs(cb: (l: RuntimeLogEntry[]) => void) {
  listeners.add(cb);
  cb(logs);
  return () => { listeners.delete(cb); };
}

export function logAppEvent(message: string, detail?: string) {
  push({ level: "info", message, detail, source: "app" });
}
