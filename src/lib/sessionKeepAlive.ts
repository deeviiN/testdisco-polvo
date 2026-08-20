import { supabase } from "@/integrations/supabase/client";

/**
 * Mantém o usuário logado "para sempre" no dispositivo (estilo WhatsApp):
 * a sessão só termina quando o próprio usuário clicar em "Deslogar".
 *
 * Fechar o app/aba NÃO desloga: o token fica no localStorage e é renovado
 * automaticamente ao abrir de novo, ao voltar o foco, ao reconectar a
 * internet e periodicamente enquanto o app estiver aberto.
 */

const REFRESH_MARGIN_MS = 15 * 60 * 1000; // renova se faltar menos de 15 min
const INTERVAL_MS = 5 * 60 * 1000;

let running = false;

function isInvalidRefreshToken(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid refresh token") ||
    m.includes("refresh token not found") ||
    m.includes("already used") ||
    m.includes("user not found")
  );
}

async function ensureFreshSession(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;

    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    if (expiresAtMs - Date.now() > REFRESH_MARGIN_MS) return;

    // Tenta renovar com algumas tentativas (rede instável não deve deslogar).
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session) return;
      const message = String(error?.message ?? "");
      if (isInvalidRefreshToken(message)) return; // token realmente morto
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  } catch {
    // offline ou falha temporária: mantém a sessão como está
  } finally {
    running = false;
  }
}

export function installSessionKeepAlive() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __sessionKeepAlive?: boolean };
  if (w.__sessionKeepAlive) return;
  w.__sessionKeepAlive = true;

  void ensureFreshSession();

  window.addEventListener("focus", () => void ensureFreshSession());
  window.addEventListener("online", () => void ensureFreshSession());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void ensureFreshSession();
  });
  window.setInterval(() => void ensureFreshSession(), INTERVAL_MS);
}
