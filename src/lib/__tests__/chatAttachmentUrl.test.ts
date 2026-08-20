import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock do supabase antes do import do módulo sob teste
let signCounter = 0;
const createSignedUrl = vi.fn(async (path: string, _ttl: number) => {
  signCounter += 1;
  return {
    data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/chat_attachments/${path}?token=sig-${signCounter}` },
    error: null,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

import {
  extractChatAttachmentPath,
  invalidateChatAttachmentUrl,
  useChatAttachmentUrl,
} from "@/lib/chatAttachmentUrl";

describe("chatAttachmentUrl - expiração e reassinatura", () => {
  beforeEach(() => {
    signCounter = 0;
    createSignedUrl.mockClear();
  });

  it("extractChatAttachmentPath aceita path relativo e URLs antigas", () => {
    expect(extractChatAttachmentPath("user-1/foto.png")).toBe("user-1/foto.png");
    expect(
      extractChatAttachmentPath(
        "https://x.supabase.co/storage/v1/object/public/chat_attachments/user-1/foto.png",
      ),
    ).toBe("user-1/foto.png");
    expect(
      extractChatAttachmentPath(
        "https://x.supabase.co/storage/v1/object/sign/chat_attachments/user-1/foto.png?token=old",
      ),
    ).toBe("user-1/foto.png");
  });

  it("assina uma vez e reutiliza cache em novo mount", async () => {
    const { result, unmount } = renderHook(() => useChatAttachmentUrl("user-1/a.png"));
    await waitFor(() => expect(result.current.url).toContain("sig-1"));
    unmount();

    const again = renderHook(() => useChatAttachmentUrl("user-1/a.png"));
    await waitFor(() => expect(again.result.current.url).toContain("sig-1"));
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("ao invalidar (URL expirada), refresh() emite nova URL assinada", async () => {
    const { result } = renderHook(() => useChatAttachmentUrl("user-1/b.png"));
    await waitFor(() => expect(result.current.url).toContain("sig-1"));

    // Simula que o token expirou (400/403 na mídia) — o componente chama refresh().
    invalidateChatAttachmentUrl("user-1/b.png");
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.url).toContain("sig-2"));
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
