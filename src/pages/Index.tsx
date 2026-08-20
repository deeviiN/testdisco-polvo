import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Loader2, XCircle, LogOut, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { useSupportContact } from "@/hooks/useSupportContact";
import {
  type RoleKey,
  getRoleConfig,
  getCommonStrings,
  buildSupportMessage,
} from "@/lib/profileNotFoundI18n";

type ProfileNotFoundProps = {
  userId: string;
  userEmail: string;
  role: RoleKey;
  initialAutoRetry?: boolean;
};

type ProfileStatus = "idle" | "checking" | "pending" | "created" | "failed";

export const ProfileNotFound = ({ userId, userEmail, role, initialAutoRetry = false }: ProfileNotFoundProps) => {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { language } = useLanguage();
  const { buildWhatsappUrl } = useSupportContact();
  const [autoRetry, setAutoRetry] = useState(initialAutoRetry);
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<ProfileStatus>("idle");
  const stopRef = useRef(false);
  const [rejection, setRejection] = useState<{
    reason: string | null;
    decided_by_name: string | null;
    created_at: string;
  } | null>(null);

  const cfg = getRoleConfig(role, language);
  const c = getCommonStrings(language);

  const supportLink = buildWhatsappUrl(buildSupportMessage(role, userId, userEmail, language));

  // Verifica se este usuário foi rejeitado pelo gestor (com justificativa)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_my_latest_decision");
      if (cancelled) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row && row.decision === "rejected") {
        setRejection({
          reason: row.reason ?? null,
          decided_by_name: row.decided_by_name ?? null,
          created_at: row.created_at,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!autoRetry) return;
    stopRef.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopRef.current) return;
      setChecking(true);
      setStatus("checking");
      setAttempts((n) => n + 1);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setStatus("created");
          await refreshProfile();
          toast.success(c.linkedToast);
          setAutoRetry(false);
          navigate(cfg.redirectPath, { replace: true });
          return;
        }
        setStatus("pending");
      } catch {
        setStatus("failed");
      } finally {
        setChecking(false);
      }
      if (!stopRef.current) timer = setTimeout(tick, 5000);
    };

    tick();
    return () => {
      stopRef.current = true;
      clearTimeout(timer!);
    };
  }, [autoRetry, userId, navigate, refreshProfile, cfg.redirectPath, c.linkedToast]);

  const statusMeta: Record<ProfileStatus, { label: string; next: string; tone: string }> = {
    idle:     { label: c.statusIdle,     next: c.nextStepIdle,                  tone: "bg-secondary/40" },
    checking: { label: c.statusChecking, next: cfg.steps[cfg.steps.length - 1], tone: "bg-primary/10" },
    pending:  { label: c.statusPending,  next: c.nextStepPending,               tone: "bg-warning/10" },
    created:  { label: c.statusCreated,  next: "—",                             tone: "bg-success/10" },
    failed:   { label: c.statusFailed,   next: c.nextStepFailed,                tone: "bg-destructive/10" },
  };
  const sm = statusMeta[status];

  return (
    <div className="flex min-h-dvh items-start justify-center overflow-y-auto bg-background px-3 py-3">
      <div className="w-full max-w-md space-y-3 animate-fade-in">
        <div className="text-center space-y-1.5">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-warning/10 flex items-center justify-center">
            <Clock className="h-6 w-6 text-warning" />
          </div>
          <h1 className="text-xl font-bold">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.intro}</p>
        </div>

        <Card className="border-0 shadow-card">
          <CardContent className="p-3 space-y-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{c.email}</p>
              <p className="text-sm font-medium break-all">{userEmail}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{c.userId}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-secondary/50 rounded-md px-2 py-1 break-all">{userId}</code>
                <button
                  onClick={() => navigator.clipboard?.writeText(userId)}
                  className="text-xs text-primary hover:underline font-medium shrink-0"
                >
                  {c.copy}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {rejection && (
          <Card className="border-0 shadow-card bg-destructive/10">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm font-bold text-destructive">Cadastro rejeitado pela gestão</p>
              </div>
              {rejection.reason ? (
                <div className="rounded-lg bg-background/60 p-3 border border-destructive/20">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Motivo informado
                  </p>
                  <p className="text-sm break-words italic">"{rejection.reason}"</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  A gestão não informou um motivo específico.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground break-words">
                {rejection.decided_by_name ? `Por ${rejection.decided_by_name} · ` : ""}
                {new Date(rejection.created_at).toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Se discordar, entre em contato com a gestão da escola ou refaça seu cadastro corrigindo o que foi apontado.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className={`border-0 shadow-card ${sm.tone}`}>
          <CardContent className="p-3 space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{c.statusTitle}</p>
            <p className="text-sm font-bold">{sm.label}</p>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{c.nextStepLabel}</p>
              <p className="text-sm">{sm.next}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-sm font-bold">{c.howToFix}</p>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              {cfg.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {autoRetry && (
          <Card className="border-0 shadow-card bg-primary/5">
            <CardContent className="p-3 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-semibold">{c.waitingTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {c.attempt} {attempts} {checking ? c.checking : c.nextIn}
                </p>
              </div>
              <button
                onClick={() => setAutoRetry(false)}
                className="text-xs font-medium text-primary hover:underline shrink-0"
              >
                {c.stop}
              </button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-2">
          <a
            href={supportLink}
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm gap-2"
          >
            {c.contactSupport}
          </a>
          <button
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } finally {
                window.location.replace("/auth");
              }
            }}
            className="h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 text-destructive font-bold text-sm hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
          {!autoRetry ? (
            <button
              onClick={() => { setAttempts(0); setAutoRetry(true); }}
              className="h-12 inline-flex items-center justify-center rounded-xl bg-secondary text-secondary-foreground font-bold text-sm"
            >
              {cfg.redirectLabel}
            </button>
          ) : null}
          <button
            onClick={() => window.location.reload()}
            className="h-11 inline-flex items-center justify-center rounded-xl border border-border text-foreground font-medium text-sm"
          >
            {c.retry}
          </button>
        </div>
      </div>
    </div>
  );
};

const Index = () => {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  const handleExit = async () => {
    try {
      await signOut();
    } finally {
      window.location.replace("/auth");
    }
  };

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!cancelled) setIsAdmin(!!data);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
        <button
          onClick={handleExit}
          className="h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 px-5 text-destructive font-bold text-sm hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admin sem profile: criar automaticamente e recarregar
  if (!profile && isAdmin) {
    if (!ensuring) {
      setEnsuring(true);
      (async () => {
        try {
          await supabase.rpc("ensure_admin_profile");
          await refreshProfile();
        } catch (err) {
          console.error("Falha ao criar perfil admin:", err);
        } finally {
          setEnsuring(false);
        }
      })();
    }
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <div className="animate-pulse text-muted-foreground">Preparando painel admin...</div>
        <button
          onClick={async () => {
            try { await supabase.auth.signOut(); } finally { window.location.replace("/auth"); }
          }}
          className="h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 px-5 text-destructive font-bold text-sm hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    );
  }

  if (!profile) {
    if (isAdmin === null) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
          <div className="animate-pulse text-muted-foreground">Carregando perfil...</div>
          <button
            onClick={async () => {
              try { await supabase.auth.signOut(); } finally { window.location.replace("/auth"); }
            }}
            className="h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 px-5 text-destructive font-bold text-sm hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      );
    }
    const intended = (user.user_metadata?.intended_role || user.user_metadata?.role) as string | undefined;
    const KNOWN_ROLES: RoleKey[] = ["admin","gestor_pedagogico","chef_projeto_vida","coord_pedagogico","supervisor","secretario_escolar","teacher","default"];
    const role: RoleKey = isAdmin
      ? "admin"
      : (intended && (KNOWN_ROLES as string[]).includes(intended) ? (intended as RoleKey) : "default");
    return <ProfileNotFound userId={user.id} userEmail={user.email ?? "—"} role={role} />;
  }

  if (!profile.is_approved) {
    const isRejected = !!profile.rejection_reason;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto ${isRejected ? 'bg-destructive/10' : 'bg-warning/10'}`}>
            {isRejected ? <XCircle className="h-10 w-10 text-destructive" /> : <Clock className="h-10 w-10 text-warning" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display">
              {isRejected ? "Cadastro rejeitado" : "Aguardando aprovação"}
            </h1>
            <p className="text-muted-foreground text-sm break-words">
              {isRejected 
                ? <>Infelizmente, <span className="font-semibold text-foreground">{profile.full_name}</span>, seu cadastro foi rejeitado pela gestão da escola.</>
                : ((profile.role === "gestor_pedagogico" || profile.role === "chef_projeto_vida" || profile.role === "admin" || (profile as any).intended_role === "gestor_pedagogico" || (profile as any).intended_role === "chef_projeto_vida")
                  ? <><span className="font-semibold text-foreground">{profile.full_name}</span>, sua conta de Gestor foi criada com sucesso! Aguarde a aprovação do <span className="font-semibold text-foreground">Administrador do sistema</span> para começar a usar a plataforma. A liberação não depende de outro gestor — apenas do Administrador.</>
                  : <><span className="font-semibold text-foreground">{profile.full_name}</span>, sua conta foi criada com sucesso! O(a) Gestor(a) da sua escola precisa aprovar seu acesso antes que você possa usar o sistema.</>)
              }
            </p>
          </div>

          {isRejected && profile.rejection_reason && (
            <Card className="border-0 shadow-card bg-destructive/10 text-left">
              <CardContent className="p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-destructive">Justificativa da Gestão</p>
                <p className="text-sm italic break-words text-destructive-foreground">"{profile.rejection_reason}"</p>
                <div className="pt-2 border-t border-destructive/20">
                  <p className="text-[11px] text-muted-foreground">
                    Você pode procurar a secretaria da escola para regularizar sua situação ou tentar um novo cadastro com os dados corrigidos.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-card">
            <CardContent className="p-4 text-left space-y-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Seus dados registrados</p>
                <p className="text-sm font-medium">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground">{profile.role}</p>
              </div>
              <div className="pt-2 border-t">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Status atual</p>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${isRejected ? 'bg-destructive' : 'bg-amber-500'}`} />
                  <p className={`text-xs font-mono font-bold ${isRejected ? 'text-destructive' : 'text-amber-500'}`}>
                    {isRejected ? "REJEITADO" : "PENDENTE"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex flex-col gap-3">
            {!isRejected && (
              <button
                onClick={async () => {
                  await refreshProfile();
                  toast.info("Status verificado com o servidor");
                }}
                className="w-full h-12 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-glow"
              >
                Verificar agora
              </button>
            )}
            
            <button
              onClick={async () => {
                try {
                  await signOut();
                } finally {
                  window.location.replace("/auth");
                }
              }}
              className={`w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl font-bold text-sm ${isRejected ? 'bg-primary text-primary-foreground shadow-glow' : 'border border-destructive/40 text-destructive hover:bg-destructive/10'}`}
            >
              {isRejected ? "Refazer cadastro / Sair" : (
                <>
                  <LogOut className="h-4 w-4" />
                  Sair
                </>
              )}
            </button>

            {isAdmin && (
              <button
                onClick={() => window.location.assign("/admin/login")}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 text-amber-500 font-bold text-sm hover:bg-amber-500/10"
              >
                <ShieldAlert className="h-4 w-4" />
                Entrar como Admin
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <Navigate to="/sectors" replace />;
};

export default Index;
