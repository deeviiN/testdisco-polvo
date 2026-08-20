// Pure helpers for tracking unread messages in the Inbox.
// Extracted so the logic that powers the "X mensagens novas" badge
// can be unit-tested without mounting the full chat page.

export type UnreadMsg = {
  id: string;
  created_at: string;
  sender_user_id: string;
};

/** Add freshly arrived messages (slice after prevCount), skipping the current user's. */
export function addIncoming<T extends UnreadMsg>(
  current: Set<string>,
  messages: T[],
  prevCount: number,
  userId: string | null | undefined,
): Set<string> {
  if (messages.length <= prevCount) return current;
  const fresh = messages
    .slice(prevCount)
    .filter((m) => m.sender_user_id !== userId)
    .map((m) => m.id);
  if (!fresh.length) return current;
  const next = new Set(current);
  for (const id of fresh) next.add(id);
  return next;
}

/** Clear every unread id (e.g. user scrolled to bottom). */
export function clearAll(current: Set<string>): Set<string> {
  return current.size === 0 ? current : new Set();
}

/**
 * Remove every unread id whose message timestamp is <= the cutoff timestamp.
 * Used when the user jumps to a specific message via the mini-listado —
 * everything up to and including that message becomes "read".
 */
export function markUpTo<T extends UnreadMsg>(
  current: Set<string>,
  messages: T[],
  cutoffISO: string,
): Set<string> {
  if (current.size === 0) return current;
  const next = new Set<string>();
  for (const m of messages) {
    if (current.has(m.id) && m.created_at > cutoffISO) next.add(m.id);
  }
  return next;
}

/**
 * Drop unread ids that are no longer present in the message list.
 * Used to reconcile after a realtime DELETE event removes a message
 * the user had not yet read.
 */
export function pruneRemoved<T extends UnreadMsg>(
  current: Set<string>,
  messages: T[],
): Set<string> {
  if (current.size === 0) return current;
  const present = new Set(messages.map((m) => m.id));
  let changed = false;
  const next = new Set<string>();
  for (const id of current) {
    if (present.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : current;
}

/**
 * Drop unread ids whose created_at is <= lastSeenISO.
 * Used to stay consistent with external "last seen" updates
 * (e.g. another browser tab marked messages as read).
 */
export function pruneBySeen<T extends UnreadMsg>(
  current: Set<string>,
  messages: T[],
  lastSeenISO: string,
): Set<string> {
  if (current.size === 0 || !lastSeenISO) return current;
  let changed = false;
  const next = new Set<string>();
  for (const m of messages) {
    if (!current.has(m.id)) continue;
    if (m.created_at > lastSeenISO) next.add(m.id);
    else changed = true;
  }
  return changed ? next : current;
}
