import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BookingReminder = {
  booking_id: string;
  user_id: string;
  school_id: string | null;
  sector: string | null;
  topic: string | null;
  booking_date: string;
  start_time: string;
  minutes_before: number;
  minutes_left: number;
};

const STORAGE_KEY = "booking_reminders_fired_v1";

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveFired(set: Set<string>) {
  try {
    // limita a 500 entradas pra não crescer infinito
    const arr = Array.from(set).slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* noop */
  }
}

/**
 * Faz polling a cada 60s buscando agendamentos do usuário que precisam
 * disparar lembrete (60/45/30/15/10/5 min antes do início).
 * Deduplica por (booking_id + minutes_before) tanto em localStorage quanto
 * em uma tabela do servidor (canal='inapp').
 */
export function useBookingReminders() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<BookingReminder | null>(null);
  const firedRef = useRef<Set<string>>(loadFired());
  const queueRef = useRef<BookingReminder[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const tick = async () => {
      try {
        // Gate: garante sessão válida; se refresh falhar, redireciona pro login.
        const { ensureSessionOrRedirect, redirectOnAuthError } = await import("@/lib/authGuard");
        const ok = await ensureSessionOrRedirect();
        if (!ok || cancelled) return;


        const { data, error } = await supabase.rpc("get_pending_booking_reminders");
        if (error) {
          await redirectOnAuthError(error);
          return;
        }
        if (!data || cancelled) return;



        for (const r of data as BookingReminder[]) {
          const key = `${r.booking_id}:${r.minutes_before}`;
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          saveFired(firedRef.current);

          // marca no servidor (dedupe entre dispositivos)
          supabase
            .from("booking_reminders_sent")
            .insert({
              booking_id: r.booking_id,
              user_id: user.id,
              minutes_before: r.minutes_before,
              channel: "inapp",
            })
            .then(() => {});

          queueRef.current.push(r);
        }

        // se nada na tela, mostra próximo da fila
        setCurrent((cur) => cur ?? queueRef.current.shift() ?? null);
      } catch {
        /* noop */
      }
    };

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id]);

  const dismiss = () => {
    setCurrent(queueRef.current.shift() ?? null);
  };

  return { current, dismiss };
}
