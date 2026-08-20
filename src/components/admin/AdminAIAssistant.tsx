import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, AlertCircle, Trash2, Stethoscope, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { withReqIdButtons } from "@/components/admin/ReqIdCopyButton";
import { useErrorCapture } from "@/hooks/useErrorCapture";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-assistant`;

export function AdminAIAssistant() {
  const { errors, clear } = useErrorCapture();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const sendStream = async (userText: string, opts?: { withContext?: boolean }) => {
    const userMsg: Msg = { role: "user", content: userText };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const ctx = opts?.withContext
        ? {
            route: window.location.pathname,
            recentErrors: errors.slice(0, 8),
            userAgent: navigator.userAgent.slice(0, 120),
            online: navigator.onLine,
          }
        : { route: window.location.pathname };

      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: ctx,
        }),
        signal: ctrl.signal,
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
        } catch {
          // ignore
        }
        const parts = [errMsg];
        if (reason) parts.push(`motivo: ${reason}`);
        if (detail) parts.push(detail);
        if (reqId) parts.push(`reqId: ${reqId}`);
        throw new Error(parts.join(" · "));
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        textBuffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) upsert(delta);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      if (msg !== "AbortError") {
        toast.error(msg);
        upsert(`\n\n_⚠️ ${msg}_`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const diagnose = () => {
    if (errors.length === 0) {
      toast.info("Nenhum erro recente capturado. Tudo parece OK!");
      return;
    }
    setOpen(true);
    setTimeout(() => {
      sendStream(
        `Diagnostique os erros capturados recentemente no painel admin e me diga o que fazer.`,
        { withContext: true },
      );
    }, 200);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    sendStream(text, { withContext: errors.length > 0 });
  };

  return (
    <>
      {/* Floating action button */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {errors.length > 0 && (
          <Button
            onClick={diagnose}
            size="sm"
            variant="destructive"
            className="rounded-full shadow-lg gap-1.5 h-9"
          >
            <Stethoscope className="h-4 w-4" />
            Diagnosticar ({errors.length})
          </Button>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              size="lg"
              className="rounded-full h-14 w-14 shadow-xl bg-primary hover:bg-primary/90 relative"
              aria-label="Assistente IA"
            >
              <Bot className="h-6 w-6" />
              {errors.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                  {errors.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-3 border-b">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Assistente Técnico IA
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground text-left">
                Programador sênior virtual — diagnostica e explica falhas no painel admin.
              </p>
            </SheetHeader>

            {/* Errors panel */}
            {errors.length > 0 && (
              <div className="px-4 py-2 bg-destructive/5 border-b">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {errors.length} erro(s) capturado(s)
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md text-[11px] gap-1"
                      onClick={diagnose}
                      disabled={streaming}
                    >
                      <Stethoscope className="h-3 w-3" />
                      Diagnosticar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={clear}
                      title="Limpar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <ScrollArea className="max-h-24">
                  <ul className="space-y-1">
                    {errors.slice(0, 5).map((e) => (
                      <li
                        key={e.id}
                        className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                      >
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[9px] uppercase shrink-0"
                        >
                          {e.type}
                        </Badge>
                        <span className="truncate">{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <Bot className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    Pergunte algo técnico, descreva um bug, ou clique em <b>Diagnosticar</b> para
                    eu analisar os erros recentes.
                  </p>
                  <div className="flex flex-wrap gap-1.5 justify-center pt-2">
                    {[
                      "Como funciona RLS aqui?",
                      "Por que esse painel está lento?",
                      "O que é grace period?",
                    ].map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full text-[11px]"
                        onClick={() => sendStream(s)}
                        disabled={streaming}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-sm max-w-[92%] ${
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-1.5 prose-pre:my-2 prose-pre:text-[11px] prose-code:text-[12px]">
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
              ))}
              {streaming && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pensando…
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} className="border-t p-3 flex gap-2 items-end bg-background">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Descreva o bug ou faça uma pergunta técnica…"
                className="resize-none min-h-[40px] max-h-32 text-sm rounded-xl"
                rows={1}
                disabled={streaming}
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-xl h-10 w-10 shrink-0"
                disabled={streaming || !input.trim()}
              >
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
