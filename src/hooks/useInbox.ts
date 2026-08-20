import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type InboxAudience = "admin" | "gestor" | "user";

export type InboxItem = {
  id: string;
  audience: InboxAudience;
  type: string;
  status: "pending" | "in_progress" | "resolved" | "rejected" | "info";
  school_id: string | null;
  requester_user_id: string | null;
  target_user_id: string | null;
  title: string;
  description: string | null;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  resolved_at: string | null;
};

const FETCH_LIMIT = 200;

export function useInbox(audience: InboxAudience, enabled: boolean = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const lastIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const { data } = await supabase
      .from("inbox_requests")
      .select("*")
      .eq("audience", audience)
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);
    const rows = (data ?? []) as InboxItem[];
    setItems(rows);
    lastIdsRef.current = new Set(rows.map((r) => r.id));
    setLoading(false);
  }, [audience, enabled]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    load();
    const channel = supabase
      .channel(`inbox:${audience}:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_requests" },
        (payload) => {
          const row = (payload.new ?? payload.old) as InboxItem | undefined;
          if (!row || row.audience !== audience) return;
          if (payload.eventType === "INSERT" && !lastIdsRef.current.has(row.id)) {
            toast.info(row.title, { description: row.description ?? undefined });
          }
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [audience, enabled, user?.id, load]);

  const unreadCount = useMemo(() => items.filter((i) => !i.is_read).length, [items]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("inbox_requests").update({ is_read: true }).eq("id", id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
  }, []);

  const markAllRead = useCallback(async () => {
    const ids = items.filter((i) => !i.is_read).map((i) => i.id);
    if (!ids.length) return;
    await supabase.from("inbox_requests").update({ is_read: true }).in("id", ids);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
  }, [items]);

  const setStatus = useCallback(
    async (id: string, status: InboxItem["status"]) => {
      const patch: { status: string; is_read: boolean; resolved_at?: string } = { status, is_read: true };
      if (status === "resolved" || status === "rejected") {
        patch.resolved_at = new Date().toISOString();
      }
      await supabase.from("inbox_requests").update(patch).eq("id", id);
      load();
    },
    [load]
  );

  return { items, loading, unreadCount, reload: load, markRead, markAllRead, setStatus };
}
