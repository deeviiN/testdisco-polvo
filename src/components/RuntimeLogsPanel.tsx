import { useEffect, useState } from "react";
import { Bug, X, Trash2, AlertCircle, AlertTriangle, Info, Wifi } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  RuntimeLogEntry,
  clearRuntimeLogs,
  subscribeRuntimeLogs,
} from "@/lib/runtimeLogs";

const LEVEL_META: Record<RuntimeLogEntry["level"], { icon: any; cls: string; label: string }> = {
  error:   { icon: AlertCircle,   cls: "text-red-300 bg-red-500/15 border-red-500/30",     label: "ERRO" },
  warn:    { icon: AlertTriangle, cls: "text-amber-200 bg-amber-500/15 border-amber-500/30", label: "AVISO" },
  network: { icon: Wifi,          cls: "text-orange-200 bg-orange-500/15 border-orange-500/30", label: "REDE" },
  info:    { icon: Info,          cls: "text-sky-200 bg-sky-500/15 border-sky-500/30",     label: "INFO" },
};

export default function RuntimeLogsPanel() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);
  const [filter, setFilter] = useState<RuntimeLogEntry["level"] | "all">("all");

  useEffect(() => subscribeRuntimeLogs(setLogs), []);

  const isGestor = profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida" || profile?.role === "admin";
  if (!isGestor) return null;

  const errorCount = logs.filter((l) => l.level === "error").length;
  const filtered = filter === "all" ? logs : logs.filter((l) => l.level === filter);

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir logs do sistema"
        className="fixed bottom-4 right-4 z-[60] h-12 w-12 rounded-full bg-[hsl(220,50%,18%)] border border-white/20 shadow-lg flex items-center justify-center text-white hover:scale-105 transition"
      >
        <Bug className="h-5 w-5" />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
            {errorCount > 99 ? "99+" : errorCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl h-[80vh] sm:h-[70vh] bg-[hsl(220,40%,12%)] border-t sm:border border-white/10 sm:rounded-2xl flex flex-col text-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-white/70" />
                <h2 className="font-bold">Logs do sistema</h2>
                <span className="text-xs text-white/50">({logs.length})</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => clearRuntimeLogs()}
                  className="h-8 px-2 rounded-lg hover:bg-white/10 text-white/70 flex items-center gap-1 text-xs"
                  title="Limpar"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-1 px-3 py-2 border-b border-white/10 overflow-x-auto">
              {(["all", "error", "warn", "network", "info"] as const).map((k) => {
                const active = filter === k;
                const label = k === "all" ? "Todos" : k === "error" ? "Erros" : k === "warn" ? "Avisos" : k === "network" ? "Rede" : "Info";
                const count = k === "all" ? logs.length : logs.filter((l) => l.level === k).length;
                return (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold transition ${
                      active ? "bg-amber-400/25 text-amber-200 border border-amber-400/50" : "bg-white/5 text-white/60 border border-white/10"
                    }`}
                  >
                    {label} <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center text-white/40 text-sm py-12">
                  Sem registros{filter !== "all" ? " neste filtro" : ""}.
                </div>
              ) : (
                filtered.map((l) => {
                  const meta = LEVEL_META[l.level];
                  const Icon = meta.icon;
                  return (
                    <div key={l.id} className={`rounded-lg border p-2.5 ${meta.cls}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-black uppercase">{meta.label}</span>
                        {l.source && <span className="text-[10px] opacity-60">• {l.source}</span>}
                        <span className="ml-auto text-[10px] opacity-60 tabular-nums">
                          {new Date(l.ts).toLocaleTimeString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-xs font-medium break-words whitespace-pre-wrap">{l.message}</p>
                      {l.detail && (
                        <pre className="mt-1 text-[10px] opacity-70 whitespace-pre-wrap break-words font-mono max-h-32 overflow-auto">
                          {l.detail}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
