import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Realtime: avisa o gestor quando o admin assina o contrato e devolve.
 * Lê a tabela `notifications` filtrada pelo user_id do gestor logado e dispara
 * um toast clicável que leva direto à etapa de contrato em /subscription.
 */
export function useGestorContractNotifications() {
  const { user, profile } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !profile?.role) return;
    const isManager =
      profile.role === "gestor_pedagogico" || profile.role === "chef_projeto_vida";
    if (!isManager) return;

    const channel = supabase
      .channel(`gestor-notifs:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            title?: string;
            body?: string;
            data?: { type?: string; url?: string } | null;
          };
          if (!row.id || seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          if (row.data?.type !== "contract_admin_signed") return;
          try {
            navigator.vibrate?.([100, 60, 100]);
          } catch {
            /* ignore */
          }
          toast(row.title ?? "📄 Contrato assinado pelo administrador", {
            description: row.body ?? "Toque para baixar, assinar e finalizar.",
            duration: 12000,
            action: {
              label: "Abrir contrato",
              onClick: () => {
                const url = row.data?.url ?? "/subscription?step=contract";
                window.location.assign(url);
              },
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.role]);
}
