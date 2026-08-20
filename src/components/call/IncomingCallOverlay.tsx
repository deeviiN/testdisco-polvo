import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCall } from "./CallProvider";

export default function IncomingCallOverlay() {
  const { incoming, status, acceptIncoming, rejectIncoming } = useCall();
  const vibRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "incoming") return;
    const tick = () => {
      try {
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      } catch {}
    };
    tick();
    vibRef.current = window.setInterval(tick, 1500);
    return () => {
      if (vibRef.current) window.clearInterval(vibRef.current);
      try { (navigator as any).vibrate?.(0); } catch {}
    };
  }, [status]);

  if (status !== "incoming" || !incoming) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center gap-8 animate-in fade-in p-6">
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Chamada de {incoming.kind === "video" ? "vídeo" : "voz"} {incoming.mode === "group" ? "em grupo" : ""}
        </p>
        <div className="h-28 w-28 mx-auto rounded-full bg-primary/15 text-primary flex items-center justify-center text-4xl font-bold animate-pulse">
          {(incoming.fromName?.[0] ?? "?").toUpperCase()}
        </div>
        <h2 className="text-2xl font-bold break-words">{incoming.fromName}</h2>
        <p className="text-sm text-muted-foreground">está chamando…</p>
      </div>

      <div className="flex items-center gap-10">
        <Button
          onClick={rejectIncoming}
          className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg"
          aria-label="Recusar"
        >
          <PhoneOff className="h-7 w-7" />
        </Button>
        <Button
          onClick={acceptIncoming}
          className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg"
          aria-label="Atender"
        >
          {incoming.kind === "video" ? <VideoIcon className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
        </Button>
      </div>
    </div>
  );
}
