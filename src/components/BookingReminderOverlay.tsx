import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useBookingReminders } from "@/hooks/useBookingReminders";
import { Button } from "@/components/ui/button";
import { QrCode, X, Bell } from "lucide-react";

/**
 * Overlay tela cheia + sirene azul/vermelha + bipes,
 * disparado quando faltam 60/45/30/15/10/5 min para o agendamento do usuário.
 */
export function BookingReminderOverlay() {
  const { current, dismiss } = useBookingReminders();
  const navigate = useNavigate();
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!current) {
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

      const beep = (freq: number, duration = 0.18) => {
        if (stopped) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
      };

      // padrão de sirene: hi-lo repetido por ~12s
      let i = 0;
      const interval = window.setInterval(() => {
        beep(i % 2 === 0 ? 880 : 520, 0.22);
        i++;
      }, 280);

      const timeout = window.setTimeout(() => {
        window.clearInterval(interval);
      }, 12_000);

      // vibração no celular
      if ("vibrate" in navigator) {
        try {
          navigator.vibrate([300, 150, 300, 150, 600]);
        } catch {
          /* noop */
        }
      }

      stopRef.current = () => {
        stopped = true;
        window.clearInterval(interval);
        window.clearTimeout(timeout);
      };
    } catch {
      /* noop */
    }

    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [current]);

  if (!current) return null;

  const min = current.minutes_before;
  const title =
    min >= 60
      ? "Falta 1 hora para o seu agendamento"
      : `Faltam ${min} minutos para o seu agendamento`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 booking-reminder-overlay">
      <div className="relative w-full max-w-md rounded-3xl bg-card text-card-foreground shadow-2xl overflow-hidden border-4 border-white/40">
        <div className="absolute inset-0 booking-reminder-siren pointer-events-none" />
        <div className="relative px-5 pt-5 pb-4 text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg animate-pulse">
            <Bell className="h-7 w-7 text-red-600" />
          </div>
          <h2 className="text-xl font-extrabold leading-tight text-white drop-shadow">
            {title}
          </h2>
          {current.topic && (
            <p className="mt-1 text-base font-semibold text-white/95 break-words">
              {current.topic}
            </p>
          )}
          {current.sector && (
            <p className="text-sm text-white/90 capitalize">{current.sector}</p>
          )}
          <p className="mt-2 text-sm text-white/95 leading-snug">
            Não esqueça de escanear o QR Code do ambiente para registrar o seu
            check-in.
          </p>
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
            Já vi, fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
