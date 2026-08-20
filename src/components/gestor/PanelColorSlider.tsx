import { useEffect, useState } from "react";

export const PANEL_COLOR_KEY = "gestor.panelColorIdx";

export const PANEL_COLORS = [
  { name: "Azul",     from: "hsl(220, 85%, 50%)", to: "hsl(225, 80%, 38%)", glow: "hsl(220, 100%, 60%)", border: "hsl(220, 90%, 70%)" },
  { name: "Vermelho", from: "hsl(0, 82%, 52%)",   to: "hsl(355, 80%, 40%)", glow: "hsl(0, 100%, 60%)",   border: "hsl(0, 90%, 75%)" },
  { name: "Verde",    from: "hsl(142, 72%, 42%)", to: "hsl(150, 75%, 30%)", glow: "hsl(142, 100%, 50%)", border: "hsl(142, 90%, 70%)" },
  { name: "Amarelo",  from: "hsl(50, 98%, 55%)",  to: "hsl(45, 95%, 45%)",  glow: "hsl(50, 100%, 60%)",  border: "hsl(50, 100%, 75%)" },
  { name: "Dourado",  from: "hsl(40, 90%, 52%)",  to: "hsl(30, 88%, 40%)",  glow: "hsl(38, 100%, 60%)",  border: "hsl(45, 100%, 75%)" },
  { name: "Ouro",     from: "hsl(46, 100%, 55%)", to: "hsl(38, 95%, 45%)",  glow: "hsl(45, 100%, 58%)",  border: "hsl(48, 100%, 78%)" },
  { name: "Cinza",    from: "hsl(220, 10%, 55%)", to: "hsl(220, 12%, 35%)", glow: "hsl(220, 15%, 65%)",  border: "hsl(220, 15%, 80%)" },
  { name: "Bege",      from: "hsl(38, 45%, 72%)",  to: "hsl(34, 40%, 55%)",  glow: "hsl(38, 60%, 75%)",   border: "hsl(38, 55%, 85%)" },
  { name: "Roxo",      from: "hsl(265, 75%, 50%)", to: "hsl(270, 75%, 35%)", glow: "hsl(265, 90%, 60%)",  border: "hsl(265, 85%, 78%)" },
  { name: "Marrom",    from: "hsl(25, 55%, 38%)",  to: "hsl(20, 60%, 24%)",  glow: "hsl(25, 70%, 45%)",   border: "hsl(28, 50%, 65%)" },
  { name: "Azul Escuro", from: "hsl(225, 80%, 28%)", to: "hsl(230, 85%, 16%)", glow: "hsl(225, 90%, 40%)", border: "hsl(225, 70%, 65%)" },
  { name: "Rosa",      from: "hsl(335, 85%, 62%)", to: "hsl(340, 80%, 48%)", glow: "hsl(335, 100%, 70%)", border: "hsl(335, 90%, 82%)" },
  { name: "Lilás",     from: "hsl(285, 70%, 70%)", to: "hsl(280, 65%, 55%)", glow: "hsl(285, 85%, 75%)",  border: "hsl(285, 80%, 85%)" },
  { name: "Laranja",   from: "hsl(25, 95%, 55%)",  to: "hsl(18, 90%, 42%)",  glow: "hsl(25, 100%, 60%)",  border: "hsl(28, 100%, 75%)" },
];

export function usePanelColorIdx(): [number, (n: number) => void] {
  const [idx, setIdx] = useState<number>(() => {
    const saved = Number(localStorage.getItem(PANEL_COLOR_KEY));
    return saved >= 0 && saved < PANEL_COLORS.length ? saved : 4;
  });
  useEffect(() => {
    localStorage.setItem(PANEL_COLOR_KEY, String(idx));
    window.dispatchEvent(new StorageEvent("storage", { key: PANEL_COLOR_KEY, newValue: String(idx) }));
  }, [idx]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PANEL_COLOR_KEY && e.newValue !== null) {
        const n = Number(e.newValue);
        if (n >= 0 && n < PANEL_COLORS.length) setIdx(n);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return [idx, setIdx];
}

export default function PanelColorSlider({ className = "" }: { className?: string }) {
  const [panelColorIdx, setPanelColorIdx] = usePanelColorIdx();
  const panelColor = PANEL_COLORS[panelColorIdx];
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border bg-black/50 backdrop-blur-md px-3 py-1.5 w-full shadow-lg ${className}`}
      style={{ borderColor: `${panelColor.border}66` }}
    >
      <span className="text-[10px] uppercase tracking-[0.14em] font-extrabold shrink-0" style={{ color: panelColor.border }}>Cor</span>
      <div
        className="relative flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: `linear-gradient(to right, ${PANEL_COLORS.map((c) => c.from).join(", ")})` }}
      >
        <input
          type="range"
          min={0}
          max={PANEL_COLORS.length - 1}
          step={1}
          value={panelColorIdx}
          onChange={(e) => setPanelColorIdx(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Cor dos botões do painel"
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white shadow-md transition-[left] duration-200 ease-out"
          style={{
            left: `calc(${(panelColorIdx / (PANEL_COLORS.length - 1)) * 100}% - 8px)`,
            background: panelColor.from,
          }}
        />
      </div>
      <span className="text-xs font-black min-w-[58px] text-right" style={{ color: panelColor.border }}>
        {panelColor.name}
      </span>
    </div>
  );
}
