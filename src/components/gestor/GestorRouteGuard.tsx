import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsGestor } from "@/hooks/useIsGestor";
import GestorThemeShell from "@/components/gestor/GestorThemeShell";

/**
 * Guard único para rotas /gestor/*.
 *
 * - Espera o auth carregar.
 * - Redireciona para /auth se não logado e para /sectors se sem permissão.
 * - Renderiza o `GestorThemeShell` com o tema ativado para gestor (e chef
 *   quando `allowChef`), unificando spinner + visual em todas as telas.
 *
 * Use diretamente no App.tsx envolvendo o `element` da rota.
 */
export default function GestorRouteGuard({
  children,
  allowChef = false,
  allowCoord = false,
  scrollable = true,
}: {
  children: ReactNode;
  allowChef?: boolean;
  allowCoord?: boolean;
  scrollable?: boolean;
}) {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const { isGestor, isGestorOrChef } = useIsGestor();
  const isCoord = profile?.role === "coord_pedagogico";
  const allowed = (allowChef ? isGestorOrChef : isGestor) || (allowCoord && isCoord);

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!allowed) {
      navigate("/sectors", { replace: true });
    }
  }, [loading, profile, allowed, navigate]);

  if (loading || !profile || !allowed) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <GestorThemeShell enabled scrollable={scrollable}>
      {children}
    </GestorThemeShell>
  );
}
