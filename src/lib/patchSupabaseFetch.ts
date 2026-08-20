// Força cache: 'no-store' e mode: 'cors' em todas as requisições ao backend
// Supabase, contornando caches agressivos de proxies/PWA/service workers
// que podem devolver respostas velhas e provocar "Failed to fetch".
const SUPABASE_HOST = "bypnkfypgxmpmvvkpyts.supabase.co";

export function installSupabaseNoCacheFetch() {
  if (typeof window === "undefined" || !window.fetch) return;
  const w = window as unknown as { __supabaseFetchPatched?: boolean };
  if (w.__supabaseFetchPatched) return;
  w.__supabaseFetchPatched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url && url.includes(SUPABASE_HOST)) {
        return originalFetch(input, {
          ...(init ?? {}),
          cache: "no-store",
          mode: "cors",
        });
      }
    } catch {
      // ignore, fall through
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;
}
