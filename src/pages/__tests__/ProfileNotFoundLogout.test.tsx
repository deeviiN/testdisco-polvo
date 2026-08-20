import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileNotFound } from "@/pages/Index";

// Mocks
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ refreshProfile: vi.fn() }),
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

vi.mock("@/hooks/useSupportContact", () => ({
  useSupportContact: () => ({ buildWhatsappUrl: () => "https://wa.me/test" }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const renderScreen = () =>
  render(
    <MemoryRouter>
      <ProfileNotFound userId="user-1" userEmail="t@t.com" role="default" />
    </MemoryRouter>
  );

describe("ProfileNotFound — botão Sair", () => {
  beforeEach(() => {
    // Stub para window.location.replace
    Object.defineProperty(window, "location", {
      value: { ...window.location, replace: vi.fn(), reload: vi.fn() },
      writable: true,
    });
  });

  it("exibe o botão Sair (autoRetry desligado) imediatamente abaixo de Tentar novamente", async () => {
    renderScreen();
    const sair = await screen.findByRole("button", { name: /sair/i });
    const tentar = screen.getByRole("button", { name: /tentar novamente/i });
    expect(sair).toBeInTheDocument();
    expect(tentar).toBeInTheDocument();

    // Mesmo container pai (flex de ações)
    const container = sair.parentElement!;
    expect(container).toBe(tentar.parentElement);

    // Sair vem logo após Tentar novamente
    const buttons = within(container).getAllByRole("button");
    const idxTentar = buttons.indexOf(tentar);
    const idxSair = buttons.indexOf(sair);
    expect(idxSair).toBe(idxTentar + 1);
  });

  it("mantém o botão Sair logo abaixo de Tentar novamente quando autoRetry está ligado", async () => {
    renderScreen();
    // Liga autoRetry clicando no botão de redirect (label vem do role 'default')
    const buttonsBefore = screen.getAllByRole("button");
    const redirectBtn = buttonsBefore.find(
      (b) => !/sair|tentar novamente|suporte|copiar/i.test(b.textContent || "")
    );
    if (redirectBtn) fireEvent.click(redirectBtn);

    await waitFor(() => {
      // botão de redirect some quando autoRetry liga
      expect(screen.queryByRole("button", { name: redirectBtn?.textContent || "__none__" })).not.toBeInTheDocument();
    });

    const sair = screen.getByRole("button", { name: /sair/i });
    const tentar = screen.getByRole("button", { name: /tentar novamente/i });
    const container = sair.parentElement!;
    expect(container).toBe(tentar.parentElement);
    const buttons = within(container).getAllByRole("button");
    const idxTentar = buttons.indexOf(tentar);
    const idxSair = buttons.indexOf(sair);
    expect(idxSair).toBe(idxTentar + 1);
  });

  it("ao clicar em Sair, executa signOut e redireciona para /auth", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    renderScreen();
    const sair = await screen.findByRole("button", { name: /sair/i });
    fireEvent.click(sair);
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect((window.location.replace as any)).toHaveBeenCalledWith("/auth");
    });
  });
});
