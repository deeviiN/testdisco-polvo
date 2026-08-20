import { useAuth } from "@/hooks/useAuth";

/**
 * Helper único para checar se o usuário logado deve enxergar o tema/visual
 * exclusivo do Gestor Pedagógico (fundo azul escuro + detalhes âmbar).
 *
 * Use em qualquer página compartilhada para condicionar fundo, bordas e
 * cores do tema do painel do gestor.
 *
 * - `isGestor`: true apenas para `gestor_pedagogico`.
 * - `isGestorOrChef`: inclui também `chef_projeto_vida` (gerente da unidade),
 *   útil em telas como `/gestor/cadastros` que ambos compartilham.
 */
export function useIsGestor() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isGestor = role === "gestor_pedagogico";
  const isChef = role === "chef_projeto_vida";
  return {
    isGestor,
    isChef,
    isGestorOrChef: isGestor || isChef,
  };
}
