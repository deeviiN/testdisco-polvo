const SIREN_FIRED_STORAGE_KEY = "school-siren-fired-v1";
const SIREN_FIRED_TTL_MS = 26 * 60 * 60 * 1000;

export function claimSirenFire(fireKey: string): boolean {
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(SIREN_FIRED_STORAGE_KEY);
    const fired = raw ? (JSON.parse(raw) as Record<string, number>) : {};

    Object.keys(fired).forEach((key) => {
      if (!Number.isFinite(fired[key]) || now - fired[key] > SIREN_FIRED_TTL_MS) {
        delete fired[key];
      }
    });

    if (fired[fireKey]) return false;
    fired[fireKey] = now;
    window.localStorage.setItem(SIREN_FIRED_STORAGE_KEY, JSON.stringify(fired));
    return true;
  } catch {
    return true;
  }
}