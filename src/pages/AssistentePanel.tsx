import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ClipboardCheck, Tv, CalendarDays, Users, Sun, Palette, Sparkles, GraduationCap, ArrowRightLeft, Minimize2, LogOut, Languages, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import AssistenteHeader from "@/components/AssistenteHeader";
import PainelTvLinkDialog from "@/components/PainelTvLinkDialog";
import { useLanguage } from "@/hooks/useLanguage";
import type { Language } from "@/lib/translations";


const BG = "hsl(220, 50%, 28%)"; // fundo fixo azul escuro

// Paleta idêntica à do Painel do Gestor (PanelColorSlider)
const COLORS = [
  { name: "Azul",        accent: "220 85% 50%" },
  { name: "Vermelho",    accent: "0 82% 52%" },
  { name: "Verde",       accent: "142 72% 42%" },
  { name: "Amarelo",     accent: "50 98% 55%" },
  { name: "Dourado",     accent: "40 90% 52%" },
  { name: "Ouro",        accent: "46 100% 55%" },
  { name: "Cinza",       accent: "220 10% 55%" },
  { name: "Bege",        accent: "38 45% 72%" },
  { name: "Roxo",        accent: "265 75% 50%" },
  { name: "Marrom",      accent: "25 55% 38%" },
  { name: "Azul Escuro", accent: "225 80% 28%" },
  { name: "Rosa",        accent: "335 85% 62%" },
  { name: "Lilás",       accent: "285 70% 70%" },
  { name: "Laranja",     accent: "25 95% 55%" },
];

const BRIGHTNESS = [0.7, 0.85, 1.0, 1.15, 1.3];

// Tipos de brilho aplicados nos botões
const GLOWS = [
  { name: "Sem brilho",   build: () => ({}) },
  { name: "Suave",        build: (a: string) => ({ boxShadow: `0 4px 14px hsl(${a} / 0.25)` }) },
  { name: "Neon",         build: (a: string) => ({ boxShadow: `0 0 18px hsl(${a} / 0.7), 0 0 32px hsl(${a} / 0.4)` }) },
  { name: "Halo",         build: (a: string) => ({ boxShadow: `0 0 0 3px hsl(${a} / 0.35), 0 8px 24px hsl(${a} / 0.4)` }) },
  { name: "Vidro",        build: (a: string) => ({ boxShadow: `inset 0 1px 0 hsl(0 0% 100% / 0.25), 0 10px 30px hsl(${a} / 0.35)` }) },
  { name: "Profundo",     build: (a: string) => ({ boxShadow: `0 14px 40px hsl(${a} / 0.55)` }) },
];

const COLOR_KEY = "assistente.colorIdx";
const BRIGHT_KEY = "assistente.brightIdx";
const GLOW_KEY = "assistente.glowIdx";

export default function AssistentePanel() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();

  const handleMinimize = () => {
    // Sair sem deslogar: mantém a sessão (notificações continuam), apenas fecha o painel.
    // Em PWA instalado tenta fechar a janela; caso contrário volta para a raiz.
    try { window.close(); } catch {}
    navigate("/");
  };

  const handleLogout = async () => {
    if (!confirm("Deslogar? Você vai precisar entrar com login e senha novamente e não receberá mais notificações.")) return;
    try { await supabase.auth.signOut(); } catch {}
    navigate("/auth", { replace: true });
  };
  const [todayCount, setTodayCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pulseNew, setPulseNew] = useState(false);
  const prevTodayRef = useRef<number | null>(null);

  // Painel de cores oculto (acessível por toque longo na engrenagem de brilho)
  const [showColorBar, setShowColorBar] = useState(false);
  const longPressRef = useRef<number | null>(null);

  const [showTvDialog, setShowTvDialog] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [colorIdx, setColorIdx] = useState<number>(() => {
    const s = Number(localStorage.getItem(COLOR_KEY));
    return s >= 0 && s < COLORS.length ? s : 0;
  });
  const [brightIdx, setBrightIdx] = useState<number>(() => {
    const s = Number(localStorage.getItem(BRIGHT_KEY));
    return s >= 0 && s < BRIGHTNESS.length ? s : 4; // padrão 130%
  });
  const [glowIdx, setGlowIdx] = useState<number>(() => {
    const s = Number(localStorage.getItem(GLOW_KEY));
    return s >= 0 && s < GLOWS.length ? s : 2;
  });
  useEffect(() => { localStorage.setItem(COLOR_KEY, String(colorIdx)); }, [colorIdx]);
  useEffect(() => { localStorage.setItem(BRIGHT_KEY, String(brightIdx)); }, [brightIdx]);
  useEffect(() => { localStorage.setItem(GLOW_KEY, String(glowIdx)); }, [glowIdx]);

  const color = COLORS[colorIdx];
  const bright = BRIGHTNESS[brightIdx];
  const glow = GLOWS[glowIdx];

  useEffect(() => {
    if (!profile?.school_id) return;
    const today = format(new Date(), "yyyy-MM-dd");
    let cancel = false;
    const load = async () => {
      const [{ count: t }, { count: a }] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .eq("school_id", profile.school_id).eq("booking_date", today).eq("status", "confirmed"),
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .eq("school_id", profile.school_id).gte("booking_date", today).eq("status", "confirmed"),
      ]);
      if (cancel) return;
      const newToday = t || 0;
      if (prevTodayRef.current !== null && newToday > prevTodayRef.current) {
        setPulseNew(true);
        setTimeout(() => setPulseNew(false), 8000);
      }
      prevTodayRef.current = newToday;
      setTodayCount(newToday);
      setTotalCount(a || 0);
    };
    load();
    const ch = supabase.channel(`assist-panel-${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `school_id=eq.${profile.school_id}` }, load)
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [profile?.school_id]);

  // Estilo glossy controlado pelos botões de configuração do rodapé
  const parseHsl = (hslStr: string) => {
    const [h, s, l] = hslStr.split(" ").map((v) => parseFloat(v));
    return { h, s, l };
  };
  const base = parseHsl(color.accent);
  const glowEnabled = glowIdx > 0;

  const cardGradient = () => {
    const c1 = `hsla(${base.h}, ${base.s}%, ${Math.min(100, base.l * bright + 8)}%, 1)`;
    const c2 = `hsla(${base.h}, ${base.s}%, ${Math.min(100, base.l * bright)}%, 1)`;
    const c3 = `hsla(${base.h}, ${Math.max(0, base.s - 10)}%, ${Math.min(100, base.l * bright - 6)}%, 1)`;
    return `linear-gradient(145deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`;
  };
  const cardSolid = () => `hsl(${base.h}, ${base.s}%, ${Math.min(100, base.l * bright)}%)`;

  const tileBase =
    "relative flex flex-col items-center justify-center gap-1 px-2 py-3 text-white font-bold overflow-hidden transition-all active:scale-[0.97]";
  const tileStyleFor = (): React.CSSProperties => {
    const enhancedGlow: React.CSSProperties =
      glowIdx === 0
        ? { boxShadow: "0 2px 6px hsla(220, 80%, 5%, 0.4)" }
        : glowIdx === 1
          ? { boxShadow: `0 4px 14px hsl(${color.accent} / ${0.25 * bright})` }
          : glowIdx === 2
            ? { boxShadow: `0 0 18px hsl(${color.accent} / ${0.7 * bright}), 0 0 32px hsl(${color.accent} / ${0.4 * bright})` }
            : glowIdx === 3
              ? { boxShadow: `0 0 0 3px hsl(${color.accent} / ${0.35 * bright}), 0 8px 24px hsl(${color.accent} / ${0.4 * bright})` }
              : glowIdx === 4
                ? { boxShadow: `inset 0 1px 0 hsl(0 0% 100% / 0.25), 0 10px 30px hsl(${color.accent} / ${0.35 * bright})` }
                : { boxShadow: `0 14px 40px hsl(${color.accent} / ${0.55 * bright})` };
    return {
      background: cardGradient(),
      borderRadius: 16,
      minHeight: 92,
      border: `1px solid hsla(${base.h}, ${base.s}%, 85%, 0.45)`,
      ...enhancedGlow,
      textShadow: "0 1px 2px hsla(220,90%,5%,0.7)",
    };
  };

  const Gloss = () => (
    <span
      aria-hidden
      className="absolute inset-x-1 top-0.5 h-2.5 rounded-full pointer-events-none"
      style={{
        background: "linear-gradient(180deg, hsla(0,0%,100%,0.32) 0%, transparent 100%)",
        filter: "blur(1.5px)",
      }}
    />
  );

  const labelClass = "relative z-10 text-[13px] leading-tight text-center px-1";
  const subClass = "relative z-10 text-[10px] opacity-85 font-medium leading-tight text-center px-1";

  return (
    <div className="min-h-dvh text-white flex flex-col" style={{ background: BG }}>
      <AssistenteHeader />

      <main className="flex-1 px-3 pb-3 pt-4">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => navigate("/controle-presenca")} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <ClipboardCheck className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Presença do Professor</span>
          </button>

          <button onClick={() => navigate("/assistente/quadro")} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <GraduationCap className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Meu Quadro de Professores</span>
            <span className={subClass}>Cadastrar / ausência</span>
          </button>

          <button
            onClick={() => navigate("/today-bookings")}
            className={`${tileBase} ${pulseNew ? "animate-pulse ring-2 ring-amber-300" : ""}`}
            style={tileStyleFor()}
          >
            <Gloss />
            <CalendarDays className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Agendamentos do Dia</span>
            {todayCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[22px] h-5 px-1.5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-black flex items-center justify-center animate-pulse shadow-md z-20">
                {todayCount}
              </span>
            )}
          </button>

          <button onClick={() => navigate("/sectors")} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <CalendarDays className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Todos os Agendamentos</span>
            {totalCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[22px] h-5 px-1.5 rounded-full bg-white text-foreground text-[11px] font-black flex items-center justify-center animate-pulse shadow-md z-20">
                {totalCount}
              </span>
            )}
          </button>

          <button onClick={() => navigate("/relatorios-presenca")} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <Users className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Horários de Outros Assistentes</span>
          </button>

          <button onClick={() => navigate("/assistente/transferir-salas")} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <ArrowRightLeft className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Transferir minhas salas</span>
          </button>

          <button onClick={() => navigate("/assistente/remanejamentos")} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <ArrowUp className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Remanejamentos do Dia</span>
            <span className={subClass}>Coberturas por hierarquia</span>
          </button>


          <button onClick={() => setShowTvDialog(true)} className={tileBase} style={tileStyleFor()}>
            <Gloss />
            <Tv className="relative z-10 h-7 w-7" strokeWidth={2} />
            <span className={labelClass}>Painel TV</span>
          </button>
        </div>

        <PainelTvLinkDialog
          open={showTvDialog}
          onOpenChange={setShowTvDialog}
          schoolId={profile?.school_id}
          accent="blue"
        />
      </main>


      {/* Rodapé unificado — 5 botões de mesmo tamanho + Deslogar menor/vermelho */}
      <footer className="px-3 pb-8 pt-2 mt-0 mb-6">
        {/* linha da paleta de cores (surge só quando o usuário abre) */}
        {showColorBar && (
          <div className="mb-2 flex items-center gap-2 px-3 h-10 rounded-full bg-black/40 backdrop-blur border border-white/20">
            <button
              onClick={() => setShowColorBar(false)}
              className="shrink-0 active:scale-95"
              aria-label="Ocultar cores"
            >
              <Palette className="h-4 w-4" style={{ color: `hsl(${color.accent})` }} />
            </button>
            <div
              className="relative flex-1 h-2 rounded-full overflow-hidden"
              style={{ background: `linear-gradient(to right, ${COLORS.map((c) => `hsl(${c.accent})`).join(", ")})` }}
            >
              <input
                type="range"
                min={0}
                max={COLORS.length - 1}
                step={1}
                value={colorIdx}
                onChange={(e) => setColorIdx(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Cor dos botões"
              />
              <div
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white shadow-md transition-[left] duration-150"
                style={{
                  left: `calc(${(colorIdx / (COLORS.length - 1)) * 100}% - 8px)`,
                  background: `hsl(${color.accent})`,
                }}
              />
            </div>
            <span className="text-[11px] font-black min-w-[52px] text-right">{color.name}</span>
          </div>
        )}

        {/* Grade uniforme: 5 botões iguais em flex-1 + Deslogar (menor + vermelho) */}
        <div className="flex items-stretch gap-2">
          {/* Idioma — clique cicla PT → EN → ES */}
          <button
            onClick={() => {
              const order: Language[] = ["pt", "en", "es"];
              const next = order[(order.indexOf(language) + 1) % order.length];
              setLanguage(next);
            }}
            className="flex-1 basis-0 h-11 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-[11px] font-black uppercase active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
            aria-label={`Idioma (atual ${language})`}
            title="Idioma do aplicativo (não afeta o Painel TV)"
          >
            <Languages className="h-4 w-4" />
            <span>{language.toUpperCase()}</span>
          </button>

          {/* Brilho */}
          <button
            onClick={() => setBrightIdx((i) => (i + 1) % BRIGHTNESS.length)}
            className="flex-1 basis-0 h-11 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-[11px] font-black uppercase active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
            aria-label="Intensidade do brilho"
          >
            <Sun className="h-4 w-4" />
            <span>{Math.round(bright * 100)}%</span>
          </button>

          {/* Estilo de brilho */}
          <button
            onClick={() => setGlowIdx((i) => (i + 1) % GLOWS.length)}
            className="flex-1 basis-0 h-11 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-[10px] font-black uppercase active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
            aria-label="Tipo de brilho"
          >
            <Sparkles className="h-4 w-4" />
            <span className="truncate max-w-full px-1">{glow.name}</span>
          </button>

          {/* Cor */}
          <button
            onClick={() => setShowColorBar((v) => !v)}
            className="flex-1 basis-0 h-11 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-[11px] font-black uppercase active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
            aria-label="Mostrar cores"
          >
            <Palette className="h-4 w-4" style={{ color: `hsl(${color.accent})` }} />
            <span>Cor</span>
          </button>

          {/* Sair (minimiza — mantém sessão) */}
          <button
            onClick={handleMinimize}
            className="flex-1 basis-0 h-11 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-[11px] font-black uppercase active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
            aria-label="Sair (minimizar)"
            title="Fecha o painel sem deslogar — continua recebendo notificações"
          >
            <Minimize2 className="h-4 w-4" />
            <span>Sair</span>
          </button>

          {/* Deslogar — menor, vermelho, requer confirmação */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-14 shrink-0 h-11 rounded-xl bg-red-600/85 border border-red-300/60 text-[9px] font-black uppercase active:scale-95 transition flex flex-col items-center justify-center gap-0.5 text-white shadow-[0_0_10px_hsla(0,80%,55%,0.4)]"
            aria-label="Deslogar"
            title="Encerra a sessão — precisará entrar com login e senha novamente"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Deslogar</span>
          </button>
        </div>
      </footer>

      {/* Modal de confirmação para Deslogar */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white text-slate-900 p-5 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-11 w-11 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black text-lg leading-tight">Deseja sair realmente?</p>
                <p className="text-xs text-slate-500">Encerrar sessão do aplicativo</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-4">
              Caso desejar sair, você <b>terá que fazer novamente login e senha</b> para voltar.
              Enquanto estiver deslogado(a), o aplicativo <b>não vai receber notificações</b>.
              <br />
              <span className="text-slate-500">
                Se você quer apenas fechar sem perder as notificações, use o botão <b>Sair</b>.
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-slate-300 font-bold text-slate-700 active:scale-95 transition"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  try { await supabase.auth.signOut(); } catch {}
                  navigate("/auth", { replace: true });
                }}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white font-black active:scale-95 transition"
              >
                Sim, deslogar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
