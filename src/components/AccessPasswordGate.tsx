import { ReactNode, useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

const STORAGE_KEY = "app_access_granted_v1";
const KEEP_KEY = "app_access_keep_v1";

type Props = { children: ReactNode };

export default function AccessPasswordGate({ children }: Props) {
  // Usa localStorage: uma vez liberado, o dispositivo permanece liberado
  // até o usuário deslogar (signOut limpa essa chave).
  const [granted, setGranted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1"
          || sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepConnected, setKeepConnected] = useState<boolean>(() => {
    try { return localStorage.getItem(KEEP_KEY) !== "0"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEEP_KEY, keepConnected ? "1" : "0"); } catch { /* noop */ }
    if (granted) {
      try {
        if (keepConnected) {
          localStorage.setItem(STORAGE_KEY, "1");
          sessionStorage.setItem(STORAGE_KEY, "1");
        } else {
          localStorage.removeItem(STORAGE_KEY);
          sessionStorage.setItem(STORAGE_KEY, "1");
        }
      } catch { /* noop */ }
    }
  }, [granted, keepConnected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim().length < 4) {
      setError("Senha muito curta");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("verify-access-password", {
        body: { password: password.trim() },
      });
      if (invokeError || !data?.valid) {
        setError("Senha incorreta");
        setLoading(false);
        return;
      }
      setGranted(true);
    } catch {
      setError("Erro ao verificar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Bypass público para rotas de preview de UI (sem dados sensíveis)
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/preview/")) {
    return <>{children}</>;
  }

  if (granted) return <>{children}</>;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-6 text-foreground">
      <section className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Este aplicativo está em fase de lançamento. Digite a senha de acesso para continuar.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 w-full space-y-3">
            <PasswordInput
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Senha de acesso"
              className="h-12 rounded-xl bg-secondary/50 border-0 text-center text-base"
              autoFocus
              disabled={loading}
              autoComplete="off"
            />
            <Button
              type="submit"
              size="lg"
              disabled={loading || password.length < 4}
              className={`h-14 w-full gap-2 font-bold ${error ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              {error ?? "Entrar"}
            </Button>

            <label className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepConnected}
                onChange={(e) => setKeepConnected(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
                disabled={loading}
              />
              Manter-me conectado neste dispositivo
            </label>
          </form>

          <p className="mt-4 text-[11px] text-muted-foreground">
            Suporte: WhatsApp (11) 92568-6565
          </p>
        </div>
      </section>
    </main>
  );
}
