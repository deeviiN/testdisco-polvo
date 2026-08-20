import { useEffect, useState, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface AdminRouteGuardProps {
  children: ReactNode;
}

/**
 * Whitelist de rotas administrativas públicas (sem exigência de role admin).
 * Qualquer rota listada aqui passa direto pelo guard, mesmo que envolvida por ele.
 * Mantém `/admin/login` (e aliases) acessível para autenticação inicial.
 */
const PUBLIC_ADMIN_ROUTES: ReadonlyArray<string> = [
  "/admin/login",
  "/admin/signin",
  "/admin/entrar",
];

const isPublicAdminRoute = (pathname: string): boolean => {
  const normalized = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  return PUBLIC_ADMIN_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`)
  );
};

/**
 * Guard global para rotas administrativas.
 * Bloqueia acesso direto via URL para qualquer usuário sem role 'admin' global.
 * - Usuário não autenticado → redireciona para /admin/login
 * - Usuário autenticado sem role admin → redireciona para /home com aviso
 */
const AdminRouteGuard = ({ children }: AdminRouteGuardProps) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (isPublicAdminRoute(location.pathname)) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      // O cliente de autenticação renova o token automaticamente. Forçar uma
      // segunda renovação aqui concorria com login/getSession e quebrava o lock.
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (cancelled) return;
      if (error) {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, location.pathname]);

  // Whitelist: rotas públicas de autenticação admin passam direto pelo guard
  if (isPublicAdminRoute(location.pathname)) {
    return <>{children}</>;
  }

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">
          Verificando permissões administrativas…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin) {
    toast.error("Acesso restrito ao administrador global.");
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default AdminRouteGuard;
