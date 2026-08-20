// Shared helpers for Mercado Pago credentials gating.
// Used by criar-pagamento-mp (gate) and mp-credentials-check (admin test).

export type MpMode = "test" | "prod";

export interface MpCredentials {
  mode: MpMode;
  accessToken: string;
  publicKey: string | null;
}

export function pickMpCredentials(preferred?: MpMode): MpCredentials | null {
  const genericToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? null;
  const genericPub = Deno.env.get("MERCADO_PAGO_PUBLIC_KEY") ?? null;
  const genericIsTest = genericToken?.trim().startsWith("TEST-") || genericPub?.trim().startsWith("TEST-");
  const genericIsProd = genericToken?.trim().startsWith("APP_USR-") || genericPub?.trim().startsWith("APP_USR-");

  // Credenciais específicas por ambiente têm prioridade sobre secrets genéricos antigos.
  // Isso evita que um TEST token legado em MERCADO_PAGO_ACCESS_TOKEN sobrescreva
  // o token correto salvo em MERCADOPAGO_ACCESS_TOKEN_TEST.
  const prodToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN_PROD") ?? Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? (genericIsProd ? genericToken : null);
  const testToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN_TEST") ?? (genericIsTest ? genericToken : null);
  const prodPub = Deno.env.get("MERCADOPAGO_PUBLIC_KEY_PROD") ?? (genericIsProd ? genericPub : null) ?? null;
  const testPub = Deno.env.get("MERCADOPAGO_PUBLIC_KEY_TEST") ?? (genericIsTest ? genericPub : null) ?? null;

  const pickProd = (): MpCredentials | null =>
    prodToken ? { mode: "prod", accessToken: prodToken, publicKey: prodPub } : null;
  const pickTest = (): MpCredentials | null =>
    testToken ? { mode: "test", accessToken: testToken, publicKey: testPub } : null;

  if (preferred === "prod") return pickProd() ?? pickTest();
  if (preferred === "test") return pickTest() ?? pickProd();
  return pickProd() ?? pickTest();
}

/**
 * Async version: respects the `mp_settings.force_test_mode` flag in DB.
 * If flag is true and a TEST token exists, returns TEST regardless of preferred.
 */
export async function pickMpCredentialsAsync(
  preferred?: MpMode,
): Promise<MpCredentials | null> {
  if (preferred) return pickMpCredentials(preferred);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (SUPABASE_URL && SERVICE_ROLE) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_mp_force_test_mode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: "{}",
      });
      if (res.ok) {
        const forceTest = await res.json().catch(() => false);
        if (forceTest === true) return pickMpCredentials("test");
      }
    }
  } catch { /* fallback */ }
  return pickMpCredentials();
}

// Mask token for safe logging ("APP_USR-***-1234")
// Mascaramento total: nunca expõe prefixo, sufixo ou tamanho do token.
export function maskToken(token: string | null | undefined): string {
  if (!token) return "(empty)";
  return "***";
}

// In-memory cache (per isolate) of credential validation results.
// Keyed by token hash → { ok, expiresAt, reason }.
interface CacheEntry {
  ok: boolean;
  expiresAt: number;
  reason?: string;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface MpValidationResult {
  ok: boolean;
  reason?: string;
  status?: number;
  account?: { id?: string | number; nickname?: string; site_id?: string; email?: string };
  cached?: boolean;
}

/**
 * Wrapper para fetch com retry exponencial para lidar com erros intermitentes da API do Mercado Pago.
 */
export async function fetchMp(url: string, init?: RequestInit, maxRetries = 2, perAttemptTimeoutMs = 8000): Promise<Response> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), perAttemptTimeoutMs);
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s...
        console.log(`[MP] Retry attempt ${attempt} after ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
      const res = await fetch(url, { ...(init ?? {}), signal: ctrl.signal });
      clearTimeout(t);
      // Retenta em caso de 5xx ou 429 (rate limit)
      if (res.status >= 500 || res.status === 429) {
        const clone = res.clone();
        const bodyPeek = await clone.text().catch(() => "(unreadable)");
        const reqId = res.headers.get("x-request-id") ?? "(no-id)";
        console.warn(`[MP] status ${res.status} attempt ${attempt} req-id=${reqId} body=${bodyPeek.slice(0, 500)}`);
        if (attempt === maxRetries) return res;
        continue;
      }
      return res;
    } catch (e: any) {
      clearTimeout(t);
      lastError = e;
      const isAbort = e?.name === "AbortError";
      console.error(`[MP] Fetch error attempt ${attempt} (${isAbort ? "timeout" : e?.message ?? e}):`, e);
      if (attempt === maxRetries) break;
    }
  }
  throw lastError || new Error("Max retries reached");
}

export async function validateMpToken(token: string, opts?: { skipCache?: boolean }): Promise<MpValidationResult> {
  const key = await hashToken(token);
  const now = Date.now();
  if (!opts?.skipCache) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return { ok: cached.ok, reason: cached.reason, cached: true };
    }
  }

  try {
    const res = await fetchMp("https://api.mercadopago.com/users/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const reason = res.status === 401 ? "invalid_token" : `mp_status_${res.status}`;
      cache.set(key, { ok: false, expiresAt: now + 60 * 1000, reason }); // shorter TTL for failures
      return { ok: false, reason, status: res.status, cached: false };
    }
    const data = await res.json();
    cache.set(key, { ok: true, expiresAt: now + TTL_MS });
    return {
      ok: true,
      status: 200,
      account: {
        id: data?.id,
        nickname: data?.nickname,
        site_id: data?.site_id,
        email: data?.email,
      },
      cached: false,
    };
  } catch (e) {
    cache.set(key, { ok: false, expiresAt: now + 30 * 1000, reason: "network_error" });
    return { ok: false, reason: "network_error", cached: false };
  }
}

export function clearMpCache() {
  cache.clear();
}
