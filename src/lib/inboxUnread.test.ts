import { describe, it, expect } from "vitest";
import {
  addIncoming,
  clearAll,
  markUpTo,
  pruneRemoved,
  pruneBySeen,
  type UnreadMsg,
} from "./inboxUnread";

const ME = "user-me";
const OTHER = "user-other";

const msg = (id: string, created_at: string, sender = OTHER): UnreadMsg => ({
  id,
  created_at,
  sender_user_id: sender,
});

describe("inboxUnread.addIncoming", () => {
  it("adds new messages from others after prevCount", () => {
    const list = [msg("a", "2026-05-16T10:00:00Z"), msg("b", "2026-05-16T10:01:00Z")];
    const set = addIncoming(new Set(), list, 0, ME);
    expect([...set]).toEqual(["a", "b"]);
  });

  it("ignores messages sent by the current user", () => {
    const list = [
      msg("a", "2026-05-16T10:00:00Z", ME),
      msg("b", "2026-05-16T10:01:00Z", OTHER),
    ];
    const set = addIncoming(new Set(), list, 0, ME);
    expect([...set]).toEqual(["b"]);
  });

  it("only considers messages past prevCount", () => {
    const list = [
      msg("a", "2026-05-16T10:00:00Z"),
      msg("b", "2026-05-16T10:01:00Z"),
      msg("c", "2026-05-16T10:02:00Z"),
    ];
    const set = addIncoming(new Set(["a"]), list, 2, ME);
    expect([...set].sort()).toEqual(["a", "c"]);
  });

  it("returns the same reference when nothing new arrived", () => {
    const list = [msg("a", "2026-05-16T10:00:00Z")];
    const current = new Set(["a"]);
    expect(addIncoming(current, list, 1, ME)).toBe(current);
  });
});

describe("inboxUnread.clearAll", () => {
  it("empties a populated set", () => {
    const set = clearAll(new Set(["a", "b"]));
    expect(set.size).toBe(0);
  });
  it("returns the same reference when already empty", () => {
    const current = new Set<string>();
    expect(clearAll(current)).toBe(current);
  });
});

describe("inboxUnread.markUpTo", () => {
  const list = [
    msg("a", "2026-05-16T10:00:00Z"),
    msg("b", "2026-05-16T10:01:00Z"),
    msg("c", "2026-05-16T10:02:00Z"),
    msg("d", "2026-05-16T10:03:00Z"),
  ];

  it("removes the clicked message and every earlier one", () => {
    const current = new Set(["a", "b", "c", "d"]);
    const next = markUpTo(current, list, "2026-05-16T10:02:00Z");
    expect([...next]).toEqual(["d"]);
  });

  it("empties the set when jumping to the last unread", () => {
    const current = new Set(["a", "b", "c", "d"]);
    const next = markUpTo(current, list, "2026-05-16T10:03:00Z");
    expect(next.size).toBe(0);
  });

  it("keeps newer unread ids untouched after a middle click", () => {
    const current = new Set(["b", "c", "d"]);
    const next = markUpTo(current, list, "2026-05-16T10:01:00Z");
    expect([...next].sort()).toEqual(["c", "d"]);
  });

  it("returns the same reference when set is already empty", () => {
    const current = new Set<string>();
    expect(markUpTo(current, list, "2026-05-16T10:02:00Z")).toBe(current);
  });
});

describe("inboxUnread end-to-end scroll/click flow", () => {
  it("tracks count across arrivals, mini-list click, and final scroll", () => {
    let set = new Set<string>();
    let prev = 0;
    const list: UnreadMsg[] = [];

    // 3 new messages arrive
    list.push(msg("m1", "2026-05-16T10:00:00Z"));
    list.push(msg("m2", "2026-05-16T10:01:00Z"));
    list.push(msg("m3", "2026-05-16T10:02:00Z"));
    set = addIncoming(set, list, prev, ME);
    prev = list.length;
    expect(set.size).toBe(3);

    // user clicks m2 in the mini-listado -> m1 and m2 become read
    set = markUpTo(set, list, "2026-05-16T10:01:00Z");
    expect([...set]).toEqual(["m3"]);

    // a 4th arrives while still scrolled up
    list.push(msg("m4", "2026-05-16T10:03:00Z"));
    set = addIncoming(set, list, prev, ME);
    prev = list.length;
    expect([...set].sort()).toEqual(["m3", "m4"]);

    // user scrolls all the way down -> badge resets to 0
    set = clearAll(set);
    expect(set.size).toBe(0);
});

describe("inboxUnread.pruneRemoved (realtime DELETE sync)", () => {
  it("drops unread ids that disappeared from the message list", () => {
    const list = [msg("a", "2026-05-16T10:00:00Z"), msg("c", "2026-05-16T10:02:00Z")];
    const next = pruneRemoved(new Set(["a", "b", "c"]), list);
    expect([...next].sort()).toEqual(["a", "c"]);
  });

  it("returns the same reference when nothing was removed", () => {
    const list = [msg("a", "2026-05-16T10:00:00Z"), msg("b", "2026-05-16T10:01:00Z")];
    const current = new Set(["a", "b"]);
    expect(pruneRemoved(current, list)).toBe(current);
  });

  it("returns the same reference when set is empty", () => {
    const current = new Set<string>();
    expect(pruneRemoved(current, [msg("a", "2026-05-16T10:00:00Z")])).toBe(current);
  });
});

describe("inboxUnread.pruneBySeen (cross-tab last-seen sync)", () => {
  const list = [
    msg("a", "2026-05-16T10:00:00Z"),
    msg("b", "2026-05-16T10:01:00Z"),
    msg("c", "2026-05-16T10:02:00Z"),
  ];

  it("drops ids whose timestamp is <= lastSeen", () => {
    const next = pruneBySeen(new Set(["a", "b", "c"]), list, "2026-05-16T10:01:00Z");
    expect([...next]).toEqual(["c"]);
  });

  it("keeps every id when lastSeen is older than all messages", () => {
    const current = new Set(["a", "b", "c"]);
    const next = pruneBySeen(current, list, "2026-05-16T09:00:00Z");
    expect(next).toBe(current);
  });

  it("empties the set when lastSeen is newer than every message", () => {
    const next = pruneBySeen(new Set(["a", "b", "c"]), list, "2026-05-16T11:00:00Z");
    expect(next.size).toBe(0);
  });

  it("returns the same reference when lastSeen is empty", () => {
    const current = new Set(["a"]);
    expect(pruneBySeen(current, list, "")).toBe(current);
  });
});

describe("inboxUnread race: new arrivals during mini-list click", () => {
  it("keeps newer messages unread when a click and an INSERT happen back-to-back", () => {
    let set = new Set<string>();
    let prev = 0;
    const list: UnreadMsg[] = [
      msg("m1", "2026-05-16T10:00:00Z"),
      msg("m2", "2026-05-16T10:01:00Z"),
      msg("m3", "2026-05-16T10:02:00Z"),
    ];
    set = addIncoming(set, list, prev, ME);
    prev = list.length;
    expect(set.size).toBe(3);

    // user clicks m2 in mini-list; at the same moment m4 arrives
    const clickedAt = "2026-05-16T10:01:00Z";
    list.push(msg("m4", "2026-05-16T10:03:00Z"));
    // realtime INSERT applies first
    set = addIncoming(set, list, prev, ME);
    prev = list.length;
    // then the click-handler runs markUpTo with the old cutoff
    set = markUpTo(set, list, clickedAt);

    expect([...set].sort()).toEqual(["m3", "m4"]);
    expect(set.size).toBe(2);
  });

  it("does not drop a message that arrives with the exact same timestamp as the click cutoff", () => {
    let set = new Set<string>();
    const list: UnreadMsg[] = [
      msg("m1", "2026-05-16T10:00:00Z"),
      msg("m2", "2026-05-16T10:01:00Z"),
    ];
    set = addIncoming(set, list, 0, ME);
    // user clicks m1; m3 arrives with cutoff == m2.created_at
    list.push(msg("m3", "2026-05-16T10:02:00Z"));
    set = addIncoming(set, list, 2, ME);
    set = markUpTo(set, list, "2026-05-16T10:00:00Z");
    expect([...set].sort()).toEqual(["m2", "m3"]);
  });

  it("click then INSERT keeps the new arrival counted", () => {
    let set = new Set<string>();
    let prev = 0;
    const list: UnreadMsg[] = [
      msg("m1", "2026-05-16T10:00:00Z"),
      msg("m2", "2026-05-16T10:01:00Z"),
    ];
    set = addIncoming(set, list, prev, ME);
    prev = list.length;

    // click marks m1+m2 as read
    set = markUpTo(set, list, "2026-05-16T10:01:00Z");
    expect(set.size).toBe(0);

    // then m3 arrives via realtime
    list.push(msg("m3", "2026-05-16T10:02:00Z"));
    set = addIncoming(set, list, prev, ME);
    expect([...set]).toEqual(["m3"]);
  });

  it("ignores the user's own message arriving mid-click", () => {
    let set = new Set<string>();
    let prev = 0;
    const list: UnreadMsg[] = [
      msg("m1", "2026-05-16T10:00:00Z"),
      msg("m2", "2026-05-16T10:01:00Z"),
    ];
    set = addIncoming(set, list, prev, ME);
    prev = list.length;

    // own echo arrives between click intent and markUpTo
    list.push(msg("m3", "2026-05-16T10:02:00Z", ME));
    set = addIncoming(set, list, prev, ME);
    prev = list.length;
    set = markUpTo(set, list, "2026-05-16T10:01:00Z");
    expect(set.size).toBe(0);
  });
});

describe("inboxUnread realtime + cross-tab consistency", () => {
  it("stays consistent after INSERT, DELETE and external markSeen", () => {
    let set = new Set<string>();
    let prev = 0;
    const list: UnreadMsg[] = [];

    list.push(msg("m1", "2026-05-16T10:00:00Z"));
    list.push(msg("m2", "2026-05-16T10:01:00Z"));
    list.push(msg("m3", "2026-05-16T10:02:00Z"));
    set = addIncoming(set, list, prev, ME);
    prev = list.length;
    expect(set.size).toBe(3);

    // realtime DELETE removes m2
    const afterDelete = list.filter((m) => m.id !== "m2");
    set = pruneRemoved(set, afterDelete);
    expect([...set].sort()).toEqual(["m1", "m3"]);

    // another tab marks everything up to m1 as read
    set = pruneBySeen(set, afterDelete, "2026-05-16T10:00:00Z");
    expect([...set]).toEqual(["m3"]);
  });
});
});
