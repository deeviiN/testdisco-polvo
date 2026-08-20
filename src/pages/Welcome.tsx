import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  LogIn,
  Sparkles,
  Settings,
  Globe,
  Sun,
  Moon,
  Palette,
  Headphones,
  LogOut,
  Zap,
  Users,
  CalendarCheck,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import AppBreadcrumbs from "@/components/AppBreadcrumbs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AppearanceSettings from "@/components/AppearanceSettings";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { languageLabels, Language } from "@/lib/translations";
import { toast } from "sonner";
import quadraImg from "@/assets/welcome/quadra.jpg";
import salaVideoImg from "@/assets/welcome/sala-video.jpg";
import laboratorioImg from "@/assets/welcome/laboratorio.jpg";
import bibliotecaImg from "@/assets/welcome/biblioteca.jpg";
import VersionFooter from "@/components/VersionFooter";

const SLIDES = [
  { src: quadraImg, label: "Quadra Esportiva" },
  { src: salaVideoImg, label: "Sala de Vídeo" },
  { src: laboratorioImg, label: "Laboratório de Ciências" },
  { src: bibliotecaImg, label: "Biblioteca" },
];

const TRUST_BADGES = [
  { icon: Zap, label: "Tempo real" },
  { icon: Users, label: "Multiusuário" },
  { icon: CalendarCheck, label: "Gestão inteligente" },
];

const Welcome = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language, setLanguage, t } = useLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [slideIndex, setSlideIndex] = useState(0);
  const [schoolData, setSchoolData] = useState<{ id: string; name: string; logo_url: string | null; inep_code: string | null } | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [confirmReloadOpen, setConfirmReloadOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setHasSession(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);
  const handleSignOut = async () => {
    if (!confirm("Deseja realmente sair da sua conta?")) return;
    try { await supabase.auth.signOut(); } finally { window.location.replace("/auth"); }
  };

  useEffect(() => {
    const schoolId = searchParams.get("school");
    if (schoolId) {
      supabase.rpc("get_school_public_info", { _school_id: schoolId }).then(({ data }) => {
        if (data && data.length > 0) setSchoolData(data[0]);
      });
    }
  }, [searchParams]);

  useEffect(() => {
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const currentSlide = SLIDES[slideIndex];
  const schoolQS = schoolData ? `?school=${schoolData.id}` : "";

  const goAuth = (mode: "login" | "signup") => {
    const sep = schoolQS ? "&" : "?";
    navigate(`/auth${schoolQS}${sep}mode=${mode}`);
  };

  return (
    <div
      className="relative flex flex-col items-center justify-between h-dvh px-6 py-6 select-none overflow-hidden bg-[hsl(220,60%,8%)]"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif" }}
    >
      {/* Background slideshow */}
      <div className="absolute inset-0 overflow-hidden">
        {SLIDES.map((slide, i) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.label}
            width={1280}
            height={1920}
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
              i === slideIndex ? "opacity-100 animate-[kenburns_10s_ease-out_forwards]" : "opacity-0"
            }`}
            style={{ willChange: "transform, opacity" }}
          />
        ))}
      </div>

      {/* Layered ambient gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(160deg, hsla(220,90%,10%,0.88) 0%, hsla(218,80%,16%,0.78) 45%, hsla(225,85%,8%,0.94) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, hsla(220,90%,4%,0.9) 0%, transparent 100%)",
        }}
      />

      {/* Soft animated ambient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl animate-[ambient-drift_18s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(circle, hsla(215,90%,55%,0.55), transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 left-1/2 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl animate-[ambient-drift_26s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(circle, hsla(260,90%,65%,0.45), transparent 70%)" }}
        />
      </div>

      <style>{`
        @keyframes kenburns {
          0% { transform: scale(1.05) translate(0,0); }
          100% { transform: scale(1.18) translate(-2%, -1.5%); }
        }
        @keyframes ambient-drift {
          0%,100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(40px,-30px) scale(1.08); }
        }
        @keyframes hero-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .premium-cta {
          background:
            linear-gradient(135deg, hsla(215,85%,55%,0.35) 0%, hsla(220,80%,40%,0.55) 100%);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          box-shadow:
            inset 0 1px 0 hsla(0,0%,100%,0.18),
            inset 0 -1px 0 hsla(220,90%,15%,0.4),
            0 8px 24px -6px hsla(215,90%,25%,0.55),
            0 2px 6px hsla(220,90%,10%,0.4);
          transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, background 0.35s ease;
        }
        .premium-cta:hover {
          transform: translateY(-1.5px);
          background:
            linear-gradient(135deg, hsla(215,90%,60%,0.45) 0%, hsla(220,85%,45%,0.65) 100%);
          box-shadow:
            inset 0 1px 0 hsla(0,0%,100%,0.25),
            inset 0 -1px 0 hsla(220,90%,15%,0.5),
            0 14px 32px -6px hsla(215,90%,30%,0.7),
            0 4px 10px hsla(220,90%,10%,0.5);
        }
        .premium-cta:active { transform: translateY(0) scale(0.99); }
        .premium-secondary {
          background: hsla(0,0%,100%,0.06);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid hsla(0,0%,100%,0.14);
          transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), background 0.3s ease, border-color 0.3s ease;
        }
        .premium-secondary:hover {
          transform: translateY(-1.5px);
          background: hsla(0,0%,100%,0.11);
          border-color: hsla(0,0%,100%,0.22);
        }
        .hero-card {
          background: hsla(0,0%,100%,0.055);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid hsla(0,0%,100%,0.12);
          box-shadow:
            inset 0 1px 0 hsla(0,0%,100%,0.18),
            inset 0 0 60px hsla(215,90%,70%,0.04),
            0 24px 60px -20px hsla(220,90%,5%,0.7),
            0 8px 24px -8px hsla(220,90%,5%,0.45);
          position: relative;
          overflow: hidden;
        }
        .toolbar-chip {
          background: hsla(0,0%,100%,0.06);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border: 1px solid hsla(0,0%,100%,0.1);
          transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
        }
        .toolbar-chip:hover {
          background: hsla(0,0%,100%,0.12);
          border-color: hsla(0,0%,100%,0.2);
          transform: translateY(-1px);
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-card::before { animation: none !important; display: none; }
          .premium-cta,
          .premium-secondary,
          .toolbar-chip { transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
          .premium-cta:hover,
          .premium-secondary:hover,
          .toolbar-chip:hover { transform: none !important; }
          .premium-cta:active { transform: none !important; }
          .animate-fade-in,
          .animate-pulse,
          [class*="animate-[kenburns"],
          [class*="animate-[ambient-drift"] {
            animation: none !important;
          }
        }
      `}</style>

      {/* Top toolbar: Settings */}
      <div className="relative z-10 w-full flex justify-end items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConfirmReloadOpen(true)}
          className="toolbar-chip w-9 h-9 rounded-xl flex items-center justify-center text-white/80 hover:text-white"
          title="Atualizar"
          aria-label="Atualizar página"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="toolbar-chip w-9 h-9 rounded-xl flex items-center justify-center text-white/80 hover:text-white"
              title={t("toolbar.settings")}
              aria-label={t("toolbar.settings")}
            >
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{t("toolbar.settings")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe className="mr-2 h-4 w-4" />
                {t("toolbar.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent {...{ side: "left", align: "start", collisionPadding: 8 } as any}>
                {(Object.keys(languageLabels) as Language[]).map((lang) => (
                  <DropdownMenuItem
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={language === lang ? "bg-accent font-semibold" : ""}
                  >
                    {languageLabels[lang]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {resolvedTheme === "dark" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                {t("toolbar.theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent {...{ side: "left", align: "start", collisionPadding: 8 } as any}>
                <DropdownMenuItem onClick={() => setTheme("light")} className={resolvedTheme === "light" && theme !== "system" ? "bg-accent font-semibold" : ""}>
                  <Sun className="mr-2 h-4 w-4" /> {t("toolbar.lightMode")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className={resolvedTheme === "dark" && theme !== "system" ? "bg-accent font-semibold" : ""}>
                  <Moon className="mr-2 h-4 w-4" /> {t("toolbar.darkMode")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <AppearanceSettings
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Palette className="mr-2 h-4 w-4" />
                  {t("settings.appearance")}
                </DropdownMenuItem>
              }
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.open("https://wa.me/5511925686565", "_blank")}>
              <Headphones className="mr-2 h-4 w-4" />
              {t("settings.support")}
            </DropdownMenuItem>
            {hasSession && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-500 focus:text-red-500">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair da conta
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AppBreadcrumbs className="relative z-10" />

      {/* Hero glass card */}
      <div className="relative z-10 w-full max-w-md mx-auto mt-6 animate-fade-in">
        <div className="hero-card rounded-3xl px-5 py-4 flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.32em] text-white/75 font-semibold border border-white/15 rounded-full px-3 py-1 bg-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Bem-vindo ao
          </span>

          <h1
            className="text-white text-[3.25rem] sm:text-[3.6rem] font-extrabold tracking-tight leading-[0.95] drop-shadow-[0_4px_20px_rgba(0,0,0,0.7)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            <span className="agenschool-spotlight">
              AgenSchool
            </span>
          </h1>

          <p className="text-white/55 text-[10px] uppercase tracking-[0.32em] font-semibold">
            plataforma saas
          </p>
          <p className="text-white/55 text-[10px] uppercase tracking-[0.32em] font-semibold">
            agendamento inteligente de ambientes escolares
          </p>

          <p className="text-white/85 text-sm sm:text-[15px] max-w-[22rem] leading-snug font-medium">
            Reserve quadras, laboratórios, salas de vídeo e bibliotecas em poucos toques — com agenda em tempo real para toda a sua escola.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-white/80 bg-white/8 border border-white/12 rounded-full px-2.5 py-1 backdrop-blur-sm"
              >
                <Icon className="h-3 w-3 text-amber-300" strokeWidth={2.4} />
                {label}
              </span>
            ))}
          </div>

          {/* Slide indicators inside card */}
          <div className="flex items-center gap-1.5 pt-1">
            {SLIDES.map((s, i) => (
              <button
                key={s.src}
                type="button"
                aria-label={`Ir para ${s.label}`}
                onClick={() => setSlideIndex(i)}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === slideIndex ? "w-7 bg-amber-300" : "w-1 bg-white/30 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
          <p className="text-white/55 text-[10px] font-medium tracking-[0.22em] uppercase">
            {currentSlide.label}
          </p>
        </div>
      </div>

      {/* Bottom CTA — Entrar + Cadastrar */}
      <div className="relative z-10 flex flex-col items-center gap-2.5 w-full max-w-sm animate-fade-in">
        <Button
          type="button"
          onClick={() => goAuth("login")}
          className="premium-cta w-full h-14 rounded-2xl font-bold text-[15px] uppercase tracking-[0.18em] gap-2 border border-white/20 text-white hover:text-white"
        >
          <LogIn className="h-5 w-5" />
          Entrar
        </Button>
        <Button
          type="button"
          onClick={() => goAuth("signup")}
          className="premium-secondary w-full h-14 rounded-2xl text-white font-semibold text-[15px] uppercase tracking-[0.18em] gap-2 hover:text-white"
        >
          <Sparkles className="h-5 w-5" />
          Cadastrar
        </Button>
      <VersionFooter />
      </div>
      {/* Dialog de confirmação antes de recarregar */}
      <Dialog open={confirmReloadOpen} onOpenChange={setConfirmReloadOpen}>
        <DialogContent className="max-w-sm bg-[hsl(220,50%,14%)] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Recarregar página?
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              Todos os dados preenchidos serão perdidos. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmReloadOpen(false)}
              className="flex-1 h-11 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => window.location.reload()}
              className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white font-bold"
            >
              Recarregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Welcome;
