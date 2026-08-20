import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const SCHOOL_MESSAGES_LAST_SEEN_PREFIX = "school_messages_last_seen:";
const lsKey = (userId: string) => `${SCHOOL_MESSAGES_LAST_SEEN_PREFIX}${userId}`;

export function getStoredLastSeen(userId: string | null | undefined): string {
  if (!userId) return new Date(0).toISOString();
  return localStorage.getItem(lsKey(userId)) ?? new Date(0).toISOString();
}

export function useSchoolMessagesUnread(enabled: boolean = true) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const getLastSeen = useCallback((): string => {
    if (!user?.id) return new Date(0).toISOString();
    return localStorage.getItem(lsKey(user.id)) ?? new Date(0).toISOString();
  }, [user?.id]);

  const refresh = useCallback(async (sid: string | null) => {
    if (!sid || !user?.id) return;
    const lastSeen = getLastSeen();
    const { count } = await supabase
      .from("school_messages")
      .select("id", { count: "exact", head: true })
      .eq("school_id", sid)
      .neq("sender_user_id", user.id)
      .gt("created_at", lastSeen);
    setUnread(count ?? 0);
  }, [user?.id, getLastSeen]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancel || !data?.school_id) return;
      setSchoolId(data.school_id);
      refresh(data.school_id);
    })();
    return () => { cancel = true; };
  }, [enabled, user?.id, refresh]);

  useEffect(() => {
    if (!enabled || !schoolId || !user?.id) return;
    const channel = supabase
      .channel(`school_messages_unread:${schoolId}:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "school_messages", filter: `school_id=eq.${schoolId}` },
        (payload) => {
          const row = payload.new as { sender_user_id: string; created_at: string };
          if (row.sender_user_id === user.id) return;
          if (row.created_at > getLastSeen()) setUnread((n) => n + 1);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, schoolId, user?.id, getLastSeen]);

  const markAllSeen = useCallback(() => {
    if (!user?.id) return;
    localStorage.setItem(lsKey(user.id), new Date().toISOString());
    setUnread(0);
  }, [user?.id]);

  const markSeenUpTo = useCallback((iso: string) => {
    if (!user?.id || !iso) return;
    const current = getLastSeen();
    if (iso <= current) return;
    localStorage.setItem(lsKey(user.id), iso);
    if (schoolId) refresh(schoolId);
  }, [user?.id, getLastSeen, schoolId, refresh]);

  return { unread, markAllSeen, markSeenUpTo };
}
