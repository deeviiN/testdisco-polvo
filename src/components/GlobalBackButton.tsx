import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Rotas onde o botão "voltar" não deve aparecer (raiz, autenticação, TV e dashboard principal)
const HIDDEN_ROUTES = ["/", "/auth", "/reset-password", "/tv", "/sectors", "/dashboard", "/gestor"];

function firstAndLastName(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

const ROLE_PANEL_LABEL: Record<string, string> = {
  admin: "Administrador",
  gestor_pedagogico: "Gestor",
  teacher: "Professor",
  coord_pedagogico: "Coordenador Pedagógico",
  supervisor: "C.A.",
  secretario_escolar: "Assistente",
  chef_projeto_vida: "Chef da Sala",
};


function panelLabel(role?: string | null, fullName?: string | null) {
  const roleLabel = role ? ROLE_PANEL_LABEL[role] ?? null : null;
  if (roleLabel) return `Painel ${roleLabel}`;
  return firstAndLastName(fullName);
}

export default function GlobalBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const leftBarRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [placeAbove, setPlaceAbove] = useState(false);
  const tooltipId = useId();

  // Estimativa do fallback baseada nas métricas reais do tooltip:
  // py-1.5 (12px) + text-[13px] * leading-snug (~1.375) ≈ ~30px → 32 c/ borda.
  const FALLBACK_TIP_H = 32;

  const recalc = useCallback(() => {
    const el = nameRef.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth + 1);
    const rect = el.getBoundingClientRect();
    const tipEl = tooltipRef.current;
    const tipH = tipEl ? tipEl.getBoundingClientRect().height : FALLBACK_TIP_H;
    const gap = 6; // mb-1.5 / mt-1.5
    const needed = tipH + gap;
    const spaceBelow = window.innerHeight - rect.bottom;
    setPlaceAbove(spaceBelow < needed && rect.top > needed);
  }, []);

  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    recalc();
    const raf = requestAnimationFrame(recalc);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(recalc);
      ro.observe(el);
      if (tooltipRef.current) ro.observe(tooltipRef.current);
    }
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [profile?.full_name, isTruncated, recalc]);

  // Recalcula no primeiro hover/focus para usar a altura real do tooltip
  // assim que ele monta (substitui o fallback FALLBACK_TIP_H).
  // Debounce evita múltiplas medições durante hover/focus repetidos.
  const revealTimerRef = useRef<number | null>(null);
  const hasRevealedRef = useRef(false);
  const handleReveal = useCallback(() => {
    if (hasRevealedRef.current) return;
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
    }
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      hasRevealedRef.current = true;
      requestAnimationFrame(() => requestAnimationFrame(recalc));
    }, 80);
  }, [recalc]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = leftBarRef.current;
    if (!el) return;
    const FALLBACK = "3rem";
    const update = () => {
      const w = el.offsetWidth;
      document.documentElement.style.setProperty(
        "--gnav-left-w",
        w > 0 ? `${w}px` : FALLBACK,
      );
    };
    update();
    let ro: ResizeObserver | null = null;
    let onResize: (() => void) | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } else {
      onResize = update;
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
    }
    return () => {
      ro?.disconnect();
      if (onResize) {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      }
      document.documentElement.style.setProperty("--gnav-left-w", FALLBACK);
    };
  }, [user, profile, location.pathname]);

  if (!user || !profile) return null;
  if (HIDDEN_ROUTES.includes(location.pathname)) return null;

  const handleBack = () => {
    const path = location.pathname;
    // Fallback explícito por seção (evita ficar travado quando o histórico
    // do navegador aponta para a própria página atual).
    let fallback = "/sectors";
    if (path.startsWith("/gestor/")) fallback = "/gestor";
    else if (path.startsWith("/admin/")) fallback = "/admin";
    else if (path.startsWith("/profile/")) fallback = "/profile";

    const before = window.location.pathname;
    if (window.history.length > 1) {
      navigate(-1);
      // Safety net: se após o -1 continuarmos na mesma rota, força o fallback.
      window.setTimeout(() => {
        if (window.location.pathname === before) {
          navigate(fallback, { replace: true });
        }
      }, 120);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  return (
    <>
      {/* Faixa azul cobrindo o vão entre o botão Voltar e a toolbar de configuração */}
      <div
        aria-hidden
        className="fixed top-0 left-14 right-14 h-11 z-40 rounded-xl pointer-events-none animate-in fade-in duration-500"
        style={{
          background:
            "linear-gradient(90deg, hsl(220, 70%, 18%) 0%, hsl(205, 90%, 60%) 50%, hsl(220, 70%, 18%) 100%)",
          boxShadow: "0 4px 14px hsla(210, 90%, 40%, 0.35)",
        }}
      />
      {/* Nome do usuário dentro da faixa azul */}
      {profile?.full_name && (
        <div
          className="fixed top-0 h-11 z-[41] flex items-center justify-start pointer-events-none animate-in fade-in duration-500"
          style={{
            left: "calc(var(--gnav-left-w, 3rem) + 1rem)",
            right: "calc(var(--gnav-right-w, 9rem) + 1rem)",
          }}
        >
          <div
            className="relative w-full group pointer-events-auto"
            onPointerEnter={handleReveal}
            onFocus={handleReveal}
          >
            {(() => {
              const displayName = panelLabel(profile.role, profile.full_name);
              const fontStyle = { fontSize: "clamp(18px, 5.6vw, 24px)", lineHeight: 1.1, letterSpacing: "0.01em" };
              return (
                <div className="relative w-full overflow-hidden">
                  <span
                    ref={nameRef}
                    aria-label={isTruncated ? displayName : undefined}
                    aria-describedby={isTruncated ? tooltipId : undefined}
                    tabIndex={isTruncated ? 0 : -1}
                    className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap text-white font-extrabold cursor-default outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded peer ${isTruncated ? "invisible" : ""}`}
                    style={fontStyle}
                  >
                    {displayName}
                  </span>
                  {isTruncated && (
                    <div
                      aria-hidden
                      className="absolute inset-0 flex items-center overflow-hidden pointer-events-none"
                    >
                      <div className="flex shrink-0 whitespace-nowrap animate-marquee-x">
                        <span
                          className="text-white font-extrabold pr-12"
                          style={fontStyle}
                        >
                          {displayName}
                        </span>
                        <span
                          className="text-white font-extrabold pr-12"
                          style={fontStyle}
                        >
                          {displayName}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {isTruncated && (
              <span
                ref={tooltipRef}
                id={tooltipId}
                role="tooltip"
                className={`pointer-events-none absolute left-0 z-[60] rounded-md border border-white/15 bg-neutral-900 px-2.5 py-1.5 text-[13px] font-medium leading-snug text-white shadow-xl opacity-0 will-change-[opacity,transform] group-hover:opacity-100 group-hover:translate-y-0 peer-focus-visible:opacity-100 peer-focus-visible:translate-y-0 ${placeAbove ? "bottom-full mb-1.5 translate-y-1" : "top-full mt-1.5 -translate-y-1"}`}
                style={{
                  maxWidth: "calc(100vw - 2rem)",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  // Easings distintos: fade linear-suave, slide com saída elástica
                  transition:
                    "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {profile.full_name}
              </span>
            )}
          </div>
        </div>
      )}
      <div ref={leftBarRef} className="fixed top-0 left-2 z-50 flex items-center rounded-xl bg-black/40 backdrop-blur-md shadow-lg ring-1 ring-white/10 animate-in fade-in slide-in-from-left-2 duration-500 h-11">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Voltar"
          title="Voltar"
          className="flex items-center justify-center h-full w-11 rounded-xl text-white/95 hover:bg-white/10 active:scale-95 transition-all"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2.4} />
        </button>
      </div>
    </>
  );
}
