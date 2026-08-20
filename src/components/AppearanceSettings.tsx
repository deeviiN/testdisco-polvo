import { cloneElement, isValidElement, useCallback, useState } from "react";
import { Palette, RotateCcw, Check, MousePointerClick, LayoutGrid, Sun, Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCustomColors } from "@/hooks/useCustomColors";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function HueSlider({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <div className="relative w-full h-8 rounded-xl overflow-hidden border border-border">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, hsl(0,80%,50%), hsl(30,80%,50%), hsl(60,80%,50%), hsl(90,80%,50%), hsl(120,80%,50%), hsl(150,80%,50%), hsl(180,80%,50%), hsl(210,80%,50%), hsl(240,80%,50%), hsl(270,80%,50%), hsl(300,80%,50%), hsl(330,80%,50%), hsl(360,80%,50%))",
        }}
      />
      <input
        type="range"
        min={0}
        max={360}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <div
        className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
        style={{
          left: `calc(${(value / 360) * 100}% - 10px)`,
          background: `hsl(${value}, 80%, 50%)`,
        }}
      />
    </div>
  );
}

function LivePreview({
  primary,
  background,
  theme,
}: {
  primary: string;
  background: string;
  theme: "light" | "dark" | "system";
}) {
  // Resolve dark mode efetivo (system → preferência do SO)
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const primaryHsl = primary || "250 84% 54%";
  const bgHsl =
    background || (isDark ? "230 25% 7%" : "0 0% 100%");
  const lightness = parseInt((bgHsl.split(" ")[2] || "50").replace("%", ""));
  const isDarkBg = lightness < 55;
  const fg = isDarkBg ? "0 0% 100%" : "230 25% 12%";
  const muted = isDarkBg ? "0 0% 100% / 0.65" : "230 15% 40%";
  const border = isDarkBg ? "0 0% 100% / 0.12" : "230 15% 88%";

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
          Preview ao vivo
        </h3>
        <span className="text-[11px] text-muted-foreground font-medium">
          {isDark ? "Modo escuro" : "Modo claro"}
        </span>
      </div>
      <div
        className="rounded-2xl overflow-hidden ring-1 shadow-sm"
        style={{
          background: `hsl(${bgHsl})`,
          color: `hsl(${fg})`,
          ['--_border' as any]: `hsl(${border})`,
          boxShadow: `0 0 0 1px hsl(${border})`,
        }}
      >
        {/* Cabeçalho simulado */}
        <div
          className="px-3 py-2.5 flex items-center gap-2"
          style={{
            background: `hsl(${primaryHsl})`,
            color: "white",
          }}
        >
          <div className="h-7 w-7 rounded-full bg-white/20 ring-1 ring-white/30 flex items-center justify-center text-[11px] font-bold">
            E
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold leading-tight truncate">
              Escola Modelo
            </p>
            <p className="text-[9px] opacity-80 leading-tight">
              Painel · Hoje
            </p>
          </div>
          <div className="h-2 w-2 rounded-full bg-white/80" />
        </div>

        {/* Corpo */}
        <div className="p-3 space-y-2.5">
          <p className="text-[11px] font-semibold leading-snug">
            Bem-vindo de volta
          </p>
          <p className="text-[10px] leading-snug" style={{ color: `hsl(${muted})` }}>
            Veja como botões e títulos ficam com a paleta selecionada.
          </p>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              className="flex-1 h-8 rounded-lg text-[10px] font-bold shadow-sm transition-transform active:scale-95"
              style={{
                background: `hsl(${primaryHsl})`,
                color: "white",
              }}
            >
              Ação principal
            </button>
            <button
              type="button"
              className="flex-1 h-8 rounded-lg text-[10px] font-semibold transition-transform active:scale-95"
              style={{
                background: "transparent",
                color: `hsl(${primaryHsl})`,
                boxShadow: `inset 0 0 0 1.5px hsl(${primaryHsl})`,
              }}
            >
              Secundária
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AppearanceSettings({ trigger }: { trigger: React.ReactNode }) {
  const { colors, setPrimaryColor, setBackgroundColor, resetColors, presets } = useCustomColors();
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const [stagedPrimary, setStagedPrimary] = useState(colors.primaryColor);
  const [stagedBg, setStagedBg] = useState(colors.backgroundColor);
  const [stagedTheme, setStagedTheme] = useState(theme);
  const [customHue, setCustomHue] = useState(250);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);

  const handleSelectPrimary = (v: string) => {
    setStagedPrimary(v);
    markDirty();
  };

  const handleSelectBg = (v: string) => {
    setStagedBg(v);
    markDirty();
  };

  const handleSelectTheme = (v: "light" | "dark" | "system") => {
    setStagedTheme(v);
    markDirty();
  };

  const handleHueChange = (h: number) => {
    setCustomHue(h);
    setStagedPrimary(`${h} 80% 50%`);
    markDirty();
  };

  const handleApply = () => {
    setPrimaryColor(stagedPrimary);
    setBackgroundColor(stagedBg);
    setTheme(stagedTheme);
    setDirty(false);
    toast.success("Aparência aplicada!");
  };

  const handleReset = () => {
    resetColors();
    setTheme("system");
    setStagedPrimary("");
    setStagedBg("");
    setStagedTheme("system");
    setCustomHue(250);
    setDirty(false);
    toast.success("Formato padrão restaurado!");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setStagedPrimary(colors.primaryColor);
      setStagedBg(colors.backgroundColor);
      setStagedTheme(theme);
      setDirty(false);
    }

    setOpen(nextOpen);
  };

  const renderedTrigger = isValidElement(trigger)
    ? cloneElement(trigger, {
        ...(trigger.props ?? {}),
        onClick: (event: React.MouseEvent) => {
          trigger.props?.onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(true);
          }
        },
        onSelect: (event: Event) => {
          trigger.props?.onSelect?.(event);
          if (!event.defaultPrevented) {
            event.preventDefault();
            setOpen(true);
          }
        },
      })
    : null;

  const selectedPrimaryLabel =
    presets.primary.find((p) => p.value === stagedPrimary)?.label ??
    (stagedPrimary ? "Personalizada" : "Padrão");
  const selectedBgLabel =
    presets.background.find((p) => p.value === stagedBg)?.label ?? "Padrão";

  return (
    <>
      {renderedTrigger}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm rounded-2xl p-0 gap-0 overflow-hidden border-border/60 shadow-2xl">
          {/* Header refinado */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {t("settings.appearance")}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Personalize cores, tema e identidade visual
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Conteúdo rolável */}
          <div className="max-h-[65vh] overflow-y-auto px-5 py-4 space-y-4">
            {/* Preview ao vivo */}
            <LivePreview
              primary={stagedPrimary}
              background={stagedBg}
              theme={stagedTheme}
            />

            {/* 1. Cor dos botões */}
            <section className="rounded-2xl border border-border/60 bg-card/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <MousePointerClick className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground leading-tight">
                    1. Cor dos botões e destaques
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    Define a cor dos botões principais, links e itens selecionados.
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                  {selectedPrimaryLabel}
                </span>
              </div>
              <div className="grid grid-cols-8 gap-2">
                {presets.primary.map((p) => {
                  const active = stagedPrimary === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => handleSelectPrimary(p.value)}
                      className={`relative aspect-square w-full rounded-full transition-all ${
                        active
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                          : "ring-1 ring-border hover:scale-105 hover:ring-foreground/40"
                      }`}
                      style={{ background: `hsl(${p.value})` }}
                      title={p.label}
                    >
                      {active && (
                        <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" />
                      )}
                      <span className="sr-only">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Tom personalizado */}
            <section className="rounded-2xl border border-border/60 bg-card/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <Droplet className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground leading-tight">
                    2. Tom personalizado (opcional)
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    Arraste para criar uma cor exclusiva caso não goste das opções acima.
                  </p>
                </div>
              </div>
              <div className="space-y-2.5">
                <HueSlider value={customHue} onChange={handleHueChange} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-lg ring-1 ring-border shadow-sm"
                      style={{ background: `hsl(${customHue}, 80%, 50%)` }}
                    />
                    <span className="text-[11px] text-muted-foreground">Sua cor</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    hsl({customHue}, 80%, 50%)
                  </span>
                </div>
              </div>
            </section>

            {/* 3. Cor de fundo */}
            <section className="rounded-2xl border border-border/60 bg-card/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground leading-tight">
                    3. Cor de fundo das telas
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    Define o fundo geral do aplicativo. O texto se ajusta automaticamente para ficar legível.
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                  {selectedBgLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {presets.background.map((p) => {
                  const active = stagedBg === p.value;
                  return (
                    <button
                      key={p.value || "default"}
                      type="button"
                      onClick={() => handleSelectBg(p.value)}
                      className={`relative flex h-12 items-center justify-center rounded-xl text-[11px] font-semibold transition-all overflow-hidden ${
                        active
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "ring-1 ring-border hover:ring-foreground/40"
                      }`}
                      style={
                        p.value
                          ? {
                              background: `hsl(${p.value})`,
                              color:
                                parseInt(p.value.split(" ")[2]) < 50
                                  ? "white"
                                  : "black",
                            }
                          : undefined
                      }
                    >
                      {p.label}
                      {active && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/90">
                          <Check className="h-2.5 w-2.5 text-background" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 4. Modo claro / escuro */}
            <section className="rounded-2xl border border-border/60 bg-card/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <Sun className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground leading-tight">
                    4. Modo de exibição
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    Escolha entre claro, escuro ou seguir o sistema do seu celular.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "light" as const, label: t("toolbar.lightMode"), emoji: "☀️" },
                  { value: "dark" as const, label: t("toolbar.darkMode"), emoji: "🌙" },
                  { value: "system" as const, label: t("settings.system"), emoji: "💻" },
                ]).map((m) => {
                  const active = stagedTheme === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => handleSelectTheme(m.value)}
                      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary"
                          : "bg-muted/40 text-foreground/70 ring-1 ring-border hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className="text-base leading-none">{m.emoji}</span>
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Footer sticky */}
          <div className="border-t border-border/60 bg-gradient-to-b from-transparent to-muted/40 px-5 py-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 rounded-xl text-xs h-10"
              onClick={handleReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
            <Button
              size="sm"
              className="flex-[1.4] gap-2 rounded-xl text-xs font-bold h-10 shadow-md"
              onClick={handleApply}
              disabled={!dirty}
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
