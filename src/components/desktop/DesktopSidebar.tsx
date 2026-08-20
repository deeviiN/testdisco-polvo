import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  Grid3x3,
  CalendarDays,
  BarChart3,
  Inbox,
  MessageSquare,
  UserCog,
  Shield,
  Crown,
  FileSignature,
  Tv,
  Monitor,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsGestor } from "@/hooks/useIsGestor";
import { useViewPreference } from "@/hooks/useViewPreference";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
};

/**
 * Sidebar lateral fixa exibida apenas em telas ≥ lg (1024px).
 * Mantém a identidade visual do app (azul sólido + ativo âmbar + polvo).
 * Itens são filtrados pelo papel do usuário.
 */
export default function DesktopSidebar() {
  const { profile, user } = useAuth();
  const { isGestor, isGestorOrChef } = useIsGestor();
  const { pathname } = useLocation();
  const { viewMode, setViewMode } = useViewPreference();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const items: NavItem[] = [];

  if (profile) {
    items.push({ to: "/home", label: "Início", icon: Home });
    items.push({ to: "/sectors", label: "Setores", icon: Grid3x3 });
    items.push({ to: "/today-bookings", label: "Agendamentos do Dia", icon: CalendarDays });
    items.push({ to: "/reports", label: "Relatórios", icon: BarChart3 });
    items.push({ to: "/inbox", label: "Caixa", icon: Inbox });
    items.push({ to: "/messages", label: "Mensagens", icon: MessageSquare });
    items.push({ to: "/profile", label: "Meu Perfil", icon: UserCog });
  }

  if (isGestorOrChef) {
    items.push({ to: "/gestor", label: "Painel do Gestor", icon: Crown });
    items.push({ to: "/gestor/aprovacoes", label: "Aprovações", icon: FileSignature });
    items.push({ to: "/gestor/inbox", label: "Caixa do Gestor", icon: Inbox });
  }

  if (isAdmin) {
    items.push({ to: "/admin", label: "Admin", icon: Shield });
    items.push({ to: "/admin/contracts", label: "Contratos", icon: FileSignature });
    items.push({ to: "/admin/inbox", label: "Caixa Admin", icon: Inbox });
  }

  // Sempre disponível
  items.push({ to: "/tv", label: "Modo TV", icon: Tv });

  // Não renderiza se não houver login (mantém telas /, /auth limpas)
  if (!profile) return null;

  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[240px] flex-col text-white shadow-2xl"
      style={{ background: "hsl(220, 50%, 28%)" }}
      aria-label="Menu principal"
    >
      {/* Topo: polvo + nome */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/15 bg-black/10">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-xl shrink-0">
          🐙
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-amber-300 font-semibold">Agendamento</div>
          <div className="text-sm font-extrabold text-white break-words">Ambiente Escolar</div>
        </div>
      </div>

      {/* Lista de itens */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-1">
          {items.map((item) => {
            const active =
              pathname === item.to ||
              (item.to !== "/" && pathname.startsWith(item.to + "/"));
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-amber-400 text-amber-950 shadow"
                      : "text-white/90 hover:bg-white/10",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Alternar entre visão de computador (usa a tela toda) e compacta (idêntica ao celular) */}
      <div className="px-3 py-3 border-t border-white/15 bg-black/10">
        <div className="flex rounded-lg bg-black/20 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode("wide")}
            aria-pressed={viewMode === "wide"}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition-colors",
              viewMode === "wide" ? "bg-amber-400 text-amber-950" : "text-white/80 hover:text-white",
            )}
          >
            <Monitor className="w-3.5 h-3.5" /> Computador
          </button>
          <button
            type="button"
            onClick={() => setViewMode("compact")}
            aria-pressed={viewMode === "compact"}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition-colors",
              viewMode === "compact" ? "bg-amber-400 text-amber-950" : "text-white/80 hover:text-white",
            )}
          >
            <Smartphone className="w-3.5 h-3.5" /> Compacta
          </button>
        </div>
      </div>

      {/* Rodapé com nome do usuário */}
      <div className="px-4 py-3 border-t border-white/15 bg-black/15 text-xs font-semibold text-white break-words leading-snug">
        {profile?.full_name || user?.email || ""}
      </div>
    </aside>
  );
}
