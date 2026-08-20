import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

const STORAGE_KEY = "app_access_granted_v1";
const PUBLIC_TV_PATHS = new Set(["/tv", "/painel-tv", "/tv-professores", "/diagnostico"]);

function isPublicTvRoute() {
  try {
    return PUBLIC_TV_PATHS.has(window.location.pathname);
  } catch {
    return false;
  }
}

const AppAccessGate = ({ children }: { children: React.ReactNode }) => {
  const bypassGate = isPublicTvRoute();
  const [granted, setGranted] = useState<boolean>(() => {
    if (isPublicTvRoute()) return true;
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (granted || bypassGate) return;
    // Bloqueia scroll do body enquanto gate ativo
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [granted]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "verify-access-password",
        { body: { password: password.trim() } }
      );
      if (fnError || !data?.valid) {
        setError("Senha incorreta");
        setLoading(false);
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {}
      setGranted(true);
    } catch {
      setError("Não foi possível validar agora. Tente novamente.");
      setLoading(false);
    }
  };

  if (granted || bypassGate) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center px-5 py-8 overflow-y-auto"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, hsl(220, 55%, 34%) 0%, hsl(220, 55%, 22%) 55%, hsl(222, 60%, 14%) 100%)",
      }}
    >
      {/* ornamental orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(circle, hsl(45, 90%, 60%) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, hsl(220, 90%, 65%) 0%, transparent 70%)" }}
      />

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-[28px] p-[1px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        style={{
          background:
            "linear-gradient(140deg, hsla(45, 90%, 65%, 0.55), hsla(0,0%,100%,0.06) 40%, hsla(220,80%,70%,0.35))",
        }}
      >
        <div
          className="rounded-[27px] px-6 pt-7 pb-6 backdrop-blur-2xl"
          style={{
            background:
              "linear-gradient(160deg, hsla(220, 45%, 22%, 0.85), hsla(222, 55%, 14%, 0.9))",
          }}
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div
              className="relative w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(145deg, hsl(45, 90%, 62%), hsl(38, 85%, 48%))",
                boxShadow:
                  "0 10px 30px -8px hsla(45, 90%, 55%, 0.55), inset 0 1px 0 hsla(0,0%,100%,0.4)",
              }}
            >
              <Lock className="w-7 h-7" style={{ color: "hsl(222, 60%, 14%)" }} strokeWidth={2.5} />
            </div>

            <p
              className="text-[10px] font-semibold uppercase tracking-[0.35em] mb-1"
              style={{ color: "hsla(45, 90%, 70%, 0.9)" }}
            >
              Área privada
            </p>
            <h1
              className="text-white text-2xl font-bold leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.01em" }}
            >
              Acesso restrito
            </h1>

            <div className="flex items-center gap-2 mt-3 w-full max-w-[180px] mx-auto">
              <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: "hsl(45, 90%, 62%)" }}
              />
              <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </div>

            <p className="text-white/65 text-sm mt-3 leading-relaxed">
              Informe a senha de acesso para continuar
            </p>
          </div>

          <label
            className="block text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-2 pl-1"
          >
            Senha
          </label>
          <PasswordInput
            autoFocus
            inputMode="text"
            autoComplete="off"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="••••••••"
            className={`h-13 min-h-[52px] rounded-2xl px-4 bg-white/[0.07] text-white placeholder:text-white/35 tracking-widest text-base border outline-none focus-visible:ring-0 transition-all ${
              error
                ? "border-red-400/60 focus:border-red-400"
                : "border-white/15 focus:border-amber-300/70"
            }`}
            toggleClassName="text-white/60 hover:text-white hover:bg-white/10"
          />

          {error && (
            <p className="text-xs text-red-300 mt-2 text-center font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || password.trim().length < 4}
            className="mt-5 w-full h-14 rounded-2xl font-bold text-[15px] tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(145deg, hsl(45, 92%, 62%) 0%, hsl(38, 88%, 50%) 100%)",
              color: "hsl(222, 60%, 12%)",
              boxShadow:
                "0 14px 30px -10px hsla(38, 88%, 45%, 0.6), inset 0 1px 0 hsla(0,0%,100%,0.45)",
            }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>Entrar</>
            )}
          </button>

          <p className="text-center text-[11px] text-white/40 mt-5 tracking-wide">
            Agendamento de Ambiente Escolar
          </p>
        </div>
      </form>
    </div>
  );
};

export default AppAccessGate;
