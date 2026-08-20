import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  LAST_UPDATE_LOCATION_EVENT,
  LastUpdateLocation,
  getLastUpdateLocation,
} from "@/lib/lastUpdatePreference";

function formatDateTime(ms: number | null) {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

interface Props {
  /** Local onde este badge está renderizado. Só aparece se a preferência atual = location. */
  location: Exclude<LastUpdateLocation, "off">;
  className?: string;
}

/**
 * Badge discreto que mostra a data/hora do build atual instalado no dispositivo.
 * Assim toda vez que o app é atualizado, a data muda automaticamente.
 * Visibilidade controlada pela preferência salva via lastUpdatePreference.
 */
export default function LastUpdateBadge({ location, className = "" }: Props) {
  const [pref, setPref] = useState<LastUpdateLocation>(() => getLastUpdateLocation());

  useEffect(() => {
    const onChange = () => setPref(getLastUpdateLocation());
    window.addEventListener(LAST_UPDATE_LOCATION_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(LAST_UPDATE_LOCATION_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (pref !== location) return null;

  const buildTime = typeof __APP_BUILD_TIME__ === "number" ? __APP_BUILD_TIME__ : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono ${className}`}
      title="Data/hora do build atual instalado neste dispositivo"
    >
      <Clock className="h-3 w-3" />
      <span>Última atualização: {formatDateTime(buildTime)}</span>
    </div>
  );
}
