import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSectorLabels } from "@/hooks/useSectorLabels";

/**
 * Realtime: notifica TODOS os usuários da mesma escola quando alguém criar
 * um novo agendamento. O gestor recebe um destaque adicional.
 *
 * - Restrito à escola do usuário atual via filtro school_id.
 * - Ignora o próprio autor do agendamento (sem auto-notificação).
 * - Deduplica por id para evitar toasts repetidos.
 */
export function useSchoolBookingNotifications() {
  const { profile, user } = useAuth();
  const { getLabel } = useSectorLabels();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.school_id || !user?.id) return;

    const isManager =
      profile.role === "gestor_pedagogico" ||
      profile.role === "chef_projeto_vida" ||
      profile.role === "coord_pedagogico";

    const channelName = `school-bookings:${profile.school_id}:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `school_id=eq.${profile.school_id}`,
        },
        async (payload) => {
          const row = payload.new as {
            id?: string;
            user_id?: string;
            booking_date?: string;
            start_time?: string;
            end_time?: string;
            sector?: string;
            event_type?: string;
            topic?: string;
            description?: string;
          };
          if (!row.id || seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          if (row.user_id === user.id) return; // evitar auto-toast

          // Buscar nome do autor
          let authorName = "Alguém da escola";
          if (row.user_id) {
            const { data: p } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", row.user_id)
              .maybeSingle();
            if (p?.full_name) authorName = p.full_name;
          }

          const sectorLabel = row.sector ? getLabel(row.sector) : "Ambiente";
          const dateLabel = row.booking_date
            ? format(parseISO(row.booking_date), "dd 'de' MMM", { locale: ptBR })
            : "";
          const timeLabel = row.start_time?.slice(0, 5) ?? "";
          const summary = `${sectorLabel} · ${dateLabel} ${timeLabel}`;

          try {
            navigator.vibrate?.([60, 40, 60]);
          } catch {
            /* ignore */
          }

          if (isManager) {
            toast(`📅 Novo agendamento — ${authorName}`, {
              description: summary,
              duration: 9000,
            });
          } else {
            toast(`📌 ${authorName} agendou ${sectorLabel}`, {
              description: dateLabel + (timeLabel ? ` · ${timeLabel}` : ""),
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.school_id, profile?.role, user?.id, getLabel]);
}
