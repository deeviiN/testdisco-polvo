import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, ArrowLeft, Eye, EyeOff, Loader2, LogIn, Crown } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_ADMIN_EMAIL = "ebertyviana@hotmail.com";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validação de sessão existente:
  // Se o usuário já está logado e é admin, redireciona.
  // Se está logado mas não é admin, desloga para permitir login correto.
  useEffect(() => {
    let active = true;
    
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data?.user) return;
      
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      
      if (!active) return;

      if (isAdmin) {
        // Se tem sessão mas não é admin, não desloga automaticamente para evitar loops
        // apenas deixa o formulário carregar. O guard da rota cuidará do redirecionamento
        // se o usuário tentar acessar /admin/global sem permissão.
      }
    })();

    return () => { active = false; };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 4) {
      setError("Informe e-mail e senha");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr || !data.user) {
        setError("E-mail ou senha inválidos");
        setLoading(false);
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        await supabase.auth.signOut();
        setError("Esta conta não tem permissão de admin global");
        setLoading(false);
        return;
      }
      toast.success("Bem-vindo, admin global");
      navigate("/admin", { replace: true });
    } catch {
      setError("Erro ao entrar. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[hsl(220,50%,28%)] via-[hsl(260,45%,32%)] to-[hsl(280,55%,30%)] px-4 py-6 text-white">
      <section className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl p-6 shadow-2xl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg">
            <Crown className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Admin Global</h1>
          <p className="mt-1 text-xs leading-5 text-white/75">
            Login dedicado para o administrador da plataforma
          </p>

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-left text-[11px] leading-4 text-amber-100">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Sem vínculo de escola.</strong> Esta conta acessa o painel
              global e <em>não</em> aparece como gestor de nenhuma instituição.
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 w-full space-y-3 text-left">
            <div className="space-y-1">
              <Label className="text-xs text-white/80">E-mail do admin</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className="h-12 rounded-xl bg-white/15 border-white/20 text-white placeholder:text-white/50"
                placeholder="admin@exemplo.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/80">Senha</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="h-12 rounded-xl bg-white/15 border-white/20 pr-10 text-white placeholder:text-white/50"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/70 hover:text-white"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className={`h-14 w-full gap-2 rounded-xl font-bold backdrop-blur-sm border transition-all ${
                error
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-destructive"
                  : "bg-white/15 hover:bg-white/25 text-white border-white/20"
              }`}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogIn className="h-5 w-5" />
              )}
              {error ?? "Entrar como admin"}
            </Button>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => navigate("/reset-password")}
                className="text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
              >
                Esqueceu a senha? Clique aqui para redefinir
              </button>
            </div>
          </form>

          <p className="mt-4 text-[11px] text-white/60">
            Suporte: WhatsApp (11) 92568-6565
          </p>
        </div>
      </section>
    </main>
  );
}
