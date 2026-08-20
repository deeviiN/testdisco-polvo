import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSectorLabels } from "@/hooks/useSectorLabels";
import { useSchoolTrialPhase } from "@/hooks/useSchoolTrialPhase";
import LastUpdateBadge from "@/components/LastUpdateBadge";
import MsnChatIcon from "@/components/MsnChatIcon";
import { useSchoolMessagesUnread } from "@/hooks/useSchoolMessagesUnread";
import { toast } from "@/hooks/use-toast";

import { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";
import {
  useSectorPreferences,
  FONT_OPTIONS,
  COLOR_OPTIONS,
  STYLE_MODES,
  getStyleEffects,
  type ColorOption,
} from "@/hooks/useSectorPreferences";
import {
  ArrowLeft,
  Monitor,
  Lightbulb,
  TreePine,
  Trophy,
  CalendarDays,
  CalendarRange,
  X,
  UserCircle,
  ListChecks,
  PenLine,
  BookOpen,
  FlaskConical,
  Users,
  Type,
  Palette,
  Check,
  Sparkles,
  Bell,
  Crown,
  RefreshCw,
  QrCode,
  ClipboardCheck,
  CalendarClock,
  



} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Build a radial-gradient from a ColorOption (matches the original sector style)
function colorToGradient(c: ColorOption, selected = false) {
  if (selected) {
    return `radial-gradient(circle at 30% 25%, hsla(${c.hueA}, ${c.satA + 10}%, ${c.lightA + 12}%, 1) 0%, hsla(${c.hueB}, ${c.satB + 5}%, ${c.lightB + 6}%, 1) 60%, hsla(${c.hueC}, ${c.satC + 10}%, ${c.lightC + 4}%, 1) 100%)`;
  }
  return `linear-gradient(145deg, hsla(${c.hueA}, ${c.satA}%, ${c.lightA}%, 1), hsla(${c.hueB}, ${c.satB}%, ${c.lightB}%, 1))`;
}

// Solid (flat) color — no relief, no gloss. Matches the plain time-slot buttons.
function colorToSolid(c: ColorOption, selected = false) {
  const l = selected ? c.lightA + 8 : c.lightB;
  const s = selected ? c.satA : c.satB;
  const h = selected ? c.hueA : c.hueB;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

interface SectorItem {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string | null;
  gradient: string;
}

const baseSectors: Omit<SectorItem, "label">[] = [
  { key: "informatica", icon: Monitor, route: "/booking/quadra", gradient: "" },
  { key: "quadra", icon: Trophy, route: "/booking/quadra", gradient: "" },
  { key: "patio", icon: TreePine, route: "/booking/quadra", gradient: "" },
  { key: "biblioteca", icon: BookOpen, route: "/booking/quadra", gradient: "" },
  { key: "lab_ciencias", icon: FlaskConical, route: "/booking/quadra", gradient: "" },
  { key: "sala_professores", icon: Users, route: "/booking/quadra", gradient: "" },
  { key: "projeto_vida", icon: Lightbulb, route: "/booking/quadra", gradient: "" },
];

const DEFAULT_SECTOR_LABELS: Record<string, string> = {
  biblioteca: "Biblioteca",
  lab_ciencias: "Laboratório de Ciências",
  sala_professores: "Sala dos Professores",
};

const ROLE_PANEL_LABELS: Record<string, string> = {
  admin: "Painel Administrador",
  gestor_pedagogico: "Painel Gestor",
  chef_projeto_vida: "Painel Coord. da Sala de Vídeo",
  teacher: "Painel Professor",
  coord_pedagogico: "Painel Coordenador Pedagógico",
  supervisor: "Painel Corpo de Alunos C.A.",
  secretario_escolar: "Painel Assistente de Aluno",
  coord_informatica: "Painel Coord. Sala de Informática",
  coord_biblioteca: "Painel Coord. da Biblioteca",
  coord_lab_ciencias: "Painel Coord. do Lab. de Ciências",
  presidente_apm: "Painel Presidente da APM",
  usuario_comunidade: "Painel Usuário da Comunidade",
};

function TopBarOffset({ offset }: { offset: string }) {
  useEffect(() => {
    const prev = document.documentElement.style.getPropertyValue("--gnav-top");
    document.documentElement.style.setProperty("--gnav-top", offset);
    return () => {
      if (prev) document.documentElement.style.setProperty("--gnav-top", prev);
      else document.documentElement.style.removeProperty("--gnav-top");
    };
  }, [offset]);
  return null;
}

function PanelTitleMarquee({ text, className = "" }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      const c = containerRef.current;
      const i = innerRef.current;
      if (!c || !i) return;
      setOverflow(i.scrollWidth > c.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} tabIndex={0} className={`panel-title-marquee flex-1 min-w-0 overflow-hidden outline-none ${className}`}>
      <div className="panel-title-marquee-track text-white font-extrabold text-lg uppercase tracking-wider drop-shadow-md">
        <span ref={innerRef}>{text}</span>
      </div>

    </div>
  );
}


export default function SectorSelect() {
  const navigate = useNavigate();
  const { unread: chatUnread, markAllSeen: markChatSeen } = useSchoolMessagesUnread(true);

  const { profile } = useAuth();
  useEffect(() => {
    if (profile?.role === "secretario_escolar" || profile?.role === "assistente") {
      navigate("/assistente", { replace: true });
    }
  }, [profile?.role, navigate]);
  const [schoolName, setSchoolName] = useState("");
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [selectedOption, setSelectedOption] = useState<"single" | "multi" | null>(null);
  const closeModal = () => {
    if (modalClosing) return;
    setModalClosing(true);
    window.setTimeout(() => {
      setSelectedSector(null);
      setModalClosing(false);
      setSelectedOption(null);
    }, 220);
  };
  const pickOption = (kind: "single" | "multi", route: string) => {
    setSelectedOption(kind);
    window.setTimeout(() => navigate(route), 260);
  };

  const [signOpen, setSignOpen] = useState(false);
  const { getLabel } = useSectorLabels();
  const { fontKey, colorKey, glowEnabled, styleMode, setFontKey, setColorKey, setGlowEnabled, cycleStyleMode, font, color } = useSectorPreferences();
  const styleModeLabel = (STYLE_MODES.find((s) => s.key === styleMode) ?? STYLE_MODES[0]).label;
  const fx = getStyleEffects(color, styleMode);
  const pulseAnim = ""; // pulse removido — apenas "Agendamentos Hoje" pisca quando houver agendamento
  // Sheen (faixa esbranquiçada no topo) removido a pedido — botões sólidos.
  const sheenTop = null;
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [stylePreviewOpen, setStylePreviewOpen] = useState(false);
  const styleToggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const styleGlowOptionRef = useRef<HTMLButtonElement | null>(null);
  const styleFlatOptionRef = useRef<HTMLButtonElement | null>(null);

  // Escape fecha o popover de Brilho/Padrão e devolve o foco ao botão que o abriu.
  // Ao abrir, foco vai para o botão de exemplo do modo ativo.
  useEffect(() => {
    if (!stylePreviewOpen) return;
    const target = glowEnabled ? styleGlowOptionRef.current : styleFlatOptionRef.current;
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setStylePreviewOpen(false);
        styleToggleBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stylePreviewOpen, glowEnabled]);

  // Visual debug mode (enable via ?debug=spacing) — overlays guides + gap labels
  const [debugSpacing, setDebugSpacing] = useState(false);
  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setDebugSpacing(params.get("debug") === "spacing");
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isSm = vw >= 640;
  const centerRadius = isSm ? 54 : 50;
  const sideGap = 16;
  const sideOffset = centerRadius + sideGap;

  // Refs + live DOM measurement (active when ?debug=spacing)
  const centerBtnRef = useRef<HTMLButtonElement | null>(null);
  const fontBtnRef = useRef<HTMLButtonElement | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement | null>(null);
  const [measured, setMeasured] = useState<{ leftGap: number; rightGap: number } | null>(null);
  useEffect(() => {
    if (!debugSpacing) return;
    const measure = () => {
      const c = centerBtnRef.current?.getBoundingClientRect();
      const f = fontBtnRef.current?.getBoundingClientRect();
      const cc = colorBtnRef.current?.getBoundingClientRect();
      if (!c || !f || !cc) return;
      const leftGap = c.left - f.right;
      const rightGap = cc.left - c.right;
      setMeasured({
        leftGap: Math.round(leftGap * 10) / 10,
        rightGap: Math.round(rightGap * 10) / 10,
      });
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [debugSpacing, vw]);

  // Detect low-power devices / reduced-motion preference once on mount.
  // Avoids expensive halo + conic-gradient ring on slow mobiles.
  const [lowPerf, setLowPerf] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const lowCores = (navigator.hardwareConcurrency ?? 8) <= 4;
    const lowMem = (nav.deviceMemory ?? 8) <= 4;
    const saveData = nav.connection?.saveData === true;
    const isMobile = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    setLowPerf(reduceMotion || saveData || (isMobile && (lowCores || lowMem)));
  }, []);

  const sectors: SectorItem[] = baseSectors.map((s) => {
    const label = getLabel(s.key);
    const finalLabel = label === s.key ? (DEFAULT_SECTOR_LABELS[s.key] || s.key) : label;
    return { ...s, label: finalLabel };
  });

  const handleBack = () => {
    if (selectedSector) {
      closeModal();
    } else if (profile?.role === "gestor_pedagogico") {
      navigate("/gestor");
    } else {
      navigate("/");
    }
  };

  const trialPhase = useSchoolTrialPhase();

  // Admin impersonando servidor: libera todos os setores independente da fase.
  const isAdminImpersonating = (() => {
    try { return !!sessionStorage.getItem("lovable:as_school"); } catch { return false; }
  })();

  const handleSectorClick = (sector: SectorItem) => {
    if (!isAdminImpersonating && trialPhase.phase === "blocked") {
      toast({
        title: "Assinatura vencida",
        description: "Regularize a assinatura para voltar a agendar.",
        variant: "destructive",
      });
      navigate("/subscription");
      return;
    }
    if (
      !isAdminImpersonating &&
      trialPhase.phase === "restricted" &&
      trialPhase.allowedSector &&
      sector.key !== trialPhase.allowedSector
    ) {
      toast({
        title: "Período de carência",
        description: `Faltam ${trialPhase.daysRemainingInPhase ?? 0} dias para o bloqueio total. Apenas a Sala de Vídeo está liberada até que o plano seja assinado.`,
        variant: "destructive",
      });
      return;
    }
    setSelectedSector(sector.key);
  };

  const getBookingRoutes = (sectorKey: string) => {
    return { single: `/booking/quadra?mode=single&sector=${sectorKey}`, multi: `/booking/quadra?mode=multi&sector=${sectorKey}` };
  };

  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.school_id) return;
    const schoolId = profile.school_id;
    const fetchSchool = () => {
      supabase
        .from("schools")
        .select("name, logo_url, subscription_status")
        .eq("id", schoolId)
        .single()
        .then(({ data }) => {
          if (data) {
            setSchoolName(data.name);
            setSchoolLogo((data as any).logo_url || null);
            setSubscriptionStatus((data as any).subscription_status ?? null);
          }
        });
    };
    fetchSchool();

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { schoolId?: string; status?: string } | undefined;
      if (!detail) {
        fetchSchool();
        return;
      }
      if (detail.schoolId && detail.schoolId !== schoolId) return;
      if (detail.status) {
        setSubscriptionStatus(detail.status);
      } else {
        fetchSchool();
      }
    };
    window.addEventListener("subscription-status-changed", handler);

    // Revalida ao voltar para a aba/janela
    const onFocus = () => fetchSchool();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchSchool();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // Polling periódico (a cada 30s) como fallback caso o evento não dispare
    const intervalId = window.setInterval(fetchSchool, 30000);

    return () => {
      window.removeEventListener("subscription-status-changed", handler);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [profile?.school_id]);

  // Agendamentos de hoje (escola do usuário) — para o sino piscar a partir das 00:01
  const [todayCount, setTodayCount] = useState<number>(0);
  const [ownSectorTodayCount, setOwnSectorTodayCount] = useState<number>(0);

  // Coordenadores responsáveis por um setor específico
  const COORD_SECTOR_OWN: Record<string, string> = {
    coord_informatica: "informatica",
    coord_biblioteca: "biblioteca",
    coord_lab_ciencias: "lab_ciencias",
    chef_projeto_vida: "projeto_vida",
  };
  const ownSectorKey = profile?.role ? COORD_SECTOR_OWN[profile.role] : undefined;
  const isGestor = profile?.role === "gestor_pedagogico";
  // Sirene azul+vermelha: APENAS para o chef da sala (dono do setor) com agendamento hoje
  const siren = !!ownSectorKey && ownSectorTodayCount > 0;
  // Pulso vermelho (mesmo do painel do gestor): gestor pedagógico com agendamento hoje
  const redPulse = isGestor && todayCount > 0;

  useEffect(() => {
    if (!profile?.school_id) return;
    let cancelled = false;
    const load = () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("school_id", profile.school_id)
        .eq("booking_date", todayStr)
        .eq("status", "confirmed")
        .then(({ count }) => {
          if (!cancelled) setTodayCount(count ?? 0);
        });
      if (ownSectorKey) {
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("school_id", profile.school_id)
          .eq("booking_date", todayStr)
          .eq("status", "confirmed")
          .eq("sector", ownSectorKey)
          .then(({ count }) => {
            if (!cancelled) setOwnSectorTodayCount(count ?? 0);
          });
      } else {
        if (!cancelled) setOwnSectorTodayCount(0);
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [profile?.school_id, ownSectorKey]);

  // 6 outer sectors arranged in 3x2 grid; the 7th sector goes in the center circle
  // Layout indices:
  //  0 (top-left)  | 1 (top-mid)    | 2 (top-right)
  //  3 (bot-left)  | 4 (bot-mid)    | 5 (bot-right)
  //  Center circle = index 6
  const outerSectors = [
    sectors[0], // informatica
    sectors[3], // biblioteca
    sectors[1], // quadra
    sectors[2], // patio
    sectors[5], // sala_professores
    sectors[6], // projeto_vida
  ];
  const centerSector = sectors[4]; // lab_ciencias

  const selectedSectorData = selectedSector ? sectors.find((s) => s.key === selectedSector) : null;
  const selectedRoutes = selectedSector ? getBookingRoutes(selectedSector) : null;
  const isSectorAvailable = selectedSectorData?.route !== null;

  return (
    <div
      className="relative flex flex-col h-dvh select-none overflow-hidden"
      style={{ background: "hsl(220, 60%, 8%)" }}
    >
      {/* Blue tint overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(160deg, hsla(220, 70%, 20%, 0.55) 0%, hsla(215, 65%, 28%, 0.50) 40%, hsla(225, 60%, 25%, 0.55) 100%)",
        }}
      />

      {/* Desce a GlobalToolbar (botões laranja) para abaixo do letreiro azul, sem alterar o fundo da página */}
      <TopBarOffset offset="48px" />
      {/* Header — botão voltar (esquerda) + card dourado padrão. Toolbar global fica top-right. */}
      <div className="relative z-10 px-3 pt-3 pb-1 sm:px-4">
        {/* Botão Voltar — mesmo estilo do GlobalBackButton */}
        <div className="fixed top-0 left-2 z-50 flex items-center rounded-xl bg-black/40 backdrop-blur-md shadow-lg ring-1 ring-white/10 animate-in fade-in slide-in-from-left-2 duration-500 h-11">
          <button
            id="sectors-back-btn"
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            title="Voltar"
            className="flex items-center justify-center h-full w-11 rounded-xl text-white/95 hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.4} />
          </button>
        </div>


        {/* Faixa azul decorativa entre Voltar e Toolbar (mesmo padrão das demais telas) */}
        <div
          className="fixed top-0 left-14 right-14 h-11 z-20 rounded-xl animate-in fade-in duration-500 flex items-center pl-3 pr-3"
          style={{
            background:
              "linear-gradient(90deg, hsl(220, 70%, 18%) 0%, hsl(205, 90%, 60%) 50%, hsl(220, 70%, 18%) 100%)",
            boxShadow: "0 4px 14px hsla(210, 90%, 40%, 0.35)",
          }}
        >
          <PanelTitleMarquee
            text={ROLE_PANEL_LABELS[profile?.role ?? ""] ?? "Painel"}
          />
        </div>

        {/* Card título — segue a mesma cor/textura/brilho dos botões de setor */}
        <div className="pt-16 sm:pl-14 sm:pr-36">
          <header
            className="relative overflow-hidden rounded-2xl px-2.5 py-4 sm:px-3 sm:py-5"
            style={{
              background: glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false),
              border: fx.idleBorder,
              boxShadow: fx.idleShadow,
              fontFamily: font.family,
            }}
          >
            {sheenTop}
            <div className="relative z-10 flex items-stretch gap-2 sm:gap-3">
              <div className="flex-1 min-w-0 flex items-start gap-2 sm:gap-3 flex-wrap sm:flex-nowrap -mt-1.5">
                {schoolLogo ? (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 ring-2 ring-white/30">
                    <img src={schoolLogo} alt={schoolName} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, hsla(${color.hueA}, ${color.satA}%, ${color.lightA + 15}%, 1), hsla(${color.hueB}, ${color.satB}%, ${color.lightB}%, 1))`,
                      boxShadow: `0 4px 12px hsla(${color.hueC}, 70%, 5%, 0.5)`,
                    }}
                  >
                    <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-base sm:text-lg font-extrabold leading-tight break-words sr-only">
                    Setores da Escola
                  </div>

                  <div className="text-white/90 text-xs sm:text-sm font-medium leading-snug min-w-0">
                    <p
                      title={schoolName}
                      className="text-white/95 text-sm sm:text-base font-bold leading-snug break-words"
                    >
                      {schoolName}
                    </p>
                    {profile?.full_name && (
                      <p className="text-white/75 text-[11px] sm:text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                        {profile.full_name.split(/\s+/).slice(0, 2).join(" ")}
                        {" · "}
                        {({
                          admin: "Administrador(a)",
                          teacher: "Professor(a)",
                          coord_pedagogico: "Coord. Pedagógico(a)",
                          supervisor: "Corpo de Alunos C.A",
                          secretario_escolar: "Assistente de Aluno",
                          gestor_pedagogico: "Gestor(a) Pedagógico(a)",
                          chef_projeto_vida: "Chef da Sala",
                        } as Record<string, string>)[profile.role] ?? profile.role}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Divisor + botão QR (20% à direita) — escaneia ao usar o ambiente */}
              <div className="w-px self-stretch bg-white/25" aria-hidden />
              {(profile?.role === "coord_pedagogico" || profile?.role === "gestor_pedagogico") && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate("/gestor/horarios")}
                    aria-label="Quadro de horários e sirenes"
                    title="Quadro de horários e sirenes"
                    className="shrink-0 w-10 sm:w-12 flex items-center justify-center rounded-xl text-white/95 hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <CalendarClock className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.2} style={{ filter: glowEnabled ? `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))` : undefined }} />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate("/qr-scan")}
                aria-label="Escanear QR code do ambiente"
                title="Escanear QR code do ambiente"
                className="shrink-0 w-12 sm:w-14 flex items-center justify-center rounded-xl text-white/95 hover:bg-white/10 active:scale-95 transition-all"
              >
                <QrCode className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={2.2} style={{ filter: glowEnabled ? `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))` : undefined }} />
              </button>


            </div>

          </header>
        </div>
      </div>


      {/* Title between header and sectors grid */}
      <div className="relative z-10 px-3 pt-2 pb-1 text-center">
        <h1
          className="text-white text-base sm:text-lg font-extrabold tracking-wide uppercase"
          style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}
        >
          Setores da Escola
        </h1>
        <p
          className="text-white/85 text-sm sm:text-base italic font-medium mt-1.5"
          style={{ textShadow: "0 1px 2px hsla(220, 90%, 5%, 0.7)" }}
        >
          Vamos agendar?
        </p>

      </div>

      {/* Main content area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-3">

        {/* 7 Sectors layout — 6 outer in 3x2 grid + 1 center circle (Lab. Ciências) */}
        <div className="w-full max-w-[94vw] sm:max-w-md -mt-2 sm:mt-4">
          <div className="relative" style={{ aspectRatio: "3 / 2.4" }}>
            {/*
              Mathematically symmetric cutout system.
              Every card gets the SAME radial cutout, with its CENTER fixed at
              the geometric center of the whole 3x2 grid (50% / 50% of the
              container). This guarantees that every card has an identical arc
              carved out facing the central round button — same radius, same
              curvature, same alignment on every side.

              Cutout radius is expressed in % of the container width so it
              scales with the layout, but is also clamped in px for safety.
            */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[6px]">
              {outerSectors.map((s, i) => {
                if (!s) return null;
                const Icon = s.icon;
                const isSelected = selectedSector === s.key;
                const animOrder = [3, 4, 5, 0, 1, 2];
                const delay = animOrder.indexOf(i) * 70;

                // Single uniform circular cutout for ALL 6 cards. Same radius
                // and same arc on every card so the gap around both the center
                // round button and the side Fonte/Cor buttons stays visually
                // identical (matches the reference screenshot).
                const cutCenters = [
                  "100% 100%", // 0 top-left
                  "50% 100%",  // 1 top-mid
                  "0% 100%",   // 2 top-right
                  "100% 0%",   // 3 bot-left
                  "50% 0%",    // 4 bot-mid
                  "0% 0%",     // 5 bot-right
                ];
                // Top-mid (Biblioteca, i=1) and bot-mid (Sala dos Professores, i=4)
                // get a slightly larger cutout so the gap above/below the central
                // round button matches the lateral gaps of Fonte/Cor.
                const baseRadius = isSm ? 44 : 40;
                const midRadius = isSm ? 62 : 58;
                const cutRadius = (i === 1 || i === 4) ? midRadius : baseRadius;
                const shapeStyle = {
                  WebkitMask: `radial-gradient(circle ${cutRadius}px at ${cutCenters[i]}, transparent 100%, black 100%)`,
                  mask: `radial-gradient(circle ${cutRadius}px at ${cutCenters[i]}, transparent 100%, black 100%)`,
                };

                return (
              <button
                    key={s.key}
                    onClick={() => handleSectorClick(s)}
                    className={`relative flex flex-col items-center justify-center gap-1 p-2 text-white transition-all duration-300 hover:brightness-125 active:scale-95 overflow-hidden ${isSelected ? "brightness-110" : ""} ${pulseAnim}`}
                    style={{
                      ...shapeStyle,
                      // Empurrar Biblioteca (i=1) para cima, Sala dos Professores (i=4) para baixo
                      // Fonte (i=0) para esquerda, Cor (i=2) para direita
                      transform: i === 0 ? "translateX(-10px)" : i === 1 ? "translateY(-8px)" : i === 2 ? "translateX(10px)" : i === 4 ? "translateY(8px)" : undefined,
                      animation: `sector-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
                      background: glowEnabled
                        ? (isSelected ? colorToGradient(color, true) : colorToGradient(color, false))
                        : colorToSolid(color, isSelected),
                      borderRadius: 18,
                      fontFamily: font.family,
                      transition: "box-shadow 0.35s cubic-bezier(0.4, 0, 0.2, 1), border 0.25s ease-out, transform 0.3s ease-out",
                      boxShadow: isSelected ? fx.selectedShadow : fx.idleShadow,
                      border: isSelected ? fx.selectedBorder : fx.idleBorder,
                    }}
                  >
                    {/* Faixa glossy superior — variável por modo de brilho */}
                    {sheenTop}
                    <Icon className="h-8 w-8 relative z-10" strokeWidth={1.6} style={{ filter: glowEnabled ? (fx.iconGlow ?? `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))`) : undefined, marginTop: i === 1 ? "-36px" : (i === 0 || i === 2) ? "-24px" : (i === 3 || i === 4 || i === 5) ? "44px" : undefined }} />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white relative z-10 text-center px-1 leading-tight" style={{ fontFamily: font.family, textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>{s.label}</span>
                    {!s.route && (
                      <span className="absolute top-1.5 right-1.5 text-[5px] text-white/50 px-1.5 py-0.5 font-semibold uppercase tracking-wider z-10" style={{ borderRadius: 6, background: "rgba(0,0,0,0.30)" }}>Breve</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Center circular button — Lab. Ciências (refined "chique" style) */}
            {centerSector && (() => {
              const s = centerSector;
              const Icon = s.icon;
              const isSelected = selectedSector === s.key;
              return (
                <div className="absolute left-1/2 top-1/2 z-20 h-[100px] w-[100px] -translate-x-1/2 -translate-y-1/2 sm:h-[108px] sm:w-[108px]">
                  <div
                    className="relative flex h-full w-full items-center justify-center"
                    style={{ animation: `sector-rise-center 0.5s cubic-bezier(0.22, 1, 0.36, 1) 420ms both` }}
                  >
                  {/* Outer luminous halo (skipped on low-perf devices) */}
                  {!lowPerf && (
                    <div
                      className="absolute left-1/2 top-1/2 h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none sector-center-halo sm:h-[140px] sm:w-[140px]"
                      style={{
                        background:
                          "radial-gradient(circle, hsla(210, 90%, 65%, 0.32) 0%, hsla(210, 90%, 55%, 0.10) 45%, transparent 72%)",
                      }}
                    />
                  )}
                  {/* Decorative conic outer ring (static on low-perf devices, skipped if reduced-motion) */}
                  {!lowPerf && (
                    <div
                      className="absolute left-1/2 top-1/2 h-[118px] w-[118px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none sm:h-[124px] sm:w-[124px]"
                      style={{
                        background:
                          "conic-gradient(from 220deg, hsla(210, 95%, 75%, 0.85), hsla(220, 60%, 30%, 0.05), hsla(210, 95%, 75%, 0.85))",
                        WebkitMask:
                          "radial-gradient(circle, transparent calc(50% - 6px), black calc(50% - 5px), black calc(50% - 2px), transparent calc(50% - 1px))",
                        mask:
                          "radial-gradient(circle, transparent calc(50% - 6px), black calc(50% - 5px), black calc(50% - 2px), transparent calc(50% - 1px))",
                      }}
                    />
                  )}
                  <button
                    ref={centerBtnRef}
                    onClick={() => handleSectorClick(s)}
                    className={`relative flex flex-col items-center justify-center rounded-full w-[100px] h-[100px] sm:w-[108px] sm:h-[108px] text-white transition-all duration-300 hover:brightness-125 active:scale-95 overflow-hidden ${isSelected ? "brightness-110" : ""} ${pulseAnim}`}
                    style={{
                      background: glowEnabled
                        ? (isSelected
                            ? "radial-gradient(circle at 30% 25%, hsla(210, 90%, 55%, 1) 0%, hsla(220, 75%, 30%, 1) 60%, hsla(225, 80%, 18%, 1) 100%)"
                            : "radial-gradient(circle at 30% 25%, hsla(210, 75%, 42%, 1) 0%, hsla(220, 70%, 22%, 1) 55%, hsla(225, 80%, 12%, 1) 100%)")
                        : (isSelected ? "hsl(210, 70%, 38%)" : "hsl(220, 55%, 22%)"),
                      boxShadow: isSelected ? fx.selectedShadow : fx.idleShadow,
                      border: isSelected ? fx.selectedBorder : fx.idleBorder,
                    }}
                  >
                    {/* Faixa glossy superior removida — botão sólido. */}

                    {/* Centered stack: icon + label, with safe inner padding to avoid touching edges */}
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-start gap-1 pt-5 sm:pt-6 px-2">
                      <Icon
                        className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                        strokeWidth={1.6}
                        style={{ filter: glowEnabled ? (fx.iconGlow ?? "drop-shadow(0 0 8px hsla(210, 95%, 70%, 0.65))") : undefined }}
                      />
                      <span
                        className="text-[12px] sm:text-[13px] font-extrabold uppercase tracking-[0.04em] text-white leading-[1.1] text-center max-w-full break-words hyphens-auto"
                        style={{ textShadow: "0 1px 4px hsla(220, 90%, 5%, 0.8)" }}
                      >
                        {s.label}
                      </span>
                    </div>
                  </button>
                  {/* "Breve" badge — placed above the circle, centered, contained within viewport */}
                  {!s.route && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -top-2 text-[8px] text-white px-2 py-0.5 font-bold uppercase tracking-wider z-30 whitespace-nowrap pointer-events-none"
                      style={{
                        borderRadius: 999,
                        background: "linear-gradient(135deg, hsla(35, 95%, 55%, 0.98), hsla(25, 90%, 45%, 0.98))",
                        boxShadow: "0 2px 8px hsla(25, 90%, 25%, 0.55), 0 0 0 1.5px hsla(220, 60%, 8%, 0.6)",
                      }}
                    >
                      Breve
                    </span>
                  )}
                  </div>
                </div>
              );
            })()}

            {/*
              Floating circular buttons inside the half-moon cutouts above (Biblioteca)
              and below (Sala dos Professores) the central Lab. Ciências button.
              Centered horizontally; offset vertically so they hug the central
              button's border with a uniform gap matching the side gaps.
              Center button radius: 50px (mobile) / 54px (sm).
              New button radius:    23px (mobile) / 25px (sm).
              Distance center→new center: 50 + 8 (gap) + 23 = 81px.
            */}

            {/* Floating button — Brilho/Padrão toggle (LEFT of center). */}
            <div
              className="absolute top-1/2 z-30 -translate-y-1/2"
              style={{ right: `calc(50% + ${sideOffset}px)` }}
            >
              <div className="relative flex h-[74px] w-[32px] items-center justify-center sm:h-[80px] sm:w-[34px]" style={{ animation: `sector-rise-center 0.5s cubic-bezier(0.22, 1, 0.36, 1) 500ms both` }}>
                <button
                  ref={styleToggleBtnRef}
                  onClick={() => { setColorPickerOpen(false); cycleStyleMode(); }}
                  className="relative flex flex-col items-center justify-center w-[32px] h-[74px] sm:w-[34px] sm:h-[80px] text-white transition-all duration-300 hover:brightness-125 active:scale-95 overflow-hidden"
                  style={{
                    background: glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false),
                    boxShadow: fx.idleShadow,
                    border: fx.idleBorder,
                    fontFamily: font.family,
                    borderTopLeftRadius: 9999,
                    borderBottomLeftRadius: 9999,
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                  }}
                  aria-label={`Alternar estilo dos botões — atual: ${styleModeLabel}`}
                  title={`Estilo atual: ${styleModeLabel} — toque para alternar`}
                >
                  {/* faixa esbranquiçada removida */}

                  <Sparkles
                    className="h-4 w-4 sm:h-[18px] sm:w-[18px] relative z-10"
                    strokeWidth={1.8}
                    style={{
                      opacity: glowEnabled ? 1 : 0.6,
                      filter: glowEnabled ? `drop-shadow(0 0 4px hsla(${color.hueA}, 95%, 70%, 0.65))` : undefined,
                    }}
                  />
                  <span className="text-[7px] sm:text-[7.5px] font-extrabold uppercase tracking-[0.05em] text-white leading-[1] relative z-10 mt-0.5" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>
                    {styleModeLabel}
                  </span>
                </button>
              </div>
            </div>

            {/* Floating button — Colors (RIGHT of center). Compact D-shape that fits in the corridor. */}
            <div
              className="absolute top-1/2 z-30 -translate-y-1/2"
              style={{ left: `calc(50% + ${sideOffset}px)` }}
            >
              <div className="relative flex h-[74px] w-[32px] items-center justify-center sm:h-[80px] sm:w-[34px]" style={{ animation: `sector-rise-center 0.5s cubic-bezier(0.22, 1, 0.36, 1) 560ms both` }}>
                <button
                  ref={colorBtnRef}
                  onClick={() => { setFontPickerOpen(false); setColorPickerOpen((v) => !v); }}
                  className="relative flex flex-col items-center justify-center w-[32px] h-[74px] sm:w-[34px] sm:h-[80px] text-white transition-all duration-300 hover:brightness-125 active:scale-95 overflow-hidden"
                  style={{
                    background: glowEnabled ? colorToGradient(color, colorPickerOpen) : colorToSolid(color, colorPickerOpen),
                    boxShadow: fx.idleShadow,
                    border: fx.idleBorder,
                    fontFamily: font.family,
                    borderTopRightRadius: 9999,
                    borderBottomRightRadius: 9999,
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                  }}
                  aria-label="Escolher cor"
                >
                  {/* faixa esbranquiçada removida */}

                  <Palette className="h-4 w-4 sm:h-[18px] sm:w-[18px] relative z-10" strokeWidth={1.8} style={{ filter: glowEnabled ? `drop-shadow(0 0 4px hsla(${color.hueA}, 95%, 70%, 0.65))` : undefined }} />
                  <span className="text-[7px] sm:text-[7.5px] font-extrabold uppercase tracking-[0.05em] text-white leading-[1] relative z-10 mt-0.5" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>Cor</span>
                </button>
              </div>
              {colorPickerOpen && (() => {
                const currentIdx = Math.max(0, COLOR_OPTIONS.findIndex((c) => c.key === colorKey));
                return createPortal(
                  <div
                    className="fixed left-1/2 -translate-x-1/2 z-[100] w-[88vw] max-w-[300px] rounded-2xl p-3 shadow-2xl"
                    style={{
                      top: "180px",
                      background: "hsla(220, 60%, 10%, 0.96)",
                      border: `1px solid hsla(${color.hueA}, 60%, 50%, 0.35)`,
                      backdropFilter: "blur(8px)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/80">Cor</span>
                      <span className="text-xs font-black" style={{ color: `hsla(${color.hueA}, 90%, 75%, 1)` }}>
                        {color.label}
                      </span>
                    </div>
                    <div
                      className="relative h-3 rounded-full overflow-hidden"
                      style={{
                        background: `linear-gradient(to right, ${COLOR_OPTIONS.map(
                          (c) => `hsla(${c.hueA}, ${c.satA}%, ${c.lightA + 5}%, 1)`
                        ).join(", ")})`,
                      }}
                    >
                      <input
                        type="range"
                        min={0}
                        max={COLOR_OPTIONS.length - 1}
                        step={1}
                        value={currentIdx}
                        onChange={(e) => setColorKey(COLOR_OPTIONS[Number(e.target.value)].key)}
                        data-glow-keep
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        aria-label="Escolher cor"
                      />
                      <div
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white shadow-md transition-[left] duration-200 ease-out"
                        style={{
                          left: `calc(${(currentIdx / (COLOR_OPTIONS.length - 1)) * 100}% - 10px)`,
                          background: `linear-gradient(145deg, hsla(${color.hueA}, ${color.satA}%, ${color.lightA + 5}%, 1), hsla(${color.hueB}, ${color.satB}%, ${color.lightB}%, 1))`,
                        }}
                      />
                    </div>
                    <p className="text-[9px] text-white/50 text-center mt-2 px-1">Arraste para escolher a cor</p>
                  </div>,
                  document.body
                );
              })()}
            </div>

            {/* Visual debug overlay (?debug=spacing) — guides + gap labels */}
            {debugSpacing && (
              <div className="pointer-events-none absolute inset-0 z-50">
                {/* Vertical center axis */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-fuchsia-400/70" />
                {/* Horizontal center axis */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-fuchsia-400/70" />
                {/* Center button outline */}
                <div
                  className="absolute left-1/2 top-1/2 rounded-full border-2 border-lime-400/90 -translate-x-1/2 -translate-y-1/2"
                  style={{ width: centerRadius * 2, height: centerRadius * 2 }}
                />
                {/* Inner-edge guides for the side buttons */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 border-l-2 border-cyan-400/90"
                  style={{ left: `calc(50% - ${sideOffset}px)`, height: 76 }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 border-l-2 border-cyan-400/90"
                  style={{ left: `calc(50% + ${sideOffset}px)`, height: 76 }}
                />
                {/* Gap labels */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-full text-[10px] font-bold text-cyan-300 bg-black/70 px-1.5 py-0.5 rounded"
                  style={{ left: `calc(50% - ${centerRadius}px)`, marginTop: -36 }}
                >
                  ←{sideGap}px→
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-300 bg-black/70 px-1.5 py-0.5 rounded"
                  style={{ left: `calc(50% + ${centerRadius}px)`, marginTop: -36 }}
                >
                  ←{sideGap}px→
                </div>
                {/* Breakpoint + measurements panel */}
                <div className="absolute top-1 left-1 text-[10px] font-mono text-white bg-black/85 px-2 py-1 rounded leading-snug">
                  vw: {vw}px<br />
                  bp: {isSm ? "sm (≥640)" : "mobile"}<br />
                  center r: {centerRadius}px<br />
                  side offset: {sideOffset}px<br />
                  expected gap: <span className="text-lime-300">{sideGap}px</span>
                </div>
                {/* Live pass/fail badge */}
                {(() => {
                  const tolerance = 0.5;
                  const lg = measured?.leftGap;
                  const rg = measured?.rightGap;
                  const leftOk = lg !== undefined && Math.abs(lg - sideGap) <= tolerance;
                  const rightOk = rg !== undefined && Math.abs(rg - sideGap) <= tolerance;
                  const symOk = lg !== undefined && rg !== undefined && Math.abs(lg - rg) <= tolerance;
                  const allOk = leftOk && rightOk && symOk;
                  return (
                    <div
                      className="absolute top-1 right-1 text-[10px] font-mono text-white px-2 py-1 rounded leading-snug min-w-[140px]"
                      style={{
                        background: allOk ? "rgba(22,163,74,0.92)" : "rgba(220,38,38,0.92)",
                        boxShadow: `0 0 0 2px ${allOk ? "rgba(134,239,172,0.7)" : "rgba(254,202,202,0.7)"}`,
                      }}
                    >
                      <div className="font-extrabold uppercase tracking-wider text-center mb-0.5">
                        {allOk ? "✓ PASS" : "✗ FAIL"}
                      </div>
                      <div>
                        L: <span className={leftOk ? "text-lime-200" : "text-yellow-200"}>{lg ?? "—"}px</span>
                      </div>
                      <div>
                        R: <span className={rightOk ? "text-lime-200" : "text-yellow-200"}>{rg ?? "—"}px</span>
                      </div>
                      <div>
                        Δ: <span className={symOk ? "text-lime-200" : "text-yellow-200"}>
                          {lg !== undefined && rg !== undefined ? Math.round(Math.abs(lg - rg) * 10) / 10 : "—"}px
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Quick action buttons — mesma textura/brilho dos botões dos setores */}
        <div className="flex items-stretch gap-2 w-full max-w-[94vw] sm:max-w-md mt-10 pb-4" style={{ animation: "sector-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) 350ms both" }}>
          <div className="flex-1 flex flex-col gap-2">
            <button
              onClick={() => navigate("/profile")}
              className={`relative w-full flex items-center justify-center py-2.5 px-2 text-white text-xs font-bold uppercase tracking-wider hover:brightness-125 transition-all active:scale-95 overflow-hidden ${pulseAnim}`}
              style={{
                background: glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false),
                borderRadius: 18,
                fontFamily: font.family,
                boxShadow: fx.idleShadow,
                border: fx.idleBorder,
              }}
            >
              {sheenTop}
              <span className="relative z-10 text-center leading-tight" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>Meus Dados</span>
            </button>
            <button
              onClick={() => navigate("/profile/solicitacoes")}
              className={`relative w-full flex items-center justify-center py-2.5 px-2 text-white text-xs font-bold uppercase tracking-wider hover:brightness-125 transition-all active:scale-95 overflow-hidden ${pulseAnim}`}
              style={{
                background: glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false),
                borderRadius: 18,
                fontFamily: font.family,
                boxShadow: fx.idleShadow,
                border: fx.idleBorder,
              }}
            >
              {sheenTop}
              <span className="relative z-10 text-center leading-tight" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>Minhas Solicitações</span>
            </button>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <button
              onClick={() => { markChatSeen(); navigate("/messages"); }}
              aria-label={`Bate-papo${chatUnread > 0 ? ` (${chatUnread} nova${chatUnread === 1 ? "" : "s"})` : ""}`}
              className={`relative w-full flex items-center justify-center gap-1.5 py-2.5 px-2 text-white text-xs font-bold uppercase tracking-wider hover:brightness-125 transition-all active:scale-95 overflow-hidden ${pulseAnim}`}
              style={{
                background: glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false),
                borderRadius: 18,
                fontFamily: font.family,
                boxShadow: fx.idleShadow,
                border: fx.idleBorder,
              }}
            >
              {sheenTop}
              <span className="relative z-10 text-center leading-tight" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>Bate-papo</span>

              {chatUnread > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-md z-10 animate-pulse">
                  {chatUnread > 9 ? "9+" : chatUnread}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("/booking/quadra/lista")}
              className={`relative w-full flex items-center justify-center gap-1.5 py-2.5 px-2 text-white text-xs font-bold uppercase tracking-wider hover:brightness-125 transition-all active:scale-95 overflow-hidden ${pulseAnim}`}
              style={{
                background: glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false),
                borderRadius: 18,
                fontFamily: font.family,
                boxShadow: fx.idleShadow,
                border: fx.idleBorder,
              }}
            >
              {sheenTop}
              <span className="relative z-10 text-center leading-tight" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>Agendamento<br />por Setor</span>

            </button>
          </div>


          <button
            onClick={() => navigate("/today-bookings")}
            aria-label={`Agendamentos de hoje${todayCount > 0 ? ` (${todayCount})` : ""}`}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 text-white text-xs font-bold uppercase tracking-wider hover:brightness-125 transition-all active:scale-95 overflow-hidden ${siren ? "animate-police-siren" : redPulse ? "animate-pulse" : todayCount > 0 ? "animate-upcoming-pulse" : pulseAnim}`}
            style={{
              background: siren
                ? undefined
                : redPulse
                ? "linear-gradient(135deg, hsl(0, 85%, 55%), hsl(355, 80%, 42%))"
                : todayCount > 0
                ? undefined
                : (glowEnabled ? colorToGradient(color, false) : colorToSolid(color, false)),
              borderRadius: 18,
              fontFamily: font.family,
              boxShadow: redPulse
                ? "0 0 16px 3px hsla(0, 100%, 55%, 0.65), inset 0 0 10px hsla(0, 100%, 75%, 0.35)"
                : fx.idleShadow,
              border: redPulse
                ? "1.5px solid hsla(0, 90%, 75%, 0.7)"
                : fx.idleBorder,
            }}
          >
            {todayCount === 0 && sheenTop}
            <Bell className={`h-5 w-5 relative z-10 shrink-0 ${todayCount > 0 ? "animate-bounce" : ""}`} style={{ filter: glowEnabled ? (fx.iconGlow ?? `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))`) : undefined }} />

            <span className="relative z-10 text-center leading-tight" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>Agendamento<br />de Hoje</span>
            {todayCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-destructive text-[10px] font-bold flex items-center justify-center shadow-md z-10">
                {todayCount}
              </span>
            )}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-start gap-x-2 gap-y-1 pb-2 pl-3 pr-36">
          <LastUpdateBadge location="header" className="text-white/40 text-xs" />
          <LastUpdateBadge location="home" className="text-white/40 text-xs" />
        </div>

        <div className="absolute bottom-3 right-3 z-30">
          <button
            id="sectors-refresh-btn"
            type="button"
            onClick={() => {
              const force = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
              if (force) void force();
              else window.location.reload();
            }}
            aria-label="Atualizar"
            title="Atualizar app"
            className="flex items-center gap-2 h-11 px-5 rounded-xl bg-black/40 backdrop-blur-md ring-1 ring-white/10 text-white/95 hover:bg-white/10 active:scale-95 transition-all text-sm font-semibold shadow-lg"
          >
            <RefreshCw className="h-5 w-5" strokeWidth={2.2} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Booking type modal — centered with dark backdrop */}
      {selectedSector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sector-modal-title"
          style={{ animation: `${modalClosing ? "modal-backdrop-out" : "modal-backdrop-in"} 220ms ease-out both` }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={closeModal}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <div
            className="relative w-full max-w-md rounded-3xl p-6 sm:p-7"
            style={{
              background: "linear-gradient(160deg, hsla(220, 55%, 16%, 0.98), hsla(220, 60%, 10%, 0.98))",
              border: `1.5px solid hsla(${color.hueA}, 80%, 60%, 0.4)`,
              boxShadow: `0 0 0 1px hsla(${color.hueA}, 80%, 60%, 0.15), 0 20px 60px hsla(${color.hueC}, 80%, 4%, 0.8), 0 0 80px hsla(${color.hueA}, 70%, 40%, 0.25)`,
              animation: `${modalClosing ? "modal-pop-out" : "modal-pop-in"} 220ms cubic-bezier(0.22, 1, 0.36, 1) both`,
              fontFamily: font.family,
            }}
          >
            <button
              onClick={closeModal}
              aria-label="Fechar"
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-white transition-all hover:brightness-110 active:scale-95"
              style={{
                background: "linear-gradient(145deg, hsl(0, 85%, 58%), hsl(0, 90%, 48%))",
                border: "1.5px solid hsl(0, 95%, 72%)",
                boxShadow: "inset 0 1px 2px hsla(0, 100%, 85%, 0.5), inset 0 -2px 4px hsla(0, 90%, 25%, 0.6), 0 4px 12px hsla(0, 85%, 35%, 0.5)",
              }}
            >
              <X className="h-5 w-5" strokeWidth={3} style={{ filter: "drop-shadow(0 1px 2px hsla(0, 90%, 15%, 0.7))" }} />
            </button>

            {isSectorAvailable && selectedRoutes ? (
              <>
                <div className="flex flex-col items-center gap-1 mb-5 pt-1">
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Setor selecionado</p>
                  <h2
                    id="sector-modal-title"
                    className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight text-center break-words"
                  >
                    {selectedSectorData?.label}
                  </h2>
                  <p className="text-white/60 text-sm font-medium mt-1">Como deseja agendar?</p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => pickOption("single", selectedRoutes.single)}
                    className="relative w-full h-20 flex items-center justify-center text-white hover:brightness-125 transition-all active:scale-[0.98] overflow-hidden rounded-2xl"
                    style={{
                      background: "linear-gradient(145deg, hsl(220, 85%, 42%), hsl(225, 85%, 26%))",
                      boxShadow: selectedOption === "single"
                        ? "0 0 0 2px hsl(195, 100%, 65%), 0 0 18px 4px hsla(195, 100%, 60%, 0.9), 0 0 42px 10px hsla(200, 100%, 55%, 0.6), inset 0 0 14px hsla(195, 100%, 75%, 0.35)"
                        : "inset 0 1.5px 5px hsla(220, 90%, 75%, 0.35), inset 0 -2px 8px hsla(225, 85%, 5%, 0.55), 0 6px 20px hsla(225, 80%, 5%, 0.6)",
                      border: selectedOption === "single"
                        ? "2px solid hsl(195, 100%, 70%)"
                        : "1.5px solid hsla(220, 90%, 70%, 0.55)",
                    }}
                  >
                    <CalendarDays className="absolute left-5 h-8 w-8 z-10" style={{ filter: "drop-shadow(0 0 6px hsla(200, 95%, 70%, 0.65))" }} />
                    <div className="relative z-10 flex flex-col items-center text-center" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>
                      <span className="text-lg font-bold leading-tight">Agendamento</span>
                      <span className="text-2xl font-extrabold text-white leading-tight">Único</span>
                    </div>
                  </button>

                  <button
                    onClick={() => pickOption("multi", selectedRoutes.multi)}
                    className="relative w-full h-20 flex items-center justify-center text-white hover:brightness-125 transition-all active:scale-[0.98] overflow-hidden rounded-2xl"
                    style={{
                      background: "linear-gradient(145deg, hsl(220, 85%, 42%), hsl(225, 85%, 26%))",
                      boxShadow: selectedOption === "multi"
                        ? "0 0 0 2px hsl(195, 100%, 65%), 0 0 18px 4px hsla(195, 100%, 60%, 0.9), 0 0 42px 10px hsla(200, 100%, 55%, 0.6), inset 0 0 14px hsla(195, 100%, 75%, 0.35)"
                        : "inset 0 1.5px 5px hsla(220, 90%, 75%, 0.35), inset 0 -2px 8px hsla(225, 85%, 5%, 0.55), 0 6px 20px hsla(225, 80%, 5%, 0.6)",
                      border: selectedOption === "multi"
                        ? "2px solid hsl(195, 100%, 70%)"
                        : "1.5px solid hsla(220, 90%, 70%, 0.55)",
                    }}
                  >
                    <CalendarRange className="absolute left-5 h-8 w-8 z-10" style={{ filter: "drop-shadow(0 0 6px hsla(200, 95%, 70%, 0.65))" }} />
                    <div className="relative z-10 flex flex-col items-center text-center" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>
                      <span className="text-lg font-bold leading-tight">Agendamento</span>
                      <span className="text-2xl font-extrabold text-white leading-tight">Múltiplo</span>
                    </div>
                  </button>


                  <button
                    onClick={closeModal}
                    className="w-full h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-base transition-colors mt-1"
                  >
                    Voltar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4">
                <h2 id="sector-modal-title" className="text-xl font-bold text-white text-center break-words">
                  {selectedSectorData?.label} — Em breve!
                </h2>
                <button
                  onClick={closeModal}
                  className="w-full h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
                >
                  Voltar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes sector-rise {
          from { opacity: 0; transform: translateY(60px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sector-rise-center {
          from { opacity: 0; transform: translateY(60px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fab-color-cycle {
          0%, 100% { background: linear-gradient(145deg, hsla(215, 75%, 38%, 1), hsla(220, 70%, 28%, 1)); }
          50%      { background: linear-gradient(145deg, hsl(150, 75%, 45%), hsl(160, 80%, 35%)); }
        }
        .animate-fab-color-cycle {
          animation: fab-color-cycle 3.5s ease-in-out infinite;
        }
        @keyframes modal-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-pop-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes modal-backdrop-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modal-pop-out {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
