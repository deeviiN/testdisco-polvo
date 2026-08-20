import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  subtitle?: string;
}

export default function AssistenteHeader({ subtitle }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [schoolName, setSchoolName] = useState<string>("");
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(() => {
    try {
      return !!(window as unknown as { __appUpdateAvailable?: boolean }).__appUpdateAvailable;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!profile?.school_id) return;
    supabase
      .from("schools")
      .select("name, logo_url")
      .eq("id", profile.school_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSchoolName(data.name);
          setSchoolLogo((data as any).logo_url || null);
        }
      });
  }, [profile?.school_id]);

  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true);
    window.addEventListener("app:update-available", onUpdate);
    return () => window.removeEventListener("app:update-available", onUpdate);
  }, []);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setUpdateAvailable(false);
    try { (window as unknown as { __appUpdateAvailable?: boolean }).__appUpdateAvailable = false; } catch {}
    try {
      const force = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
      if (force) {
        await force();
      } else {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <header className="bg-[hsl(220,50%,28%)] text-white px-3 pt-3 pb-3 shadow-md">
      {/* linha 1: escola + voltar/atualizar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="p-2 -ml-1 rounded-full hover:bg-white/10 active:scale-95 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {schoolLogo ? (
          <img
            src={schoolLogo}
            alt=""
            className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30 flex-shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-white/15 ring-2 ring-white/30 flex-shrink-0" />
        )}

        <h2 className="flex-1 min-w-0 text-sm font-bold leading-tight truncate">
          {schoolName || "Carregando..."}
        </h2>

        {/* Botão Atualizar — pisca vermelho (luz de polícia) quando há atualização */}
        <button
          onClick={refresh}
          aria-label="Atualizar"
          disabled={refreshing}
          className={`relative overflow-hidden flex items-center gap-1.5 h-10 px-3 rounded-full font-black text-xs active:scale-95 transition ${
            updateAvailable
              ? "text-white ring-2 ring-red-300/70"
              : "bg-white/10 hover:bg-white/20 border border-white/20"
          }`}
          style={
            updateAvailable
              ? {
                  background: "linear-gradient(135deg, hsl(0,85%,45%), hsl(355,80%,55%))",
                  boxShadow: "0 0 12px hsla(0,90%,55%,0.7), 0 0 24px hsla(0,90%,55%,0.5)",
                  animation: "assistPolice 1.1s ease-in-out infinite",
                }
              : undefined
          }
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span>Atualizar</span>
          {updateAvailable && (
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 20% 50%, hsla(220,90%,60%,0.6), transparent 55%)",
                animation: "assistPoliceBlue 1.1s ease-in-out infinite",
                mixBlendMode: "screen",
              }}
            />
          )}
        </button>

        <style>{`
          @keyframes assistPolice {
            0%, 100% { box-shadow: 0 0 12px hsla(0,90%,55%,0.7), 0 0 24px hsla(0,90%,55%,0.5); }
            50%      { box-shadow: 0 0 22px hsla(0,90%,60%,1), 0 0 44px hsla(0,90%,55%,0.85); }
          }
          @keyframes assistPoliceBlue {
            0%, 49%   { opacity: 0; }
            50%, 100% { opacity: 1; }
          }
        `}</style>
      </div>

      {/* linha 2: identificação do painel + nome */}
      <div className="mt-2 px-1">
        <p className="text-[10px] uppercase tracking-widest font-black text-white drop-shadow-sm">
          Painel Assistente de Aluno
        </p>
        <p className="text-base font-black leading-tight break-words">
          {profile?.full_name || "—"}
        </p>
        {subtitle && (
          <p className="text-xs opacity-80 mt-0.5 break-words">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
