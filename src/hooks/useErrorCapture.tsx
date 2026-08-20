import { useEffect, useRef, useState, useCallback } from "react";

export type CapturedError = {
  id: string;
  ts: number;
  type: "js" | "promise" | "network";
  message: string;
  detail?: string;
  url?: string;
  status?: number;
};

const MAX_ERRORS = 20;

let listeners: Array<(e: CapturedError) => void> = [];
let buffer: CapturedError[] = [];
let installed = false;

function pushError(err: CapturedError) {
  buffer = [err, ...buffer].slice(0, MAX_ERRORS);
  listeners.forEach((l) => l(err));
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    pushError({
      id: crypto.randomUUID(),
      ts: Date.now(),
      type: "js",
      message: ev.message || "Erro JS",
      detail: ev.error?.stack?.slice(0, 800),
      url: ev.filename,
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason: unknown = ev.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason ?? {}).slice(0, 300);
    pushError({
      id: crypto.randomUUID(),
      ts: Date.now(),
      type: "promise",
      message: msg || "Promise rejeitada",
      detail: reason instanceof Error ? reason.stack?.slice(0, 800) : undefined,
    });
  });

  // Patch fetch para capturar respostas 4xx/5xx
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const resp = await origFetch(...args);
    if (!resp.ok && resp.status >= 400) {
      let url = "";
      try {
        url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
      } catch {
        // ignore
      }
      // Ignora chamadas para a própria function de IA (evita loop visual)
      if (!url.includes("/admin-ai-assistant")) {
        pushError({
          id: crypto.randomUUID(),
          ts: Date.now(),
          type: "network",
          message: `${resp.status} ${resp.statusText}`,
          url,
          status: resp.status,
        });
      }
    }
    return resp;
  };
}

export function useErrorCapture() {
  const [errors, setErrors] = useState<CapturedError[]>(buffer);
  const mounted = useRef(true);

  useEffect(() => {
    install();
    const listener = () => {
      if (mounted.current) setErrors([...buffer]);
    };
    listeners.push(listener);
    setErrors([...buffer]);
    return () => {
      mounted.current = false;
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const clear = useCallback(() => {
    buffer = [];
    listeners.forEach((l) => l({ id: "", ts: 0, type: "js", message: "" }));
  }, []);

  return { errors, clear };
}
