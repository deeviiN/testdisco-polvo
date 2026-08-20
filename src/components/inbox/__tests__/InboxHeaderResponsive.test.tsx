import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InboxPage from "../InboxPage";

vi.mock("@/hooks/useInbox", () => ({
  useInbox: () => ({
    items: [],
    loading: false,
    unreadCount: 0,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    setStatus: vi.fn(),
  }),
}));

function renderAt(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
  return render(
    <MemoryRouter>
      <InboxPage
        audience="admin"
        title="Caixa do Administrador"
        folders={[{ key: "all", label: "Todos", types: ["*"] }]}
      />
    </MemoryRouter>,
  );
}

describe("InboxPage header (responsive)", () => {
  it.each([320, 360, 390, 414, 768, 1024])(
    "keeps title clear of floating toolbar buttons at width %ipx",
    (width) => {
      const { unmount } = renderAt(width);
      const header = screen.getByTestId("inbox-header");

      // Mobile: top padding leaves room for back button (top-left) and global toolbar (top-right)
      expect(header.className).toMatch(/\bpt-16\b/);
      // Desktop fallback restores horizontal padding so title sits between toolbars
      expect(header.className).toMatch(/sm:pl-16/);
      expect(header.className).toMatch(/sm:pr-36/);
      expect(header.className).toMatch(/sm:pt-3/);

      // Title is rendered and not truncated by hidden overflow
      const title = screen.getByRole("heading", { level: 1 });
      expect(title).toHaveTextContent("Caixa do Administrador");
      expect(title.className).not.toMatch(/truncate/);

      unmount();
    },
  );
});
