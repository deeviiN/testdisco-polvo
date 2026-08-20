import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface CustomColors {
  primaryColor: string; // HSL string like "250 84% 54%"
  backgroundColor: string; // HSL string
}

const COLOR_PRESETS = {
  primary: [
    { label: "Roxo", value: "250 84% 54%" },
    { label: "Azul", value: "220 70% 50%" },
    { label: "Verde", value: "168 76% 42%" },
    { label: "Âmbar", value: "38 92% 50%" },
    { label: "Rosa", value: "330 80% 55%" },
    { label: "Vermelho", value: "0 72% 51%" },
    { label: "Índigo", value: "240 60% 50%" },
    { label: "Ciano", value: "190 80% 45%" },
  ],
  background: [
    { label: "Padrão", value: "" },
    { label: "Dourado", value: "43 74% 42%" },
    { label: "Cinza", value: "220 20% 97%" },
    { label: "Escuro", value: "230 25% 7%" },
    { label: "Bege", value: "40 30% 95%" },
    { label: "Verde água", value: "170 20% 94%" },
  ],
};

interface CustomColorsContextValue {
  colors: CustomColors;
  setPrimaryColor: (c: string) => void;
  setBackgroundColor: (c: string) => void;
  resetColors: () => void;
  presets: typeof COLOR_PRESETS;
}

const CustomColorsContext = createContext<CustomColorsContextValue>({
  colors: { primaryColor: "", backgroundColor: "" },
  setPrimaryColor: () => {},
  setBackgroundColor: () => {},
  resetColors: () => {},
  presets: COLOR_PRESETS,
});

export function useCustomColors() {
  return useContext(CustomColorsContext);
}

export function CustomColorsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<CustomColors>(() => {
    try {
      const stored = localStorage.getItem("app-custom-colors");
      return stored ? JSON.parse(stored) : { primaryColor: "", backgroundColor: "" };
    } catch {
      return { primaryColor: "", backgroundColor: "" };
    }
  });

  useEffect(() => {
    localStorage.setItem("app-custom-colors", JSON.stringify(colors));
    const root = document.documentElement;
    
    if (colors.primaryColor) {
      root.style.setProperty("--primary", colors.primaryColor);
      root.style.setProperty("--ring", colors.primaryColor);
      root.setAttribute("data-custom-primary", "true");
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.removeAttribute("data-custom-primary");
    }

    if (colors.backgroundColor) {
      root.style.setProperty("--background", colors.backgroundColor);
    } else {
      root.style.removeProperty("--background");
    }
  }, [colors]);

  const setPrimaryColor = (c: string) => setColors(prev => ({ ...prev, primaryColor: c }));
  const setBackgroundColor = (c: string) => setColors(prev => ({ ...prev, backgroundColor: c }));
  const resetColors = () => setColors({ primaryColor: "", backgroundColor: "" });

  return (
    <CustomColorsContext.Provider value={{ colors, setPrimaryColor, setBackgroundColor, resetColors, presets: COLOR_PRESETS }}>
      {children}
    </CustomColorsContext.Provider>
  );
}
