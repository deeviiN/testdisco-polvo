/**
 * Resolve a URL da logomarca do governo atual para o cabeçalho oficial dos PDFs.
 *
 * Ordem de prioridade:
 *  1. Override por escola (`schools.gov_logo_url`) — gestor subiu uma imagem própria.
 *  2. Catálogo central (`public.gov_logos`) gerenciado pelo admin, casado por:
 *     - municipal → state + city
 *     - estadual  → state (UF)
 *     - federal   → único registro federal
 *
 * Retorna null quando não há logo aplicável (ex: rede privada).
 */
import { supabase } from "@/integrations/supabase/client";

export interface GovLogoInput {
  network?: string | null;
  state?: string | null;
  city?: string | null;
  overrideUrl?: string | null;
}

export async function resolveGovLogoUrl(input: GovLogoInput): Promise<string | null> {
  if (input.overrideUrl && input.overrideUrl.trim()) return input.overrideUrl;

  const network = String(input.network || "").toLowerCase();
  const uf = (input.state || "").trim().toUpperCase();
  const city = (input.city || "").trim();

  try {
    if (network === "estadual" && uf) {
      const { data } = await supabase
        .from("gov_logos" as any)
        .select("logo_url")
        .eq("scope", "estadual")
        .eq("state", uf)
        .eq("is_active", true)
        .maybeSingle();
      return ((data as any)?.logo_url as string) || null;
    }
    if (network === "municipal" && city && uf) {
      const { data } = await supabase
        .from("gov_logos" as any)
        .select("logo_url")
        .eq("scope", "municipal")
        .eq("state", uf)
        .eq("city", city)
        .eq("is_active", true)
        .maybeSingle();
      return ((data as any)?.logo_url as string) || null;
    }
    if (network === "federal") {
      const { data } = await supabase
        .from("gov_logos" as any)
        .select("logo_url")
        .eq("scope", "federal")
        .eq("is_active", true)
        .maybeSingle();
      return ((data as any)?.logo_url as string) || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Carrega uma URL de imagem e retorna dataURL PNG (ou null em erro). */
export async function loadImageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
    if (!img.complete || img.naturalWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
