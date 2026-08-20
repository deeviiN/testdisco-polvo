import { useEffect, useState } from "react";
import { readCssHsl, readableOnPrimary } from "@/lib/contrast";
import { useCustomColors } from "@/hooks/useCustomColors";

/**
 * Reage à cor primária atual e devolve cor de texto + sombra com contraste
 * mínimo AA garantido sobre essa cor.
 */
export function useReadableOnPrimary() {
  const { colors } = useCustomColors();
  const [style, setStyle] = useState(() =>
    readableOnPrimary(readCssHsl("--primary"))
  );

  useEffect(() => {
    // Aguarda o próximo frame para a CSS var já estar aplicada no :root
    const id = requestAnimationFrame(() => {
      setStyle(readableOnPrimary(readCssHsl("--primary")));
    });
    return () => cancelAnimationFrame(id);
  }, [colors.primaryColor]);

  return style;
}
