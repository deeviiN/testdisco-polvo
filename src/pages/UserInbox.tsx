import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, MessagesSquare, Paperclip, FileText, X, ChevronDown, Image as ImageIcon, Mic, Video, File as FileIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSchoolMessagesUnread, SCHOOL_MESSAGES_LAST_SEEN_PREFIX, getStoredLastSeen } from "@/hooks/useSchoolMessagesUnread";
import { getInboxAlertsEnabled } from "@/hooks/useInboxAlerts";
import { addIncoming, clearAll, markUpTo, pruneRemoved, pruneBySeen } from "@/lib/inboxUnread";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ChatBackdrop from "@/components/inbox/ChatBackdrop";
import CallButtons from "@/components/call/CallButtons";
import { AttachmentBody } from "@/components/chat/AttachmentBody";

type Msg = {
  id: string;
  school_id: string;
  sender_user_id: string;
  sender_name: string;
  content: string;
  created_at: string;
};

const ATTACH_PREFIX = "[anexo]";
const MAX_FILE_MB = 50;

function parseAttachment(content: string): { url: string; name: string; rest: string } | null {
  // format: [anexo](url)(name)\n<rest>
  const m = content.match(/^\[anexo\]\((.+?)\)\((.+?)\)(?:\n([\s\S]*))?$/);
  if (!m) return null;
  return { url: m[1], name: m[2], rest: m[3] ?? "" };
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function isVideo(name: string) {
  return /\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(name);
}

export default function UserInbox() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const schoolId = profile?.school_id ?? null;
  const senderName = profile?.full_name ?? "Usuário";
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastAggRef = useRef<{ items: Msg[]; timer: number | null }>({ items: [], timer: null });
  const [previewItems, setPreviewItems] = useState<Msg[] | null>(null);
  const TOAST_ID = "inbox-new-messages";
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setFilePreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const fileKind: "image" | "video" | "audio" | "doc" = file
    ? file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
      ? "audio"
      : "doc"
    : "doc";
  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || !schoolId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("school_messages")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancel) {
        setMessages((data ?? []) as Msg[]);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [user?.id, schoolId, authLoading]);

  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel(`school_messages:${schoolId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "school_messages", filter: `school_id=eq.${schoolId}` },
        (payload) => {
          const row = payload.new as Msg;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
          if (row.sender_user_id !== user?.id && !stickToBottomRef.current) {
            const agg = toastAggRef.current;
            const isFirst = agg.items.length === 0;
            agg.items = [...agg.items, row];
            if (isFirst && getInboxAlertsEnabled()) {
              try {
                if ("vibrate" in navigator) navigator.vibrate(40);
                const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
                if (Ctx) {
                  const ctx = new Ctx();
                  const o = ctx.createOscillator();
                  const g = ctx.createGain();
                  o.type = "sine";
                  o.frequency.value = 880;
                  g.gain.setValueAtTime(0.0001, ctx.currentTime);
                  g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
                  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
                  o.connect(g).connect(ctx.destination);
                  o.start();
                  o.stop(ctx.currentTime + 0.2);
                  setTimeout(() => ctx.close(), 300);
                }
              } catch {}
            }
            const showToast = () => {
              const items = agg.items;
              const count = items.length;
              const last = items[count - 1];
              const lastAtt = parseAttachment(last.content);
              const lastPreview = lastAtt ? `📎 ${lastAtt.name}` : last.content.slice(0, 80);
              const title = count === 1
                ? `Nova mensagem de ${last.sender_name}`
                : `${count} novas mensagens`;
              const description = count === 1
                ? lastPreview
                : `Última de ${last.sender_name}: ${lastPreview}`;
              toast.message(title, {
                id: TOAST_ID,
                description,
                action: {
                  label: count > 1 ? "Ver todas" : "Ver",
                  onClick: () => scrollToBottom(),
                },
                cancel: {
                  label: "Pré-visualizar",
                  onClick: () => setPreviewItems([...agg.items]),
                },
              });
            };
            showToast();
            if (agg.timer) window.clearTimeout(agg.timer);
            agg.timer = window.setTimeout(() => {
              toastAggRef.current = { items: [], timer: null };
            }, 4000);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "school_messages" },
        (payload) => {
          const row = payload.old as Partial<Msg>;
          if (!row?.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [schoolId]);

  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const unreadNew = unreadIds.size;
  const prevCountRef = useRef(0);
  const lastIdsRef = useRef<Set<string>>(new Set());
  const { markAllSeen, markSeenUpTo } = useSchoolMessagesUnread(true);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = messages.length;
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadIds((s) => clearAll(s));
      markAllSeen();
    } else {
      if (curr > prev) {
        setUnreadIds((s) => addIncoming(s, messages, prev, user?.id));
      }
      // Reconcile against realtime DELETEs and any external last-seen update.
      setUnreadIds((s) => pruneRemoved(s, messages));
      setUnreadIds((s) => pruneBySeen(s, messages, getStoredLastSeen(user?.id)));
    }
    prevCountRef.current = curr;
    lastIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages, markAllSeen, user?.id]);

  // Cross-tab sync: another tab marked messages as read -> prune our set.
  useEffect(() => {
    if (!user?.id) return;
    const key = `${SCHOOL_MESSAGES_LAST_SEEN_PREFIX}${user.id}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || !e.newValue) return;
      setUnreadIds((s) => pruneBySeen(s, messages, e.newValue!));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user?.id, messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < 80;
    stickToBottomRef.current = near;
    setAtBottom(near);
    if (near) {
      setUnreadIds((s) => clearAll(s));
      markAllSeen();
    }
  };

  const scrollToBottom = () => {
    stickToBottomRef.current = true;
    setAtBottom(true);
    setUnreadIds((s) => clearAll(s));
    markAllSeen();
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const jumpToMessage = (id: string) => {
    setPreviewItems(null);
    stickToBottomRef.current = false;
    setAtBottom(false);
    const target = messages.find((m) => m.id === id);
    if (target) {
      markSeenUpTo(target.created_at);
      setUnreadIds((s) => markUpTo(s, messages, target.created_at));
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400", "ring-offset-2", "ring-offset-background");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2", "ring-offset-background");
      }, 1800);
    });
  };
  const pickFile = (accept?: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept ?? "image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt";
      fileInputRef.current.click();
    }
  };

  const ALLOWED_EXT = [
    "jpg","jpeg","png","gif","webp","heic","heif","bmp","svg",
    "mp4","webm","mov","mkv","avi","m4v",
    "mp3","wav","ogg","oga","m4a","aac","weba",
    "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","rtf"
  ];
  const isAllowed = (f: File) => {
    if (
      f.type.startsWith("image/") ||
      f.type.startsWith("video/") ||
      f.type.startsWith("audio/")
    ) return true;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    return ALLOWED_EXT.includes(ext);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size === 0) {
      toast.error("Arquivo vazio. Selecione um arquivo válido.");
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      toast.error(`Arquivo de ${mb}MB excede o limite de ${MAX_FILE_MB}MB.`);
      return;
    }
    if (!isAllowed(f)) {
      toast.error(
        "Tipo de arquivo não permitido. Envie foto, vídeo, áudio ou documento (PDF/Office/TXT).",
      );
      return;
    }
    setFile(f);
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !file) || !schoolId || !user?.id || sending) return;
    stickToBottomRef.current = true;
    setAtBottom(true);
    setSending(true);
    try {
      let content = body;
      if (file) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${user.id}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("chat_attachments")
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw upErr;
        // Bucket privado: armazenamos o path e assinamos a URL na hora de exibir.
        content = `${ATTACH_PREFIX}(${path})(${safeName})${body ? `\n${body}` : ""}`;
      }
      const { error } = await supabase.from("school_messages").insert({
        school_id: schoolId,
        sender_user_id: user.id,
        sender_name: senderName,
        content,
      });
      if (error) throw error;
      setText("");
      setFile(null);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível enviar a mensagem");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-dvh bg-background">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b px-3 pt-16 pb-3 sm:pl-16 sm:pr-36 sm:pt-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base sm:text-lg font-bold flex items-center gap-2 leading-tight min-w-0 flex-1">
          <MessagesSquare className="h-5 w-5 shrink-0" />
          <span className="break-words min-w-0">Mensagens</span>
        </h1>
        <CallButtons />
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 relative bg-muted/60 dark:bg-muted/30">
        <div className="fixed inset-0 pointer-events-none z-0"><ChatBackdrop /></div>
        {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>}
        {!loading && messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            <MessagesSquare className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Seja o primeiro a enviar uma mensagem.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_user_id === user?.id;
          const att = parseAttachment(m.content);
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`relative z-10 flex ${mine ? "justify-end" : "justify-start"} transition-all duration-500 rounded-2xl`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-secondary-foreground rounded-bl-sm"
                }`}
              >
                {!mine && (
                  <p className="text-[10px] font-semibold opacity-80 mb-0.5 break-words">
                    {m.sender_name}
                  </p>
                )}
                {att ? (
                  <>
                    <AttachmentBody rawUrl={att.url} name={att.name} variant="inbox" />
                    {att.rest && <p className="whitespace-pre-wrap">{att.rest}</p>}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
                <p className={`text-[9px] mt-1 ${mine ? "opacity-80" : "opacity-70"}`}>
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!atBottom && (
        <div className="relative">
          {unreadNew > 0 ? (
            <Button
              type="button"
              onClick={scrollToBottom}
              className="absolute -top-12 left-1/2 -translate-x-1/2 h-10 px-4 rounded-full shadow-lg animate-fade-in gap-2"
            >
              <ChevronDown className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Ver {unreadNew} {unreadNew === 1 ? "mensagem nova" : "mensagens novas"}
              </span>
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={scrollToBottom}
              className="absolute -top-12 right-3 h-10 w-10 rounded-full shadow-lg animate-fade-in"
              aria-label="Ir para o final"
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          )}
        </div>
      )}

      {file && (
        <div className="border-t bg-secondary/40 px-3 py-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {fileKind === "image" && filePreviewUrl && (
                <img
                  src={filePreviewUrl}
                  alt={file.name}
                  className="max-h-48 w-auto rounded-md border object-contain bg-background"
                />
              )}
              {fileKind === "video" && filePreviewUrl && (
                <video
                  src={filePreviewUrl}
                  controls
                  className="max-h-48 w-auto rounded-md border object-contain bg-background"
                />
              )}
              {fileKind === "audio" && filePreviewUrl && (
                <audio src={filePreviewUrl} controls className="w-full" />
              )}
              {fileKind === "doc" && (
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  <FileText className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{file.name}</span>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{file.name}</span>
                <span className="shrink-0">· {formatBytes(file.size)}</span>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => setFile(null)}
              aria-label="Remover anexo"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 border-t bg-background/95 p-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFileChange}
          accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!schoolId || sending}
              className="h-11 w-11 shrink-0"
              aria-label="Anexar arquivo"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-44 p-1">
            <button
              type="button"
              onClick={() => pickFile("image/*")}
              className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <ImageIcon className="h-4 w-4" /> Foto
            </button>
            <button
              type="button"
              onClick={() => pickFile("video/*")}
              className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <Video className="h-4 w-4" /> Vídeo
            </button>
            <button
              type="button"
              onClick={() => pickFile("audio/*")}
              className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <Mic className="h-4 w-4" /> Áudio
            </button>
            <button
              type="button"
              onClick={() => pickFile("application/pdf,.doc,.docx,.xls,.xlsx,.txt")}
              className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <FileIcon className="h-4 w-4" /> Documento
            </button>
          </PopoverContent>
        </Popover>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Mensagem rápida…"
          maxLength={2000}
          disabled={!schoolId || sending}
          className="flex-1 min-h-[44px] max-h-32 resize-none py-2.5"
          rows={1}
        />
        <Button
          type="submit"
          disabled={(!text.trim() && !file) || sending}
          className="h-11 px-4"
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <Dialog open={!!previewItems} onOpenChange={(o) => !o && setPreviewItems(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novas mensagens ({previewItems?.length ?? 0})</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {previewItems?.map((m) => {
              const att = parseAttachment(m.content);
              const preview = att ? `📎 ${att.name}` : m.content;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => jumpToMessage(m.id)}
                  className="w-full text-left rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <p className="text-xs font-semibold break-words">{m.sender_name}</p>
                  <p className="text-sm break-words line-clamp-3">{preview}</p>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPreviewItems(null)}>Fechar</Button>
            <Button
              onClick={() => {
                setPreviewItems(null);
                toast.dismiss(TOAST_ID);
                scrollToBottom();
              }}
            >
              Ver todas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
