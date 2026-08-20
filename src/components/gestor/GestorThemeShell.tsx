import { ReactNode } from "react";
import { useIsGestor } from "@/hooks/useIsGestor";

/**
 * Wrapper visual usado nas páginas acessadas a partir do Painel do Gestor.
 * Reproduz o mesmo fundo (gradiente azul escuro com glow) e dá suporte a
 * tokens de destaque laranja/âmbar usados no painel.
 *
 * Aplica o tema apenas quando o usuário logado for gestor (ou chef, se
 * `allowChef`). Para outros perfis, renderiza o conteúdo com fundo padrão
 * do sistema, sem precisar duplicar a checagem na página chamadora.
 *
 * Use `enabled` para sobrescrever explicitamente a heurística (por
 * exemplo, no painel `/gestor` que já tem guard de role próprio).
 */
export default function GestorThemeShell({
  children,
  scrollable = true,
  allowChef = false,
  enabled,
}: {
  children: ReactNode;
  scrollable?: boolean;
  allowChef?: boolean;
  enabled?: boolean;
}) {
  const { isGestor, isGestorOrChef } = useIsGestor();
  const themed =
    enabled !== undefined ? enabled : allowChef ? isGestorOrChef : isGestor;

  if (!themed) {
    return (
      <div
        className={`relative bg-background text-foreground ${
          scrollable ? "h-dvh overflow-y-auto" : "overflow-hidden h-dvh"
        }`}
      >
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-gradient-to-br from-[hsl(220,75%,5%)] via-[hsl(222,70%,8%)] to-[hsl(225,80%,3%)] text-white ${
        scrollable ? "h-dvh overflow-y-auto" : "overflow-hidden h-dvh"
      }`}
    >
      {/* Ambient blue glow — idêntico ao GestorPanel */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-blue-700/15 blur-3xl" />
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Botão CTA padrão do tema do gestor (gradiente laranja com glow âmbar).
 */
export function GestorCtaButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border-2 border-amber-300 text-white font-extrabold uppercase tracking-wide transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 ${className}`}
      style={{
        background: "linear-gradient(135deg, hsl(32, 95%, 58%), hsl(20, 92%, 45%))",
        boxShadow:
          "0 0 10px hsl(35, 100%, 60%), 0 0 20px hsla(28, 100%, 55%, 0.7), inset 0 0 6px hsla(45, 100%, 70%, 0.5)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Cabeçalho dourado padrão (Premium Gold) usado no painel do gestor.
 */
export function GestorPremiumHeader({
  title,
  subtitle,
  icon,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header
      className="rounded-2xl p-2.5 sm:p-3 border shadow-2xl"
      style={{
        background:
          "linear-gradient(135deg, hsla(var(--primary), 0.45), hsla(var(--primary), 0.25))",
        borderColor: "hsla(var(--primary), 0.45)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-start gap-2 sm:gap-3 flex-col sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:flex-1 min-w-0">
          {icon && (
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shadow-lg shrink-0"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsla(var(--primary), 0.7))",
                boxShadow: "0 10px 20px -8px hsla(var(--primary), 0.6)",
              }}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-base sm:text-lg font-extrabold leading-tight break-words">
              {title}
            </h1>
            {subtitle && (
              <div className="text-white/80 text-xs sm:text-sm font-medium leading-snug">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {right && (
          <div className="shrink-0 w-full sm:w-auto sm:ml-auto flex items-center gap-2 max-w-full justify-end">
            {right}
          </div>
        )}
      </div>
    </header>
  );
}
