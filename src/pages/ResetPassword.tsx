import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, CheckCircle } from "lucide-react";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check both hash and search params for recovery type
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (hash.includes("type=recovery") || searchParams.get("type") === "recovery") {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Informe seu e-mail");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password?type=recovery`,
    });
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("E-mail de recuperação enviado!");
      setRequestSent(true);
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha atualizada com sucesso!");
      // Determine destination based on email domain or logic
      // Since it's the global admin, redirect to admin login
      navigate("/admin/login");
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden rounded-3xl">
          <div className="h-2 gradient-primary w-full" />
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-2">
                <KeyRound className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Recuperar Senha</h1>
              <p className="text-muted-foreground text-sm">
                {requestSent 
                  ? "Verifique sua caixa de entrada para continuar." 
                  : "Enviaremos um link de acesso para o seu e-mail."}
              </p>
            </div>

            {requestSent ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400 text-sm text-center font-medium">
                  E-mail enviado para: <br/>
                  <span className="font-bold">{email}</span>
                </div>
                <Button onClick={() => navigate("/admin/login")} variant="outline" className="w-full h-12 rounded-xl">
                  Voltar ao Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    E-mail cadastrado
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl bg-secondary/50 border-0 focus-visible:ring-primary"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold shadow-glow border-0"
                >
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </Button>
                <Button 
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(-1)} 
                  className="w-full h-12 rounded-xl text-muted-foreground"
                >
                  Cancelar
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-background relative overflow-hidden px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full gradient-primary opacity-[0.07] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full gradient-accent opacity-[0.07] blur-3xl" />
      </div>

      <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary shadow-glow">
            <KeyRound className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold font-display text-foreground">Nova senha</h1>
          <p className="text-muted-foreground text-sm">Defina sua nova senha abaixo</p>
        </div>

        <Card className="shadow-card-hover border-0 backdrop-blur-sm bg-card/95">
          <div className="h-1 gradient-hero w-full" />
          <CardContent className="p-6 pt-8">
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nova senha
                </Label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="h-12 rounded-xl bg-secondary/50 border-0"
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirmar senha
                </Label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="h-12 rounded-xl bg-secondary/50 border-0"
                  minLength={6}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow border-0 gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {loading ? "Atualizando..." : "Atualizar senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
