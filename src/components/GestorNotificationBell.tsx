import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchoolMessagesUnread } from "@/hooks/useSchoolMessagesUnread";

type NotifRow = {
  id: string;
  title: string;
  body: string;
  is_read: boolean | null;
  is_pending: boolean;
  created_at: string | null;
  url: string | null;
  source: "notifications" | "inbox";
};

const FETCH_LIMIT = 20;

type Variant = "toolbar" | "amber";

function urlForInbox(type: string): string {
  if (type === "cadastro_pendente") return "/gestor/aprovacoes";
  if (type === "agendamento_pendente") return "/gestor/external-requests";
  if (type === "transferencia_escola") return "/gestor/transfer-requests";
  if (type === "mensagem_institucional") return "/gestor/inbox";
  return "/gestor/inbox";
}

export default function GestorNotificationBell({ variant = "toolbar" }: { variant?: Variant } = {}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotifRow[]>([]);
  const isManager =
    profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida";
  const { unread: schoolMsgUnread } = useSchoolMessagesUnread(isManager);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [notifRes, inboxRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("id,title,body,is_read,created_at,data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      profile?.school_id
        ? supabase
            .from("inbox_requests")
            .select("id,title,description,is_read,created_at,type,status")
            .eq("audience", "gestor")
            .eq("school_id", profile.school_id)
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const merged: NotifRow[] = [];
    for (const n of (notifRes.data ?? []) as any[]) {
      merged.push({
        id: `n:${n.id}`,
        title: n.title,
        body: n.body,
        is_read: n.is_read,
        is_pending: !n.is_read,
        created_at: n.created_at,
        url: n.data?.url ?? null,
        source: "notifications",
      });
    }
    for (const r of (inboxRes.data ?? []) as any[]) {
      if (r.status && r.status !== "pending" && r.status !== "in_progress") continue;
      merged.push({
        id: `i:${r.id}`,
        title: r.title,
        body: r.description ?? "",
        is_read: r.is_read,
        is_pending: r.status === "pending" || r.status === "in_progress",
        created_at: r.created_at,
        url: urlForInbox(r.type),
        source: "inbox",
      });
    }
    merged.sort((a, b) => (a.created_at && b.created_at ? (a.created_at < b.created_at ? 1 : -1) : 0));
    setItems(merged.slice(0, FETCH_LIMIT));
  }, [user?.id, profile?.school_id]);

  useEffect(() => {
    if (!isManager || !user?.id) return;
    load();
    const channel = supabase
      .channel(`bell-notifs:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_requests" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isManager, user?.id, load]);

  if (!isManager) return null;

  // Badge count = ações pendentes + comunicados não lidos na caixa da escola
  const unread = items.filter((i) => i.is_pending).length + (schoolMsgUnread ?? 0);

  const handleOpen = async (n: NotifRow) => {
    if (!n.is_read) {
      const rawId = n.id.slice(2);
      if (n.source === "notifications") {
        await supabase.from("notifications").update({ is_read: true }).eq("id", rawId);
      } else {
        await supabase.from("inbox_requests").update({ is_read: true }).eq("id", rawId);
      }
    }
    if (n.url) navigate(n.url);
  };

  const markAllRead = async () => {
    if (!user?.id || unread === 0) return;
    const notifIds = items.filter((i) => !i.is_read && i.source === "notifications").map((i) => i.id.slice(2));
    const inboxIds = items.filter((i) => !i.is_read && i.source === "inbox").map((i) => i.id.slice(2));
    await Promise.all([
      notifIds.length
        ? supabase.from("notifications").update({ is_read: true }).in("id", notifIds)
        : Promise.resolve(),
      inboxIds.length
        ? supabase.from("inbox_requests").update({ is_read: true }).in("id", inboxIds)
        : Promise.resolve(),
    ]);
    load();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "amber" ? (
          <button
            type="button"
            aria-label="Notificações"
            title="Notificações"
            className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 border-amber-200/70 flex items-center justify-center text-white shadow-lg transition-transform hover:scale-[1.04] overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(45, 95%, 55%), hsl(35, 90%, 42%))",
              boxShadow: "0 0 10px hsla(45, 95%, 60%, 0.55), inset 0 0 8px hsla(45, 100%, 85%, 0.35)",
            }}
          >
            <Bell
              className="h-6 w-6 sm:h-7 sm:w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
              strokeWidth={3}
            />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse ring-2 ring-amber-900">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            title="Notificações"
            className="relative rounded-lg h-8 w-8 shrink-0 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100 transition-all border border-emerald-500/20"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse ring-2 ring-black/40">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-24px)] p-0 overflow-hidden rounded-2xl border-border/60 shadow-2xl"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <DropdownMenuLabel className="px-0 py-0 text-sm font-semibold">
            Notificações
          </DropdownMenuLabel>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-primary hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Você não tem notificações.
            </div>
          )}
          {items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => handleOpen(n)}
              className={`flex flex-col items-start gap-0.5 rounded-none px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-0 ${
                n.is_pending ? "bg-primary/5" : ""
              }`}
            >
              <p className="text-xs font-semibold text-foreground break-words whitespace-normal">
                {n.title}
              </p>
              {n.body && (
                <p className="text-[11px] text-muted-foreground break-words whitespace-normal">
                  {n.body}
                </p>
              )}
              {n.created_at && (
                <p className="text-[10px] text-muted-foreground/70">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </p>
              )}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
