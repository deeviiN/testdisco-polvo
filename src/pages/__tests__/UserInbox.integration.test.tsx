import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks -----------------------------------------------------------------

vi.mock("sonner", () => ({
  toast: {
    message: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    profile: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

const initialMessages = [
  {
    id: "m0",
    school_id: "s1",
    sender_user_id: "other",
    sender_name: "Alice",
    content: "hello world",
    created_at: "2024-01-01T00:00:00.000Z",
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const channels: Record<string, any> = {};
  const builder = (table: string) => {
    const state: any = { head: false };
    const b: any = {
      select: (_sel?: any, opts?: any) => {
        if (opts?.head) state.head = true;
        return b;
      },
      eq: () => b,
      neq: () => b,
      gt: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () =>
        Promise.resolve({
          data:
            table === "profiles"
              ? { school_id: "s1", full_name: "Tester" }
              : null,
          error: null,
        }),
      insert: () => Promise.resolve({ error: null }),
      then: (resolve: any) =>
        resolve({
          data:
            table === "school_messages" && !state.head ? initialMessages : [],
          count: state.head ? 0 : undefined,
          error: null,
        }),
    };
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      channel: (name: string) => {
        const ch: any = { _name: name, INSERT: [], DELETE: [] };
        channels[name] = ch;
        ch.on = (_type: string, opts: any, cb: any) => {
          (ch[opts.event] ||= []).push(cb);
          return ch;
        };
        ch.subscribe = () => ch;
        return ch;
      },
      removeChannel: () => {},
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({ data: { publicUrl: "x" } }),
        }),
      },
    },
    __channels: channels,
  };
});

// jsdom doesn't implement these
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Element.prototype as any).scrollIntoView = vi.fn();

// Import after mocks
import UserInbox from "../UserInbox";
import * as supaMod from "@/integrations/supabase/client";

const getInboxChannel = () => (supaMod as any).__channels["school_messages:s1"];

const renderInbox = async () => {
  const utils = render(
    <MemoryRouter>
      <UserInbox />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByText("hello world")).toBeInTheDocument(),
  );
  return utils;
};

const scrollAway = () => {
  const scroller = document.querySelector(
    ".flex-1.overflow-y-auto",
  ) as HTMLDivElement;
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(scroller, "clientHeight", {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    value: 0,
  });
  fireEvent.scroll(scroller);
};

const fireInsert = (msg: any) =>
  act(() => {
    getInboxChannel().INSERT.forEach((cb: any) => cb({ new: msg }));
  });

const fireDelete = (id: string) =>
  act(() => {
    getInboxChannel().DELETE.forEach((cb: any) => cb({ old: { id } }));
  });

const mkMsg = (id: string, createdAt: string, sender = "other") => ({
  id,
  school_id: "s1",
  sender_user_id: sender,
  sender_name: "Alice",
  content: `msg ${id}`,
  created_at: createdAt,
});

// --- Tests -----------------------------------------------------------------

describe("UserInbox integration — unread set vs realtime", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("INSERT events increment the unread counter when scrolled away", async () => {
    await renderInbox();
    scrollAway();

    fireInsert(mkMsg("m1", "2099-01-02T00:00:00.000Z"));
    expect(
      await screen.findByRole("button", { name: /Ver 1 mensagem nova/i }),
    ).toBeInTheDocument();

    fireInsert(mkMsg("m2", "2099-01-03T00:00:00.000Z"));
    expect(
      await screen.findByRole("button", { name: /Ver 2 mensagens novas/i }),
    ).toBeInTheDocument();
  });

  it("DELETE events remove the dropped message from the unread set", async () => {
    await renderInbox();
    scrollAway();

    fireInsert(mkMsg("m1", "2099-01-02T00:00:00.000Z"));
    fireInsert(mkMsg("m2", "2099-01-03T00:00:00.000Z"));
    await screen.findByRole("button", { name: /Ver 2 mensagens novas/i });

    fireDelete("m1");
    expect(
      await screen.findByRole("button", { name: /Ver 1 mensagem nova/i }),
    ).toBeInTheDocument();

    fireDelete("m2");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Ver \d+ mensage(m|ns) nova/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("ignores INSERTs from the current user", async () => {
    await renderInbox();
    scrollAway();

    fireInsert(mkMsg("mine", "2099-01-02T00:00:00.000Z", "u1"));
    // Wait a tick to let any state update settle
    await new Promise((r) => setTimeout(r, 10));
    expect(
      screen.queryByRole("button", { name: /Ver \d+ mensage(m|ns) nova/i }),
    ).not.toBeInTheDocument();
  });

  it("cross-tab last-seen storage event prunes the unread set", async () => {
    await renderInbox();
    scrollAway();

    fireInsert(mkMsg("m1", "2099-01-02T00:00:00.000Z"));
    fireInsert(mkMsg("m2", "2099-01-04T00:00:00.000Z"));
    await screen.findByRole("button", { name: /Ver 2 mensagens novas/i });

    // Another tab marked everything up to 2024-01-03 as seen
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "school_messages_last_seen:u1",
          newValue: "2099-01-03T00:00:00.000Z",
        }),
      );
    });

    expect(
      await screen.findByRole("button", { name: /Ver 1 mensagem nova/i }),
    ).toBeInTheDocument();

    // Now another tab marks everything as seen
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "school_messages_last_seen:u1",
          newValue: "2099-12-31T00:00:00.000Z",
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Ver \d+ mensage(m|ns) nova/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("reconnect replay does not duplicate ids in the unread set", async () => {
    await renderInbox();
    scrollAway();

    const m1 = mkMsg("m1", "2099-01-02T00:00:00.000Z");
    const m2 = mkMsg("m2", "2099-01-03T00:00:00.000Z");
    const m3 = mkMsg("m3", "2099-01-04T00:00:00.000Z");

    // First delivery — pre-disconnect.
    fireInsert(m1);
    await screen.findByRole("button", { name: /Ver 1 mensagem nova/i });

    // Simulate a reconnect: the realtime channel replays m1 (duplicate),
    // then delivers the events the client missed while offline (m2 + m3),
    // and finally redelivers m2 once more (broker retry).
    fireInsert(m1);
    fireInsert(m2);
    fireInsert(m3);
    fireInsert(m2);

    // Counter must reflect exactly the 3 distinct unread ids (m1, m2, m3).
    expect(
      await screen.findByRole("button", { name: /Ver 3 mensagens novas/i }),
    ).toBeInTheDocument();

    // And the message list must contain each id only once (Set-like dedupe
    // via setMessages prev.some check).
    const ids = ["m1", "m2", "m3"];
    for (const id of ids) {
      expect(
        document.querySelectorAll(`#msg-${id}`).length,
        `message ${id} should render exactly once after reconnect replay`,
      ).toBe(1);
    }

    // A DELETE during the same reconnect window also reconciles cleanly.
    fireDelete("m2");
    expect(
      await screen.findByRole("button", { name: /Ver 2 mensagens novas/i }),
    ).toBeInTheDocument();

    // Late replay of the just-deleted m2 must NOT resurrect it in unread,
    // because pruneRemoved drops ids not present in messages on the next
    // messages-effect tick. (Re-INSERT does re-add it, which is the correct
    // behavior — the server is the source of truth.)
    fireInsert(m2);
    expect(
      await screen.findByRole("button", { name: /Ver 3 mensagens novas/i }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(`#msg-m2`).length).toBe(1);
  });

  it("clicking to mark-as-read mid-reconnect keeps unreadIds reconciled without duplicates", async () => {
    await renderInbox();
    scrollAway();

    const m1 = mkMsg("m1", "2099-01-02T00:00:00.000Z");
    const m2 = mkMsg("m2", "2099-01-03T00:00:00.000Z");
    const m3 = mkMsg("m3", "2099-01-04T00:00:00.000Z");

    fireInsert(m1);
    fireInsert(m2);
    await screen.findByRole("button", { name: /Ver 2 mensagens novas/i });

    // User clicks the floating "Ver N mensagens novas" button: this calls
    // scrollToBottom() which clears every unread id and bumps last-seen.
    const seeAllBtn = await screen.findByRole("button", {
      name: /Ver 2 mensagens novas/i,
    });
    act(() => {
      seeAllBtn.click();
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Ver \d+ mensage(m|ns) nova/i }),
      ).not.toBeInTheDocument();
    });

    // Reconnect window: broker replays the same ids the user just acked,
    // interleaved with a brand-new m3 that was missed while offline.
    // jsdom's smooth-scroll never fires a scroll event, so we re-arm the
    // "scrolled away" state before driving the new INSERTs.
    scrollAway();
    fireInsert(m1); // duplicate replay
    fireInsert(m2); // duplicate replay
    fireInsert(m3); // genuinely new
    fireInsert(m2); // late broker retry
    fireInsert(m3); // late broker retry

    // Only m3 must end up in the unread set — the acked ids stay acked,
    // and the new id is counted exactly once.
    expect(
      await screen.findByRole("button", { name: /Ver 1 mensagem nova/i }),
    ).toBeInTheDocument();

    // And the DOM must not have duplicated any of the replayed rows.
    for (const id of ["m1", "m2", "m3"]) {
      expect(
        document.querySelectorAll(`#msg-${id}`).length,
        `message ${id} should render exactly once after click+reconnect`,
      ).toBe(1);
    }
  });
});
