import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushStatus = "unsupported" | "denied" | "default" | "granted-unsubscribed" | "subscribed";

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      setEndpoint(sub.endpoint);
      setStatus("subscribed");
    } else {
      setEndpoint(null);
      setStatus(Notification.permission === "granted" ? "granted-unsubscribed" : "default");
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!supported) throw new Error("Seu navegador não suporta notificações push.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permissão de notificação negada.");

      // Busca chave VAPID pública
      const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-vapid-public-key");
      if (keyErr) throw keyErr;
      const publicKey = (keyData as { publicKey?: string })?.publicKey;
      if (!publicKey) throw new Error("Chave VAPID pública não configurada no servidor.");

      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.ready);
      if (!reg) throw new Error("Service Worker não registrado.");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!p256dh || !auth) throw new Error("Assinatura push inválida (sem chaves).");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Você precisa estar logado.");

      const { error: upErr } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (upErr) throw upErr;

      setEndpoint(sub.endpoint);
      setStatus("subscribed");
    } catch (e: any) {
      setError(String(e?.message || e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setStatus("granted-unsubscribed");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, endpoint, loading, error, supported, subscribe, unsubscribe, refresh };
}
