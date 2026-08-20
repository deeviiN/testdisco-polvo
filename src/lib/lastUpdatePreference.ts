// Preferência de exibição da "última atualização" do app.
// Salva em localStorage e notifica via evento customizado.

export type LastUpdateLocation = "off" | "header" | "footer" | "version_card" | "home";

const KEY = "sala-vida:last-update-location";
export const LAST_UPDATE_LOCATION_EVENT = "last-update-location-changed";

export const LAST_UPDATE_LOCATION_OPTIONS: { value: LastUpdateLocation; label: string; description: string }[] = [
  { value: "off", label: "Não exibir", description: "Oculta em todos os lugares" },
  { value: "header", label: "Cabeçalho", description: "Topo das páginas principais" },
  { value: "footer", label: "Rodapé", description: "Base das páginas (junto à versão)" },
  { value: "version_card", label: "Card de versão", description: "Apenas no card de versão mínima do admin" },
  { value: "home", label: "Página inicial", description: "Dashboard inicial após o login" },
];

export function getLastUpdateLocation(): LastUpdateLocation {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "off" || v === "header" || v === "footer" || v === "version_card" || v === "home") return v;
  } catch {
    // noop
  }
  return "home";
}

export function setLastUpdateLocation(value: LastUpdateLocation) {
  try {
    localStorage.setItem(KEY, value);
    window.dispatchEvent(new Event(LAST_UPDATE_LOCATION_EVENT));
  } catch {
    // noop
  }
}
