// Local history of name/role changes per user.
// Stored in localStorage (changes are session-only or pending approval).

export type ProfileChangeStatus = "session" | "pending" | "approved";

export type ProfileChangeEntry = {
  id: string;
  field: "name" | "role";
  from: string;
  to: string;
  status: ProfileChangeStatus;
  at: string; // ISO date
};

const KEY_PREFIX = "sala-vida:profile-change-history:";
const MAX_ENTRIES = 50;
export const PROFILE_HISTORY_EVENT = "profile-change-history-updated";

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export function getProfileHistory(userId: string): ProfileChangeEntry[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addProfileHistoryEntry(
  userId: string,
  entry: Omit<ProfileChangeEntry, "id" | "at"> & { at?: string },
) {
  if (!userId) return;
  const list = getProfileHistory(userId);
  const newEntry: ProfileChangeEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    at: entry.at ?? new Date().toISOString(),
    field: entry.field,
    from: entry.from,
    to: entry.to,
    status: entry.status,
  };
  const next = [newEntry, ...list].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
    window.dispatchEvent(new Event(PROFILE_HISTORY_EVENT));
  } catch {
    // noop
  }
}

export function clearProfileHistory(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
    window.dispatchEvent(new Event(PROFILE_HISTORY_EVENT));
  } catch {
    // noop
  }
}
