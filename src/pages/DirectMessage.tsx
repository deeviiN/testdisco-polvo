import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowDown, Send, User as UserIcon, Trash2, X, CheckCircle2, Circle, Forward, Search, Paperclip, FileText, Smile } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import CallButtons from "@/components/call/CallButtons";
import { AttachmentBody } from "@/components/chat/AttachmentBody";

type DM = {
  id: string;
  school_id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

const ATTACH_PREFIX = "[anexo]";
const MAX_FILE_MB = 50;
const ALLOWED_EXT = [
  "jpg","jpeg","png","gif","webp","heic","heif","bmp","svg",
  "mp4","webm","mov","mkv","avi","m4v",
  "mp3","wav","ogg","oga","m4a","aac","weba",
  "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","rtf",
];
export function parseAttachment(content: string): { url: string; name: string; rest: string } | null {
  const m = content.match(/^\[anexo\]\((.+?)\)\((.+?)\)(?:\r\n|\r|\n)?([\s\S]*)$/);
  if (!m) return null;
  return { url: m[1], name: m[2], rest: m[3] ?? "" };
}

/**
 * Constrói as linhas a inserir em `direct_messages` ao encaminhar.
 * Preserva integralmente o `content` original (inclusive o marcador `[anexo](url)(nome)`),
 * garantindo que foto / vídeo / PDF acompanhem a mensagem encaminhada.
 */
export function buildForwardRows(
  messages: Pick<DM, "id" | "content" | "created_at">[],
  forwardIds: string[],
  ctx: { school_id: string; sender_id: string; sender_name: string; recipient_id: string }
) {
  return messages
    .filter((m) => forwardIds.includes(m.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => ({
      school_id: ctx.school_id,
      sender_id: ctx.sender_id,
      sender_name: ctx.sender_name,
      recipient_id: ctx.recipient_id,
      content: m.content,
    }));
}
function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}
function isVideo(name: string) {
  return /\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(name);
}
// Detecta mensagens compostas só de emojis (até 8 grafemas) para renderizar grandes e sem fundo.
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D|\s)+$/u;
function emojiOnlyInfo(content: string): { isOnly: boolean; count: number } {
  const t = content.trim();
  if (!t || !EMOJI_ONLY_RE.test(t)) return { isOnly: false, count: 0 };
  let count = 0;
  try {
    // @ts-ignore
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const _ of seg.segment(t.replace(/\s+/g, ""))) count++;
  } catch {
    count = Array.from(t.replace(/\s+/g, "")).length;
  }
  return { isOnly: count > 0 && count <= 8, count };
}
const STICKERS = ["👍","❤️","😂","🎉","🥳","😍","🙏","👏","🔥","💯","😎","🤩","😢","😡","🤔","👀","💪","🙌","✅","❌","💖","🌟","🎂","🍕","☕","🌈","⚡","🚀","🏆","🎵"];
function isAllowedFile(f: File) {
  if (f.type.startsWith("image/") || f.type.startsWith("video/") || f.type.startsWith("audio/")) return true;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXT.includes(ext);
}

export default function DirectMessage() {
  const navigate = useNavigate();
  const { userId: otherId = "" } = useParams();
  const [search] = useSearchParams();
  const otherName = search.get("name") ?? "Contato";
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<DM[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherUnread, setOtherUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipAutoScrollRef = useRef(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardIds, setForwardIds] = useState<string[]>([]);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardContacts, setForwardContacts] = useState<{ user_id: string; full_name: string | null; role: string | null }[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerTab, setPickerTab] = useState<"emoji" | "sticker">("emoji");

  const sendSticker = async (emoji: string) => {
    if (!user?.id || !profile?.school_id || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        school_id: profile.school_id,
        sender_id: user.id,
        sender_name: profile.full_name ?? "Usuário",
        recipient_id: otherId,
        content: emoji,
      });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível enviar a figurinha");
    } finally {
      setSending(false);
    }
  };

  const selectionMode = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const startLongPress = (id: string) => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      toggleSelect(id);
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const deleteIds = async (ids: string[]) => {
    if (!ids.length) return;
    setDeleting(true);
    const { error } = await supabase.from("direct_messages").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      console.error(error);
      toast.error("Não foi possível apagar a(s) mensagem(ns)");
      return;
    }
    setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
    clearSelection();
    setPendingDeleteId(null);
    setConfirmOpen(false);
    toast.success(ids.length > 1 ? `${ids.length} mensagens apagadas` : "Mensagem apagada");
  };

  const openForward = async (ids: string[]) => {
    if (!ids.length || !profile?.school_id) return;
    setForwardIds(ids);
    setForwardOpen(true);
    setForwardQuery("");
    if (forwardContacts.length === 0) {
      setForwardLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("school_id", profile.school_id)
        .eq("is_approved", true)
        .order("full_name", { ascending: true });
      setForwardContacts(
        (data ?? [])
          .filter((c: any) => c.user_id && c.user_id !== user?.id)
          .map((c: any) => ({ user_id: c.user_id, full_name: c.full_name, role: c.role }))
      );
      setForwardLoading(false);
    }
  };

  const handleForward = async (recipientId: string) => {
    if (!user?.id || !profile?.school_id || forwarding) return;
    const toSend = messages.filter((m) => forwardIds.includes(m.id));
    if (!toSend.length) return;
    setForwarding(true);
    try {
      const rows = buildForwardRows(toSend, forwardIds, {
        school_id: profile.school_id,
        sender_id: user.id,
        sender_name: profile.full_name ?? "Usuário",
        recipient_id: recipientId,
      });
      const { error } = await supabase.from("direct_messages").insert(rows);
      if (error) throw error;
      toast.success(rows.length > 1 ? `${rows.length} mensagens encaminhadas` : "Mensagem encaminhada");
      setForwardOpen(false);
      setForwardIds([]);
      clearSelection();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível encaminhar");
    } finally {
      setForwarding(false);
    }
  };

  const PAGE_SIZE = 30;
  const JUMP_TO_BOTTOM_THRESHOLD_PX =
    Number(import.meta.env.VITE_JUMP_TO_BOTTOM_THRESHOLD_PX) || 200;

  const mergeMessages = (existing: DM[], incoming: DM[]): DM[] => {
    const map = new Map<string, DM>();
    for (const m of existing) map.set(m.id, m);
    for (const m of incoming) {
      const prev = map.get(m.id);
      if (!prev || (!prev.read_at && m.read_at)) map.set(m.id, m);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  };

  const pairFilter = (uid: string) =>
    `and(sender_id.eq.${uid},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uid})`;

  // load most recent page
  useEffect(() => {
    if (!user?.id || !otherId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(pairFilter(user.id))
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (cancel) return;
      if (error) {
        console.error(error);
        toast.error("Não foi possível carregar a conversa");
      } else {
        const rows = (data ?? []) as DM[];
        setMessages((prev) => mergeMessages(prev, rows));
        setHasMore(rows.length === PAGE_SIZE);
        await supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_id", user.id)
          .eq("sender_id", otherId)
          .is("read_at", null);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user?.id, otherId]);

  // Marca como lidas novamente quando a aba/janela ganha foco
  useEffect(() => {
    if (!user?.id || !otherId) return;
    const markRead = async () => {
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user.id)
        .eq("sender_id", otherId)
        .is("read_at", null);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") markRead();
    };
    window.addEventListener("focus", markRead);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", markRead);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, otherId]);

  // Conta mensagens não lidas em OUTRAS conversas (badge no header)
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const loadOtherUnread = async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("sender_id")
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (!active) return;
      const count = (data ?? []).filter((m: any) => m.sender_id !== otherId).length;
      setOtherUnread(count);
    };
    loadOtherUnread();
    const ch = supabase
      .channel(`dm-other-unread:${user.id}:${otherId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => loadOtherUnread()
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [user?.id, otherId]);

  const loadMore = async () => {
    if (!user?.id || !otherId || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0].created_at;
    const container = scrollRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    const prevTop = container?.scrollTop ?? 0;
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(pairFilter(user.id))
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      console.error(error);
      toast.error("Não foi possível carregar mais mensagens");
    } else {
      const older = (data ?? []) as DM[];
      skipAutoScrollRef.current = true;
      setMessages((prev) => mergeMessages(prev, older));
      setHasMore(older.length === PAGE_SIZE);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = prevTop + (container.scrollHeight - prevHeight);
        }
      });
    }
    setLoadingMore(false);
  };

  // realtime
  useEffect(() => {
    if (!user?.id || !otherId) return;
    const channel = supabase
      .channel(`dm:${user.id}:${otherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as DM;
          const involvesPair =
            (row.sender_id === user.id && row.recipient_id === otherId) ||
            (row.sender_id === otherId && row.recipient_id === user.id);
          if (!involvesPair) return;
          setMessages((prev) => mergeMessages(prev, [row]));
          if (row.recipient_id === user.id) {
            supabase
              .from("direct_messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", row.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages" },
        (payload) => {
          const oldRow = payload.old as Partial<DM>;
          if (!oldRow?.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, otherId]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJumpToBottom(distance > JUMP_TO_BOTTOM_THRESHOLD_PX);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const onPickFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = "image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf";
      fileInputRef.current.click();
    }
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
    if (!isAllowedFile(f)) {
      toast.error("Tipo de arquivo não permitido.");
      return;
    }
    setFile(f);
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !file) || !user?.id || !profile?.school_id || sending) return;
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
      const { error } = await supabase.from("direct_messages").insert({
        school_id: profile.school_id,
        sender_id: user.id,
        sender_name: profile.full_name ?? "Usuário",
        recipient_id: otherId,
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
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b pl-1 pr-3 pt-16 pb-3 sm:pl-2 sm:pr-36 sm:pt-3 flex items-center gap-2">
        {selectionMode ? (
          <>
            <Button variant="ghost" size="icon" onClick={clearSelection} className="h-9 w-9 shrink-0" aria-label="Cancelar seleção">
              <X className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold leading-tight">
                {selectedIds.size} selecionada{selectedIds.size > 1 ? "s" : ""}
              </h1>
              <p className="text-[11px] text-muted-foreground">Toque para marcar/desmarcar</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const all = messages.map((m) => m.id);
                const allSelected = all.every((id) => selectedIds.has(id));
                setSelectedIds(allSelected ? new Set() : new Set(all));
              }}
              className="h-9 px-2 text-xs font-semibold shrink-0"
            >
              {messages.length > 0 && messages.every((m) => selectedIds.has(m.id)) ? "Limpar" : "Todas"}
            </Button>
          </>
        ) : (
          <>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold shrink-0">
              {(otherName?.[0] ?? "?").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold leading-tight truncate" title={otherName}>{otherName}</h1>
              <p className="text-[11px] text-muted-foreground truncate">Conversa privada</p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (messages[0]) toggleSelect(messages[0].id);
                }}
                className="h-9 px-2 text-xs font-semibold shrink-0"
                aria-label="Selecionar mensagens"
                title="Selecionar mensagens"
              >
                Selecionar
              </Button>
            )}
            <CallButtons dmUserId={otherId} dmUserName={otherName} />
          </>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pt-6 pb-3 space-y-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>}
        {!loading && hasMore && (
          <div className="flex justify-center pb-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full text-xs h-8"
            >
              {loadingMore ? "Carregando…" : "Carregar mensagens anteriores"}
            </Button>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            <UserIcon className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Comece a conversa com {otherName}.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const canDelete = mine;
          const selected = selectedIds.has(m.id);
          const handleClick = () => {
            if (selectionMode) toggleSelect(m.id);
          };
          return (
            <div key={m.id} className={`flex items-center gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
              {selectionMode && (
                <span className="shrink-0 order-1">
                  {selected ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </span>
              )}
              {(() => {
                const att = parseAttachment(m.content);
                const emoji = !att ? emojiOnlyInfo(m.content) : { isOnly: false, count: 0 };
                const bare = emoji.isOnly;
                const sizeClass = emoji.count <= 2 ? "text-5xl leading-none" : emoji.count <= 4 ? "text-4xl leading-none" : "text-3xl leading-none";
                const mediaOnly = !!att && (isImage(att.name) || isVideo(att.name)) && !att.rest?.trim();
                return (
                  <div
                    onClick={handleClick}
                    onTouchStart={() => startLongPress(m.id)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={() => startLongPress(m.id)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    className={`relative max-w-[75%] break-words select-none ${
                      selected ? "ring-2 ring-primary rounded-2xl" : ""
                    } ${
                      bare
                        ? "px-1 py-1 bg-transparent text-foreground"
                        : mediaOnly
                          ? "rounded-2xl overflow-hidden bg-transparent p-0"
                          : `rounded-2xl px-3 py-2 text-sm ${
                              mine
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-secondary text-secondary-foreground rounded-bl-sm"
                            }`
                    }`}
                  >
                    {!bare && !mediaOnly && (
                      <span
                        aria-hidden
                        className={`absolute bottom-0 w-2.5 h-2.5 ${
                          mine
                            ? "-right-1 bg-primary"
                            : "-left-1 bg-secondary"
                        }`}
                        style={{
                          clipPath: mine
                            ? "polygon(0 0, 100% 100%, 0 100%)"
                            : "polygon(100% 0, 100% 100%, 0 100%)",
                        }}
                      />
                    )}
                    {att ? (
                      <>
                        <AttachmentBody
                          rawUrl={att.url}
                          name={att.name}
                          variant="chat"
                          mediaOnly={mediaOnly}
                        />
                        {att.rest && <p className="whitespace-pre-wrap">{att.rest}</p>}
                      </>
                    ) : bare ? (
                      <p className={`${sizeClass} whitespace-pre-wrap`}>{m.content}</p>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                    <p
                      className={`text-[9px] ${
                        mediaOnly
                          ? "absolute bottom-1 right-2 px-1.5 py-0.5 rounded-md bg-black/55 text-white"
                          : `mt-1 ${bare ? "text-muted-foreground text-right" : mine ? "opacity-80" : "opacity-70"}`
                      }`}
                    >
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                      {mine && m.read_at ? " • lida" : ""}
                    </p>
                  </div>
                );
              })()}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {selectionMode && (
        <div className="border-t bg-card/95 backdrop-blur grid grid-cols-2 gap-2 px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <Button
            type="button"
            variant="secondary"
            onClick={() => openForward(Array.from(selectedIds))}
            disabled={selectedIds.size === 0}
            className="h-12 rounded-xl font-semibold gap-2"
          >
            <Forward className="h-5 w-5" />
            Encaminhar
          </Button>
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={selectedIds.size === 0}
            className="h-12 rounded-xl font-semibold gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="h-5 w-5" />
            Apagar
          </Button>
        </div>
      )}

      <div className={`relative border-t bg-card/95 backdrop-blur px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] ${selectionMode ? "hidden" : ""}`}>
        {showJumpToBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute -top-12 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-primary text-primary-foreground shadow-lg text-xs font-semibold hover:opacity-90 active:scale-95 transition"
            aria-label="Ir para as últimas mensagens"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Últimas mensagens
          </button>
        )}
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 px-2 py-1.5 text-xs">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate flex-1" title={file.name}>{file.name}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-muted-foreground hover:text-destructive p-0.5"
              aria-label="Remover anexo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onPickFile}
            disabled={sending}
            className="h-11 w-11 shrink-0 rounded-xl"
            aria-label="Anexar arquivo"
            title="Anexar foto, vídeo ou documento (até 50MB)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={sending}
                className="h-11 w-11 shrink-0 rounded-xl"
                aria-label="Emojis"
                title="Emojis"
              >
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              className="p-0 border-0 bg-transparent shadow-none w-auto"
            >
              <div className="bg-popover rounded-lg border shadow-md overflow-hidden">
                <div className="flex border-b">
                  <button
                    type="button"
                    onClick={() => setPickerTab("emoji")}
                    className={`flex-1 py-2 text-xs font-semibold ${pickerTab === "emoji" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                  >
                    Emojis
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab("sticker")}
                    className={`flex-1 py-2 text-xs font-semibold ${pickerTab === "sticker" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                  >
                    Figurinhas
                  </button>
                </div>
                {pickerTab === "emoji" ? (
                  <EmojiPicker
                    onEmojiClick={(e) => setText((t) => t + e.emoji)}
                    emojiStyle={EmojiStyle.NATIVE}
                    theme={Theme.AUTO}
                    width={320}
                    height={380}
                    searchPlaceHolder="Buscar emoji…"
                    lazyLoadEmojis
                  />
                ) : (
                  <div className="grid grid-cols-5 gap-1 p-2 w-[320px] h-[380px] overflow-y-auto">
                    {STICKERS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendSticker(s)}
                        className="aspect-square text-4xl rounded-lg hover:bg-accent active:scale-95 transition flex items-center justify-center"
                        aria-label={`Enviar ${s}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            placeholder={`Mensagem para ${otherName}…`}
            rows={1}
            className="min-h-[44px] max-h-32 resize-none rounded-xl"
          />
          <Button
            onClick={send}
            disabled={sending || (!text.trim() && !file)}
            className="h-11 w-11 shrink-0 rounded-xl p-0"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteId
                ? "Esta mensagem será removida da conversa. Esta ação não pode ser desfeita."
                : `${selectedIds.size} mensagem${selectedIds.size > 1 ? "s" : ""} será${selectedIds.size > 1 ? "ão" : ""} removida${selectedIds.size > 1 ? "s" : ""}. Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                const ids = pendingDeleteId ? [pendingDeleteId] : Array.from(selectedIds);
                deleteIds(ids);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Apagando…" : "Sim, apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={forwardOpen}
        onOpenChange={(open) => {
          setForwardOpen(open);
          if (!open) {
            setForwardIds([]);
            setForwardQuery("");
          }
        }}
      >
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Forward className="h-4 w-4" />
              Encaminhar {forwardIds.length > 1 ? `${forwardIds.length} mensagens` : "mensagem"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione um contato da sua escola para encaminhar.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={forwardQuery}
                onChange={(e) => setForwardQuery(e.target.value)}
                placeholder="Buscar contato…"
                className="pl-8 h-9"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[55vh] overflow-y-auto px-2 pb-3">
            {forwardLoading && (
              <p className="text-center text-sm text-muted-foreground py-6">Carregando contatos…</p>
            )}
            {!forwardLoading && forwardContacts.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                Nenhum contato disponível.
              </p>
            )}
            {!forwardLoading &&
              forwardContacts
                .filter((c) =>
                  forwardQuery.trim()
                    ? (c.full_name ?? "").toLowerCase().includes(forwardQuery.trim().toLowerCase())
                    : true
                )
                .map((c) => (
                  <button
                    key={c.user_id}
                    type="button"
                    disabled={forwarding}
                    onClick={() => handleForward(c.user_id)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent text-left transition disabled:opacity-60"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold shrink-0">
                      {(c.full_name?.[0] ?? "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">
                        {c.full_name ?? "Sem nome"}
                      </span>
                      {c.role && (
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {c.role}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
