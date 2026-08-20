import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, AlertTriangle, Sparkles, Wrench, Globe, MapPin, Building2, School as SchoolIcon } from "lucide-react";

type BroadcastMessage = {
  id: string;
  scope: "global" | "state" | "city" | "school";
  state: string | null;
  city: string | null;
  title: string;
  body: string;
  kind: "info" | "alert" | "update" | "maintenance";
  action_label: string | null;
  action_url: string | null;
  created_at: string;
};

const KIND_META: Record<
  BroadcastMessage["kind"],
  { label: string; icon: React.ElementType; accent: string; ring: string; glow: string }
> = {
  info: { label: "Comunicado", icon: Megaphone, accent: "text-amber-300", ring: "border-amber-300/60", glow: "rgba(251,191,36,0.6)" },
  alert: { label: "Aviso importante", icon: AlertTriangle, accent: "text-red-300", ring: "border-red-300/60", glow: "rgba(248,113,113,0.6)" },
  update: { label: "Novidade do app", icon: Sparkles, accent: "text-emerald-300", ring: "border-emerald-300/60", glow: "rgba(52,211,153,0.6)" },
  maintenance: { label: "Manutenção", icon: Wrench, accent: "text-sky-300", ring: "border-sky-300/60", glow: "rgba(56,189,248,0.6)" },
};

const SCOPE_META: Record<BroadcastMessage["scope"], { label: string; icon: React.ElementType }> = {
  global: { label: "Brasil", icon: Globe },
  state: { label: "Estado", icon: MapPin },
  city: { label: "Município", icon: Building2 },
  school: { label: "Sua escola", icon: SchoolIcon },
};

export function BroadcastOverlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<BroadcastMessage[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const [{ data: msgs }, { data: reads }] = await Promise.all([
      (supabase as any)
        .from("broadcast_messages")
        .select("id, scope, state, city, title, body, kind, action_label, action_url, created_at, expires_at")
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(10),
      (supabase as any).from("broadcast_reads").select("message_id").eq("user_id", user.id),
    ]);
    const readIds = new Set((reads ?? []).map((r: any) => r.message_id));
    setQueue(((msgs ?? []) as any[]).filter((m) => !readIds.has(m.id)) as BroadcastMessage[]);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("broadcast-messages-overlay")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "broadcast_messages" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const current = queue[0];
  if (!current) return null;

  const kind = KIND_META[current.kind] ?? KIND_META.info;
  const scope = SCOPE_META[current.scope] ?? SCOPE_META.global;
  const KindIcon = kind.icon;
  const ScopeIcon = scope.icon;

  const dismiss = async (goToAction = false) => {
    const id = current.id;
    setQueue((q) => q.filter((m) => m.id !== id));
    if (user) {
      await (supabase as any).from("broadcast_reads").insert({ message_id: id, user_id: user.id });
    }
    if (goToAction && current.action_url) {
      if (/^https?:\/\//i.test(current.action_url)) window.open(current.action_url, "_blank");
      else navigate(current.action_url);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-md rounded-3xl overflow-hidden border-4 ${kind.ring} bg-gradient-to-br from-[#0A2A66] via-[#0B3D7A] to-[#08205A]`}
        style={{ boxShadow: `0 0 60px ${kind.glow}` }}
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 animate-pulse" />
        <div className="px-6 pt-7 pb-5 text-center text-white">
          <div
            className={`mx-auto mb-3 h-16 w-16 rounded-full bg-white/10 border-2 ${kind.ring} flex items-center justify-center animate-pulse`}
            style={{ boxShadow: `0 0 24px ${kind.glow}` }}
          >
            <KindIcon className={`h-8 w-8 ${kind.accent}`} />
          </div>
          <p className={`text-xs uppercase tracking-[0.25em] font-black ${kind.accent}`}>{kind.label}</p>
          <h2 className="mt-2 text-2xl font-black leading-tight text-wrap break-words">{current.title}</h2>
          <p className="mt-3 text-base text-white/90 leading-snug whitespace-pre-line text-wrap break-words">
            {current.body}
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs font-bold text-white/80">
            <ScopeIcon className="h-3.5 w-3.5" />
            {scope.label}
            {current.scope === "state" && current.state ? ` · ${current.state}` : ""}
            {current.scope === "city" && current.city ? ` · ${current.city}` : ""}
          </div>
        </div>
        <div className="px-4 pb-5 space-y-2">
          {current.action_url && (
            <button
              onClick={() => void dismiss(true)}
              className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-[#0A2A66] font-black text-lg shadow-[0_6px_20px_rgba(251,191,36,0.6)] active:scale-[0.98] transition"
            >
              {current.action_label || "Ver agora"}
            </button>
          )}
          <button
            onClick={() => void dismiss(false)}
            className={`w-full h-14 rounded-2xl font-black text-lg active:scale-[0.98] transition ${
              current.action_url
                ? "bg-white/10 border border-white/25 text-white"
                : "bg-gradient-to-b from-amber-300 to-amber-500 text-[#0A2A66] shadow-[0_6px_20px_rgba(251,191,36,0.6)]"
            }`}
          >
            Entendi
          </button>
          {queue.length > 1 && (
            <p className="text-center text-xs text-white/60 font-semibold">
              +{queue.length - 1} aviso(s) na fila
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default BroadcastOverlay;
