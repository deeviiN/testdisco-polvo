import { ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Clock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CommunityIdGate from "@/components/CommunityIdGate";

// Rotas liberadas quando a escola está em fase 'blocked' (20+ dias sem pagar)
const BLOCKED_PHASE_WHITELIST = [
  "/subscription",
  "/gestor/documentos",
  "/profile",
  "/settings",
  "/auth",
  "/admin",
];

function isWhitelistedPath(pathname: string): boolean {
  return BLOCKED_PHASE_WHITELIST.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Bloqueia acesso a fluxos sensíveis para usuários não aprovados
 * ou para gestores com trial de 7 dias expirado sem assinatura ativa.
 */
export default function ApprovedRouteGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading, refreshProfile } = useAuth();
  const location = useLocation();
  const wasUnapprovedRef = useRef(false);
  const [trialBlocked, setTrialBlocked] = useState<boolean | null>(null);
  const [schoolPhase, setSchoolPhase] = useState<"active" | "trial" | "restricted" | "blocked" | null>(null);

  // Admin impersonando um servidor: libera TUDO independente do status da escola.
  // O admin precisa poder entrar em qualquer painel para dar suporte, mesmo se
  // o pagamento da escola estiver atrasado/bloqueado.
  const isAdminImpersonating = (() => {
    try {
      return !!sessionStorage.getItem("lovable:as_school");
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (profile && !profile.is_approved) {
      wasUnapprovedRef.current = true;
    } else if (profile?.is_approved && wasUnapprovedRef.current) {
      wasUnapprovedRef.current = false;
      toast({
        title: "Acesso liberado!",
        description: "Seu cadastro foi aprovado. Você já pode usar a plataforma.",
      });
    }
  }, [profile?.is_approved, profile]);

  // Fallback de polling: enquanto o usuário estiver "aguardando aprovação",
  // re-verifica o perfil a cada 10s, caso o realtime do Supabase não dispare.
  useEffect(() => {
    if (!user || !profile || profile.is_approved) return;
    const id = window.setInterval(() => {
      refreshProfile();
    }, 10000);
    return () => window.clearInterval(id);
  }, [user, profile?.is_approved, refreshProfile]);

  const recheckPhase = async () => {
    const { data: phaseData } = await supabase.rpc("get_my_school_trial_phase" as any);
    const phaseRow: any = Array.isArray(phaseData) ? phaseData[0] : phaseData;
    const phase = (phaseRow?.phase as any) || null;
    setSchoolPhase(phase);
    const { data } = await supabase.rpc("get_my_trial_status" as any);
    const row: any = Array.isArray(data) ? data[0] : data;
    const expired = !!row?.trial_expired;
    const subActive = row?.school_subscription_status === "active";
    setTrialBlocked((phase === "blocked") || (expired && !subActive));
  };

  useEffect(() => {
    if (!profile?.is_approved) { setTrialBlocked(null); setSchoolPhase(null); return; }
    
    // Admins são ignorados na validação de trial/plano escolar
    // (inclui admin impersonando qualquer servidor via "Entrar como Servidor")
    if (profile.role === "admin" || isAdminImpersonating) {
      setTrialBlocked(false);
      setSchoolPhase("active");
      return;
    }

    let cancelled = false;
    (async () => { if (!cancelled) await recheckPhase(); })();

    // Realtime: destrava automaticamente quando o pagamento é confirmado
    // (schools.subscription_status muda para 'active' via webhook do Mercado Pago).
    const schoolId = (profile as any).school_id;
    if (!schoolId) return () => { cancelled = true; };
    const channel = supabase
      .channel(`school-sub-${schoolId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "schools", filter: `id=eq.${schoolId}` }, () => {
        recheckPhase();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos", filter: `escola_id=eq.${schoolId}` }, () => {
        recheckPhase();
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [profile?.is_approved, profile?.role, profile?.id, (profile as any)?.school_id, isAdminImpersonating]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!profile) return <Navigate to="/home" replace />;

  if (!profile.is_approved) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-warning/10 flex items-center justify-center mx-auto">
            <Clock className="h-10 w-10 text-warning" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display">Aguardando aprovação</h1>
            <p className="text-muted-foreground text-sm">
              Sua conta foi criada! O administrador precisa aprovar seu acesso.
              Após a aprovação você terá <strong>7 dias</strong> para concluir a assinatura do plano.
            </p>
          </div>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4 text-left">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                Seus dados
              </p>
              <p className="text-sm font-medium">{profile.full_name}</p>
              <p className="text-xs text-muted-foreground">{profile.role}</p>
            </CardContent>
          </Card>
          <button
            onClick={() => refreshProfile()}
            className="text-sm text-primary hover:underline font-medium"
          >
            Verificar novamente
          </button>
        </div>
      </div>
    );
  }

  if (trialBlocked) {
    const isManager = profile.role === "gestor_pedagogico" || profile.role === "chef_projeto_vida";

    // Gestora/Diretora mantém acesso a TUDO para conseguir gerar o pagamento pelo app.
    // As demais restrições (novas reservas, aprovações etc.) já são impostas no banco.
    if (isManager) {
      return <>{children}</>;
    }

    // Em fase 'blocked', libera rotas essenciais para outros papéis (perfil, documentos)
    if (schoolPhase === "blocked" && isWhitelistedPath(location.pathname)) {
      return <>{children}</>;
    }

    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-destructive/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display text-destructive">Acesso suspenso</h1>
            <p className="text-muted-foreground text-sm">
              O período de testes da sua escola expirou ou a assinatura não está ativa.
              Entre em contato com a <strong>gestão escolar</strong> da sua unidade para regularizar o acesso.
            </p>
          </div>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4 text-left">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                Unidade
              </p>
              <p className="text-sm font-medium">Sua Unidade</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Status: Assinatura pendente
              </p>
            </CardContent>
          </Card>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary hover:underline font-medium"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Bloqueio para usuário da comunidade: exige envio de documento (frente/verso) após aprovação
  const p: any = profile;
  const isCommunity = p?.intended_role === "usuario_comunidade" || p?.role === "usuario_comunidade";
  const missingIdDocs = !p?.id_doc_front_path || !p?.id_doc_back_path;
  if (isCommunity && profile.is_approved && missingIdDocs && user) {
    return (
      <CommunityIdGate
        userId={user.id}
        fullName={profile.full_name || ""}
        onDone={() => window.location.reload()}
      />
    );
  }

  return <>{children}</>;
}
