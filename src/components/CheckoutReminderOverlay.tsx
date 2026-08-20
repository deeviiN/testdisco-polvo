import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { QrCode, X, AlarmClock } from "lucide-react";

/**
 * Lembrete de checkout:
 *  - 5 min antes do fim do agendamento em uso: aviso único (bipe curto).
 *  - Após o fim, se ainda não houve checkout: alarme contínuo (sirene)
 *    que só para quando o usuário escaneia o QR ou descarta manualmente.
 */

type ActiveBooking = {
  id: string;
  end_time: string;
  booking_date: string;
  sector: string | null;
  topic: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type Mode = "pre" | "overdue";

const WARN_MIN = 5;
const PRE_DISMISS_KEY = "checkout_pre_dismissed_v1";

function loadPre(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PRE_DISMISS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function savePre(s: Set<string>) {
  try {
    localStorage.setItem(
      PRE_DISMISS_KEY,
      JSON.stringify(Array.from(s).slice(-200)),
    );
  } catch {
    /* noop */
  }
}

export function CheckoutReminderOverlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState<{ booking: ActiveBooking; mode: Mode } | null>(null);
  const [dismissedOverdue, setDismissedOverdue] = useState<Set<string>>(new Set());
  const preDismissed = useRef<Set<string>>(loadPre());
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // poll
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const today = () => new Date().toISOString().slice(0, 10);

    const tick = async () => {
      try {
        // Gate: garante sessão válida; se refresh falhar, redireciona pro login.
        const { ensureSessionOrRedirect, redirectOnAuthError } = await import("@/lib/authGuard");
        const ok = await ensureSessionOrRedirect();
        if (!ok || cancelled) return;


        const { data, error } = await supabase
          .from("bookings")
          .select("id, end_time, booking_date, sector, topic")
          .eq("user_id", user.id)
          .eq("booking_date", today())
          .eq("status", "confirmed");
        if (error) {
          await redirectOnAuthError(error);
          return;
        }
        if (!data || cancelled) return;

        const ids = (data as any[]).map((row) => row.id);
        if (ids.length === 0) return;

        const { data: usageRows, error: usageError } = await supabase
          .from("booking_usage")
          .select("booking_id, started_at, ended_at")
          .in("booking_id", ids);
        if (usageError) {
          await redirectOnAuthError(usageError);
          return;
        }

        const usageByBooking = new Map(
          ((usageRows ?? []) as any[]).map((usage) => [usage.booking_id, usage]),
        );



        const now = Date.now();
        const candidates: { booking: ActiveBooking; mode: Mode; endMs: number }[] = [];

        for (const row of data as any[]) {
          const usage = usageByBooking.get(row.id);
          const started_at = usage?.started_at ?? null;
          const ended_at = usage?.ended_at ?? null;
          if (!started_at || ended_at) continue;
          const endMs = new Date(`${row.booking_date}T${row.end_time}`).getTime();
          const minsLeft = (endMs - now) / 60000;

          const b: ActiveBooking = {
            id: row.id,
            end_time: row.end_time,
            booking_date: row.booking_date,
            sector: row.sector,
            topic: row.topic,
            started_at,
            ended_at,
          };

          if (minsLeft <= 0) {
            if (dismissedOverdue.has(b.id)) continue;
            candidates.push({ booking: b, mode: "overdue", endMs });
          } else if (minsLeft <= WARN_MIN) {
            if (preDismissed.current.has(b.id)) continue;
            candidates.push({ booking: b, mode: "pre", endMs });
          }
        }

        // prioriza overdue, depois o que termina mais cedo
        candidates.sort((a, b) => {
          if (a.mode !== b.mode) return a.mode === "overdue" ? -1 : 1;
          return a.endMs - b.endMs;
        });

        setActive((cur) => {
          const next = candidates[0]
            ? { booking: candidates[0].booking, mode: candidates[0].mode }
            : null;
          if (!next) return null;
          if (cur && cur.booking.id === next.booking.id && cur.mode === next.mode) return cur;
          return next;
        });
      } catch {
        /* noop */
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id, dismissedOverdue]);

  // áudio + vibração
  useEffect(() => {
    if (!active) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }

    let stopped = false;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = ctxRef.current ?? new Ctx();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const beep = (freq: number, duration = 0.2) => {
        if (stopped) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
      };

      let i = 0;
      let interval: number;
      let timeout: number | undefined;

      if (active.mode === "pre") {
        // sequência curta de aviso
        interval = window.setInterval(() => {
          beep(i % 2 === 0 ? 660 : 440, 0.18);
          i++;
        }, 320);
        timeout = window.setTimeout(() => window.clearInterval(interval), 4000);
        try {
          navigator.vibrate?.([200, 120, 200]);
        } catch {
          /* noop */
        }
      } else {
        // sirene contínua até dismiss
        interval = window.setInterval(() => {
          beep(i % 2 === 0 ? 920 : 520, 0.24);
          i++;
        }, 260);
        const vibLoop = window.setInterval(() => {
          try {
            navigator.vibrate?.([400, 150, 400, 150, 600]);
          } catch {
            /* noop */
          }
        }, 2500);
        stopRef.current = () => {
          stopped = true;
          window.clearInterval(interval);
          window.clearInterval(vibLoop);
        };
        return () => stopRef.current?.();
      }

      stopRef.current = () => {
        stopped = true;
        window.clearInterval(interval);
        if (timeout) window.clearTimeout(timeout);
      };
    } catch {
      /* noop */
    }

    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  const { booking, mode } = active;
  const isOverdue = mode === "overdue";

  const title = isOverdue
    ? "Faça o checkout agora!"
    : `Seu agendamento termina em até ${WARN_MIN} min`;
  const subtitle = isOverdue
    ? "O horário acabou e o ambiente ainda consta em uso. Escaneie o QR Code para liberar a sala."
    : "Quando terminar, escaneie o QR Code do ambiente para registrar a saída.";

  const dismiss = () => {
    if (isOverdue) {
      setDismissedOverdue((s) => new Set(s).add(booking.id));
    } else {
      preDismissed.current.add(booking.id);
      savePre(preDismissed.current);
    }
    setActive(null);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 booking-reminder-overlay">
      <div className="relative w-full max-w-md rounded-3xl bg-card text-card-foreground shadow-2xl overflow-hidden border-4 border-white/40">
        {isOverdue && (
          <div className="absolute inset-0 booking-reminder-siren pointer-events-none" />
        )}
        <div className="relative px-5 pt-5 pb-4 text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg animate-pulse">
            <AlarmClock className="h-7 w-7 text-red-600" />
          </div>
          <h2 className="text-xl font-extrabold leading-tight text-white drop-shadow">
            {title}
          </h2>
          {booking.topic && (
            <p className="mt-1 text-base font-semibold text-white/95 break-words">
              {booking.topic}
            </p>
          )}
          {booking.sector && (
            <p className="text-sm text-white/90 capitalize">{booking.sector}</p>
          )}
          <p className="text-sm text-white/90">
            Término às {booking.end_time?.slice(0, 5)}
          </p>
          <p className="mt-2 text-sm text-white/95 leading-snug">{subtitle}</p>
        </div>
        <div className="relative px-4 pb-4 flex flex-col gap-2">
          <Button
            className="h-14 w-full text-base font-bold bg-white text-red-700 hover:bg-white/90"
            onClick={() => {
              dismiss();
              navigate("/qr-scan");
            }}
          >
            <QrCode className="mr-2 h-5 w-5" />
            Escanear QR Code agora
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full text-white hover:bg-white/10"
            onClick={dismiss}
          >
            <X className="mr-2 h-4 w-4" />
            {isOverdue ? "Silenciar este alarme" : "Já vi, fechar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
