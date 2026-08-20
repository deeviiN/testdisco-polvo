import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Realtime: notifica gestores/chef quando um novo cadastro pendente chega
 * (profiles INSERT com is_approved=false na mesma escola).
 */
export function useGestorApprovalQueueNotifications() {
  const { profile, user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.school_id || !user?.id) return;
    const isManager =
      profile.role === "gestor_pedagogico" || profile.role === "chef_projeto_vida";
    if (!isManager) return;

    const channel = supabase
      .channel(`approval-queue:${profile.school_id}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profiles",
          filter: `school_id=eq.${profile.school_id}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            full_name?: string;
            intended_role?: string | null;
            is_approved?: boolean;
          };
          if (!row.id || seenRef.current.has(row.id)) return;
          if (row.is_approved) return;
          seenRef.current.add(row.id);
          try {
            navigator.vibrate?.([100, 60, 100]);
          } catch {
            /* ignore */
          }
          toast(`👤 Novo cadastro aguardando aprovação`, {
            description: row.full_name ?? "Verifique o painel de aprovações.",
            duration: 10000,
            action: {
              label: "Ver",
              onClick: () => {
                window.location.href = "/gestor/aprovacoes";
              },
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.school_id, profile?.role, user?.id]);
}
