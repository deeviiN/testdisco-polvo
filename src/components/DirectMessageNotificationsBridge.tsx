import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type DMRow = {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  content: string;
  created_at: string;
};

function previewOf(content: string): string {
  // Detecta anexo [anexo](url)(name) e mostra label
  const m = content.match(/^\[anexo\]\((.+?)\)\((.+?)\)/);
  if (m) return `📎 ${m[2]}`;
  return content.length > 80 ? content.slice(0, 80) + "…" : content;
}

function playBeep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* ignore */
  }
}

function vibrate() {
  try {
    navigator.vibrate?.([80, 50, 80, 50, 120]);
  } catch {
    /* ignore */
  }
}

async function showSystemNotification(title: string, body: string, onClickUrl: string) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "dm-" + onClickUrl,
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      window.location.href = onClickUrl;
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export default function DirectMessageNotificationsBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const seenRef = useRef<Set<string>>(new Set());
  const [flashing, setFlashing] = useState(false);

  // Pede permissão de notificação assim que houver usuário (silenciosamente).
  useEffect(() => {
    if (!user?.id) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`dm-notify:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as DMRow;
          if (!row?.id || seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          if (row.sender_id === user.id) return;

          // Se estou na conversa com esse remetente, não duplica alerta global.
          const inThisThread =
            location.pathname === `/dm/${row.sender_id}` && document.visibilityState === "visible";
          if (inThisThread) return;

          const senderName = row.sender_name || "Mensagem";
          const preview = previewOf(row.content);
          const url = `/dm/${row.sender_id}?name=${encodeURIComponent(senderName)}`;

          vibrate();
          playBeep();
          setFlashing(true);
          window.setTimeout(() => setFlashing(false), 2400);

          showSystemNotification(`💬 ${senderName}`, preview, url);

          toast.message(`💬 ${senderName}`, {
            description: preview,
            duration: 8000,
            action: {
              label: "Abrir",
              onClick: () => navigate(url),
            },
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, location.pathname]);

  if (!flashing) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] dm-flash-overlay"
    />
  );
}
