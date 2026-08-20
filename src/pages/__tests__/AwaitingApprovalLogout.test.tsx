import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Index from "@/pages/Index";

// Mocks
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "t@t.com", user_metadata: {} },
    profile: {
      id: "p1",
      user_id: "user-1",
      full_name: "Fulano",
      role: "teacher",
      is_approved: false,
      school_id: "s1",
    },
    loading: false,
    refreshProfile: vi.fn(),
  }),
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
    <MemoryRouter initialEntries={["/home"]}>
      <Index />
    </MemoryRouter>
  );

describe("Aguardando aprovação — botão Sair", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, replace: vi.fn(), reload: vi.fn() },
      writable: true,
    });
  });

  it("exibe o botão Sair logo abaixo de 'Verificar novamente' na tela 'Aguardando aprovação'", async () => {
    renderScreen();
    expect(await screen.findByText(/aguardando aprovação/i)).toBeInTheDocument();
    const sair = screen.getByRole("button", { name: /sair/i });
    const verificar = screen.getByRole("button", { name: /verificar novamente/i });
    expect(sair).toBeInTheDocument();
    expect(verificar).toBeInTheDocument();

    // Mesmo container pai e Sair logo após Verificar novamente
    const container = sair.parentElement!;
    expect(container).toBe(verificar.parentElement);
    const buttons = within(container).getAllByRole("button");
    expect(buttons.indexOf(sair)).toBe(buttons.indexOf(verificar) + 1);
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
