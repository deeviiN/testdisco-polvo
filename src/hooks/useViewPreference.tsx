import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewMode = "wide" | "compact";

interface ViewPreferenceContextValue {
  /** Modo efetivo aplicado agora (considera a largura real da tela). */
  viewMode: ViewMode;
  /** true quando a tela é larga o suficiente pra oferecer a escolha (≥1024px). */
  canChooseView: boolean;
  setViewMode: (mode: ViewMode) => void;
}

const STORAGE_KEY = "polvo:view-preference";
const DESKTOP_QUERY = "(min-width: 1024px)";

const ViewPreferenceContext = createContext<ViewPreferenceContextValue>({
  viewMode: "compact",
  canChooseView: false,
  setViewMode: () => {},
});

export function useViewPreference() {
  return useContext(ViewPreferenceContext);
}

export function ViewPreferenceProvider({ children }: { children: ReactNode }) {
  const [isWideScreen, setIsWideScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );
  const [preference, setPreference] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "wide";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "compact" ? "compact" : "wide";
  });

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handler = () => setIsWideScreen(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setPreference(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
  };

  // Em telas de celular de verdade não existe escolha: a interface compacta,
  // testada e original, continua exatamente como sempre foi.
  const viewMode: ViewMode = isWideScreen ? preference : "compact";

  useEffect(() => {
    document.documentElement.dataset.viewMode = viewMode;
  }, [viewMode]);

  return (
    <ViewPreferenceContext.Provider value={{ viewMode, canChooseView: isWideScreen, setViewMode }}>
      {children}
    </ViewPreferenceContext.Provider>
  );
}
