// Test harness page used by Playwright E2E to validate that the
// "Ver N mensagens novas" counter stays consistent across clicks on
// the mini-listado and incoming realtime INSERTs.
//
// Mounts the exact same helpers used by /inbox but driven by buttons
// instead of a Supabase channel — keeps the test deterministic.

import { useEffect, useState } from "react";
import {
  addIncoming,
  markUpTo,
  pruneRemoved,
  pruneBySeen,
  type UnreadMsg,
} from "@/lib/inboxUnread";

const USER_ID = "u1";

type Msg = UnreadMsg & { sender_name: string; content: string };

const initial: Msg[] = [
  {
    id: "m0",
    sender_user_id: "other",
    sender_name: "Alice",
    content: "hello",
    created_at: "2099-01-01T00:00:00.000Z",
  },
];

export default function InboxUnreadHarness() {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const [lastSeen, setLastSeen] = useState<string>("2099-01-01T00:00:00.000Z");
  const [seq, setSeq] = useState(1);

  const prevLenRef = useRefLike(messages.length);

  // Mirror the messages effect from UserInbox (without stick-to-bottom auto-clear).
  useEffect(() => {
    setUnreadIds((s) => {
      let next = addIncoming(s, messages, prevLenRef.current, USER_ID);
      next = pruneRemoved(next, messages);
      next = pruneBySeen(next, messages, lastSeen);
      return next;
    });
    prevLenRef.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, lastSeen]);

  const fireInsert = () => {
    const id = `m${seq}`;
    const created_at = new Date(
      Date.parse("2099-02-01T00:00:00.000Z") + seq * 60_000,
    ).toISOString();
    setSeq((n) => n + 1);
    setMessages((prev) => [
      ...prev,
      {
        id,
        sender_user_id: "other",
        sender_name: "Alice",
        content: `auto ${id}`,
        created_at,
      },
    ]);
  };

  const fireOwnInsert = () => {
    const id = `mine${seq}`;
    setSeq((n) => n + 1);
    setMessages((prev) => [
      ...prev,
      {
        id,
        sender_user_id: USER_ID,
        sender_name: "Me",
        content: `own ${id}`,
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const fireDelete = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const clickMini = (id: string) => {
    const target = messages.find((m) => m.id === id);
    if (!target) return;
    setLastSeen((cur) => (target.created_at > cur ? target.created_at : cur));
    setUnreadIds((s) => markUpTo(s, messages, target.created_at));
  };

  const externalSeen = (iso: string) => {
    setLastSeen(iso);
    setUnreadIds((s) => pruneBySeen(s, messages, iso));
  };

  const unreadNew = unreadIds.size;

  return (
    <main className="p-4 space-y-3" data-testid="harness">
      <h1 className="text-lg font-bold">Inbox Unread Harness</h1>

      <div
        data-testid="counter"
        className="px-3 py-2 rounded bg-secondary inline-block"
      >
        {unreadNew === 0
          ? "0 não lidas"
          : `Ver ${unreadNew} ${unreadNew === 1 ? "mensagem nova" : "mensagens novas"}`}
      </div>

      <div className="flex flex-wrap gap-2">
        <button data-testid="btn-insert" onClick={fireInsert}>
          Insert (other)
        </button>
        <button data-testid="btn-insert-own" onClick={fireOwnInsert}>
          Insert (own)
        </button>
        <button
          data-testid="btn-external-seen-all"
          onClick={() => externalSeen("2099-12-31T00:00:00.000Z")}
        >
          External seen all
        </button>
      </div>

      <ul data-testid="mini-list" className="space-y-1">
        {messages.map((m) => {
          const unread = unreadIds.has(m.id);
          return (
            <li key={m.id} className="flex items-center gap-2">
              <button
                data-testid={`mini-${m.id}`}
                data-unread={unread ? "1" : "0"}
                onClick={() => clickMini(m.id)}
                className={`px-2 py-1 rounded border text-left ${
                  unread ? "bg-amber-100 font-bold" : "bg-background"
                }`}
              >
                <span data-testid={`mini-${m.id}-label`}>
                  {m.sender_name}: {m.content}
                </span>
              </button>
              <button
                data-testid={`delete-${m.id}`}
                onClick={() => fireDelete(m.id)}
                className="text-xs underline"
              >
                delete
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

// Tiny ref helper so we don't pull useRef alongside its eslint complaints.
function useRefLike<T>(initialValue: T) {
  const [ref] = useState<{ current: T }>(() => ({ current: initialValue }));
  return ref;
}
