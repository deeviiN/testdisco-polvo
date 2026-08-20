import { supabase } from "@/integrations/supabase/client";

/**
 * Garante que há um access_token válido. Se expirou, tenta refresh.
 * Se o refresh falhar, faz signOut e redireciona pra tela de login
 * apropriada (admin → /admin/login, demais → /auth), evitando loops
 * de 401/400 em queries autenticadas.
 *
 * Retorna `true` quando há sessão válida pra usar, `false` caso contrário.
 */
let redirecting = false;

export async function redirectToLogin(): Promise<void> {
  if (redirecting) return;
  redirecting = true;
  try {
    await supabase.auth.signOut();
  } catch {
    /* noop */
  }
  try {
    const path = window.location.pathname || "";
    const isAdmin = path === "/admin" || path.startsWith("/admin/");
    const target = isAdmin ? "/admin/login" : "/auth";
    if (path !== target) window.location.replace(target);
  } catch {
    /* noop */
  }
}

export async function redirectOnAuthError(error: unknown): Promise<boolean> {
  const e = error as { status?: number; code?: string; message?: string } | null;
  const message = `${e?.code ?? ""} ${e?.message ?? ""}`.toLowerCase();
  const is401 = e?.status === 401 || e?.code === "401" || message.includes("jwt") || message.includes("unauthorized");
  if (!is401) return false;
  await redirectToLogin();
  return true;
}

export async function ensureSessionOrRedirect(): Promise<boolean> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  const expSec = sess?.session?.expires_at ?? 0;
  const expired = !token || expSec * 1000 < Date.now() + 5000;

  if (!expired) return true;

  // Sem nenhuma sessão salva no dispositivo → precisa logar.
  if (!sess?.session) {
    await redirectToLogin();
    return false;
  }

  // O cliente já executa a renovação automática de forma serializada. Não
  // force refresh aqui: múltiplos guards faziam várias renovações disputarem o
  // mesmo lock e podiam bloquear inclusive um novo login.
  return true;
}

