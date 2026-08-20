import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

const MY_USER_ID = "user-1";
const MY_SCHOOL_ID = "school-1";
const OTHER_SCHOOL_ID = "school-2";

type Handler = (payload: { new: Record<string, unknown> }) => void;
type Filter = { event: string; schema: string; table: string; filter?: string };

const registered: { filter: Filter; handler: Handler }[] = [];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const profilesResult = { data: { school_id: "school-1" }, error: null };
  const countResult = { count: 0, error: null };

  const fromMock = (table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(profilesResult),
          }),
        }),
      };
    }
    // school_messages count chain
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      gt: () => Promise.resolve(countResult),
    };
    return chain;
  };

  const createChannel = () => {
    const entries: { filter: Filter; handler: Handler }[] = [];
    const ch: any = {
      __entries: entries,
      on: (_evt: string, filter: Filter, handler: Handler) => {
        const entry = { filter, handler };
        entries.push(entry);
        registered.push(entry);
        return ch;
      },
      subscribe: () => ch,
    };
    return ch;
  };

  return {
    supabase: {
      from: fromMock,
      channel: () => createChannel(),
      removeChannel: (ch: any) => {
        if (ch && Array.isArray(ch.__entries)) {
          for (const entry of ch.__entries) {
            const i = registered.indexOf(entry);
            if (i >= 0) registered.splice(i, 1);
          }
        }
      },
    },
  };
});

import { useSchoolMessagesUnread } from "../useSchoolMessagesUnread";
import { supabase } from "@/integrations/supabase/client";

const emit = (row: Record<string, unknown>) => {
  // Simulate Supabase Realtime: server-side filter only delivers matching rows.
  for (const { filter, handler } of registered) {
    if (filter.event !== "INSERT") continue;
    if (filter.table !== "school_messages") continue;
    const f = filter.filter ?? "";
    const match = f.match(/^school_id=eq\.(.+)$/);
    if (match && row.school_id !== match[1]) continue;
    handler({ new: row });
  }
};

describe("useSchoolMessagesUnread", () => {
  beforeEach(() => {
    registered.length = 0;
    localStorage.clear();
  });

  it("registra apenas listener INSERT filtrado pelo schoolId", async () => {
    renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));
    expect(registered[0].filter.event).toBe("INSERT");
    expect(registered[0].filter.table).toBe("school_messages");
    expect(registered[0].filter.filter).toBe(`school_id=eq.${MY_SCHOOL_ID}`);
  });

  it("incrementa em INSERT da minha escola enviado por outro usuário", async () => {
    const { result } = renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    act(() => {
      emit({
        school_id: MY_SCHOOL_ID,
        sender_user_id: "user-2",
        created_at: new Date().toISOString(),
      });
    });

    expect(result.current.unread).toBe(1);
  });

  it("não incrementa para INSERT de outra escola", async () => {
    const { result } = renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    act(() => {
      emit({
        school_id: OTHER_SCHOOL_ID,
        sender_user_id: "user-2",
        created_at: new Date().toISOString(),
      });
    });

    expect(result.current.unread).toBe(0);
  });

  it("não incrementa para mensagens enviadas pelo próprio usuário", async () => {
    const { result } = renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    act(() => {
      emit({
        school_id: MY_SCHOOL_ID,
        sender_user_id: MY_USER_ID,
        created_at: new Date().toISOString(),
      });
    });

    expect(result.current.unread).toBe(0);
  });

  it("não incrementa quando created_at é anterior ao lastSeen", async () => {
    localStorage.setItem(
      `school_messages_last_seen:${MY_USER_ID}`,
      new Date().toISOString()
    );

    const { result } = renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    act(() => {
      emit({
        school_id: MY_SCHOOL_ID,
        sender_user_id: "user-2",
        created_at: new Date(Date.now() - 60_000).toISOString(),
      });
    });

    expect(result.current.unread).toBe(0);
  });

  it("acumula múltiplos INSERTs válidos", async () => {
    const { result } = renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    act(() => {
      emit({ school_id: MY_SCHOOL_ID, sender_user_id: "user-2", created_at: new Date().toISOString() });
      emit({ school_id: MY_SCHOOL_ID, sender_user_id: "user-3", created_at: new Date().toISOString() });
      emit({ school_id: OTHER_SCHOOL_ID, sender_user_id: "user-2", created_at: new Date().toISOString() });
    });

    expect(result.current.unread).toBe(2);
  });

  it("remove o canal do Supabase ao desmontar", async () => {
    const removeSpy = vi.spyOn(supabase, "removeChannel");
    const { unmount } = renderHook(() => useSchoolMessagesUnread());
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    expect(removeSpy).not.toHaveBeenCalled();
    unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0][0]).toBeDefined();
    removeSpy.mockRestore();
  });

  it("não duplica contagem sob React.StrictMode (double-invoke de efeitos)", async () => {
    const { result } = renderHook(() => useSchoolMessagesUnread(), {
      wrapper: StrictMode,
    });

    // Aguarda os efeitos estabilizarem após o ciclo mount/unmount/mount do StrictMode.
    await waitFor(() => expect(registered.length).toBeGreaterThan(0));

    // Apenas um listener deve estar ativo (o segundo mount substituiu o primeiro).
    expect(registered.length).toBe(1);

    act(() => {
      emit({
        school_id: MY_SCHOOL_ID,
        sender_user_id: "user-2",
        created_at: new Date().toISOString(),
      });
    });

    // Sem duplicação: 1 INSERT => 1 incremento.
    expect(result.current.unread).toBe(1);
  });
});
