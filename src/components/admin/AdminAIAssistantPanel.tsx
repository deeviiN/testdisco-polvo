import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot, Sparkles, AlertCircle, Stethoscope, Wrench, Loader2, Send, Trash2,
  CheckCircle2, Wifi, WifiOff, RefreshCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { withReqIdButtons, ReqIdCopyButton } from "@/components/admin/ReqIdCopyButton";
import { useErrorCapture } from "@/hooks/useErrorCapture";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-assistant`;

export function AdminAIAssistantPanel() {
  const { errors, clear } = useErrorCapture();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [lastFixReport, setLastFixReport] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{ status: number | null; reqId?: string; reason?: string; message: string; endpoint: string; ts: number } | null>(null);

  // Auto-dismiss do banner de erro após 10s (reinicia o timer a cada novo erro)
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => {
      setLastError((prev) => (prev && prev.ts === lastError.ts ? null : prev));
    }, 10_000);
    return () => clearTimeout(t);
  }, [lastError]);

  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  const sendStream = async (userText: string, withContext: boolean) => {
    const userMsg: Msg = { role: "user", content: userText };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    let soFar = "";
    const upsert = (chunk: string) => {
      soFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: soFar } : m));
        }
        return [...prev, { role: "assistant", content: soFar }];
      });
    };

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const ctx = withContext
        ? {
            route: window.location.pathname,
            recentErrors: errors.slice(0, 8),
            online: navigator.onLine,
          }
        : { route: window.location.pathname };

      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: ctx,
        }),
      });

      if (!resp.ok || !resp.body) {
        let errMsg = `Falha ${resp.status}`;
        let reqId: string | undefined;
        let reason: string | undefined;
        let detail: string | undefined;
        try {
          const j = await resp.json();
          errMsg = j.error || errMsg;
          reqId = j.reqId;
          reason = j.reason;
          detail = j.detail;
        } catch { /* ignore */ }
        setLastError({ status: resp.status, reqId, reason, message: errMsg, endpoint: ENDPOINT, ts: Date.now() });
        const parts = [errMsg];
        if (reason) parts.push(`motivo: ${reason}`);
        if (detail) parts.push(detail);
        if (reqId) parts.push(`reqId: ${reqId}`);
        throw new Error(parts.join(" · "));
      }
      // sucesso: limpa banner anterior
      setLastError(null);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) upsert(delta);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setLastError((prev) =>
        prev && prev.ts > Date.now() - 1000
          ? prev
          : { status: null, message: msg, endpoint: ENDPOINT, ts: Date.now() },
      );
      toast.error(msg);
      upsert(`\n\n_⚠️ ${msg}_`);
    } finally {
      setStreaming(false);
    }
  };

  const autoFix = async () => {
    setAutoFixing(true);
    const steps: string[] = [];
    try {
      // 1) Conectividade
      steps.push(navigator.onLine ? "✓ Conexão de rede ativa" : "✗ Offline — conecte-se à internet");
      if (!navigator.onLine) throw new Error("Sem conexão");

      // 2) Refresh de sessão
      try {
        const { error } = await supabase.auth.refreshSession();
        steps.push(error ? `⚠ Sessão: ${error.message}` : "✓ Sessão renovada");
      } catch (e) {
        steps.push(`⚠ Sessão: ${(e as Error).message}`);
      }

      // 3) Ping no backend (RPC leve)
      try {
        const { error } = await supabase.rpc("get_app_version_manifest");
        steps.push(error ? `⚠ Backend: ${error.message}` : "✓ Backend respondeu");
      } catch (e) {
        steps.push(`⚠ Backend: ${(e as Error).message}`);
      }

      // 4) Limpar caches transitórios do sessionStorage (mantém localStorage do user)
      try {
        sessionStorage.clear();
        steps.push("✓ Cache de sessão limpo");
      } catch {
        steps.push("⚠ Não foi possível limpar sessionStorage");
      }

      // 5) Limpar buffer de erros
      const hadErrors = errors.length;
      clear();
      steps.push(`✓ ${hadErrors} erro(s) recente(s) descartado(s) do buffer`);

      setLastFixReport(steps.join("\n"));
      toast.success("Auto-correção concluída — verifique o relatório");
    } catch (e) {
      setLastFixReport([...steps, `\n❌ Interrompido: ${(e as Error).message}`].join("\n"));
      toast.error("Auto-correção interrompida");
    } finally {
      setAutoFixing(false);
    }
  };

  const diagnose = () => {
    if (errors.length === 0) {
      toast.info("Nenhum erro recente. Tudo parece OK!");
      return;
    }
    sendStream("Diagnostique os erros recentes capturados e me diga o que fazer agora.", true);
  };

  return (
    <Card className="border-0 shadow-card overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-accent/10 border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Bot className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                Assistente Técnico IA
                <Sparkles className="h-3 w-3 text-primary" />
              </p>
              <p className="text-[11px] text-muted-foreground">
                Diagnóstico, auto-recuperação e chat técnico do painel admin
              </p>
            </div>
          </div>
          <Badge
            variant={online ? "outline" : "destructive"}
            className={`h-7 gap-1.5 px-2.5 transition-all duration-300 shadow-sm border-2 ${
              online 
                ? "bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-600" 
                : "bg-destructive/20 text-destructive border-destructive/40"
            }`}
          >
            {online ? (
              <Wifi className="h-4 w-4 animate-pulse text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            <span className="text-[10px] font-black tracking-tight uppercase">
              {online ? "Conectado" : "Offline"}
            </span>
          </Badge>
        </div>

        {/* Last error banner */}
        {lastError && (
          <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30 flex flex-col gap-1 text-[11px]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="font-semibold text-destructive shrink-0">
                {lastError.status ?? "ERR"}
              </span>
              <span className="text-foreground/80 truncate flex-1 min-w-0" title={lastError.message}>
                {lastError.reason ?? lastError.message}
              </span>
              {lastError.reqId && <ReqIdCopyButton reqId={lastError.reqId} />}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => setLastError(null)}
                title="Dispensar"
              >
                <span className="sr-only">Dispensar</span>
                ×
              </Button>
            </div>
            <div
              className="font-mono text-[10px] text-muted-foreground truncate pl-5"
              title={lastError.endpoint}
            >
              POST {(() => {
                try { return new URL(lastError.endpoint).pathname; }
                catch { return lastError.endpoint; }
              })()}
            </div>
          </div>
        )}

        {/* Health row */}
        <div className="px-4 py-3 grid grid-cols-2 gap-2 border-b">
          <div className="rounded-xl bg-secondary/50 p-2.5 flex items-center gap-2">
            {errors.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Erros</p>
              <p className="text-sm font-bold leading-tight">
                {errors.length === 0 ? "Nenhum" : `${errors.length} capturado(s)`}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-secondary/50 p-2.5 flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Status</p>
              <p className="text-sm font-bold leading-tight">
                {streaming ? "Pensando…" : autoFixing ? "Corrigindo…" : "Pronto"}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 grid grid-cols-2 gap-2 border-b">
          <Button
            size="sm"
            variant="outline"
            className="h-10 rounded-xl gap-1.5 font-semibold"
            onClick={diagnose}
            disabled={streaming || autoFixing}
          >
            <Stethoscope className="h-4 w-4" />
            Diagnosticar
          </Button>
          <Button
            size="sm"
            className="h-10 rounded-xl gap-1.5 font-semibold bg-primary"
            onClick={autoFix}
            disabled={streaming || autoFixing}
          >
            {autoFixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Auto-corrigir
          </Button>
        </div>

        {/* Errors list */}
        {errors.length > 0 && (
          <div className="px-4 py-2.5 border-b bg-destructive/5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-medium text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Erros recentes
              </p>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={clear} title="Limpar">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="max-h-24">
              <ul className="space-y-1">
                {errors.slice(0, 5).map((e) => (
                  <li key={e.id} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase shrink-0">
                      {e.type}
                    </Badge>
                    <span className="text-wrap break-words">{e.message}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        {/* Auto-fix report */}
        {lastFixReport && (
          <div className="px-4 py-2.5 border-b bg-secondary/30">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-medium flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                Último relatório de auto-correção
              </p>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setLastFixReport(null)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words font-mono">
              {lastFixReport}
            </pre>
          </div>
        )}

        {/* Chat */}
        <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-2">
              Faça uma pergunta técnica ou clique em <b>Diagnosticar</b>.
            </p>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-[13px] max-w-[92%] ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-1 prose-pre:my-1.5 prose-pre:text-[10px] prose-code:text-[11px]">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p>{withReqIdButtons(children)}</p>,
                        em: ({ children }) => <em>{withReqIdButtons(children)}</em>,
                        li: ({ children }) => <li>{withReqIdButtons(children)}</li>,
                      }}
                    >
                      {m.content || "…"}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
              </div>
            ))
          )}
          {streaming && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Pensando…
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = input.trim();
            if (!t || streaming) return;
            sendStream(t, errors.length > 0);
          }}
          className="border-t p-3 flex gap-2 items-end bg-background"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const t = input.trim();
                if (t && !streaming) sendStream(t, errors.length > 0);
              }
            }}
            placeholder="Pergunte algo técnico ou descreva o bug…"
            className="resize-none min-h-[40px] max-h-28 text-sm rounded-xl"
            rows={1}
            disabled={streaming || autoFixing}
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-xl h-10 w-10 shrink-0"
            disabled={streaming || autoFixing || !input.trim()}
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
