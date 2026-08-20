import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---
const mockProfile = {
  role: "gestor_pedagogico" as const,
  is_approved: true,
};
const mockUser = { id: "gestor-dafine-uuid" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}));

// Estado mutável para simular respostas do Supabase
const rpcResponses: Record<string, any> = {};

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: vi.fn((name: string) => {
        const data = rpcResponses[name] ?? null;
        return Promise.resolve({ data, error: null });
      }),
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: rpcResponses["__assinaturas__"] ?? null, error: null }),
          }),
        }),
      })),
      channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import GestorTrialBanner from "@/components/GestorTrialBanner";
import SubscriptionDeadlineBanner from "@/components/SubscriptionDeadlineBanner";
import { SubscriptionHeader } from "@/components/SubscriptionHeader";

const renderWith = (ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={["/gestor"]}>{ui}</MemoryRouter>);

const TRIAL_PATTERNS = [
  /trial/i,
  /teste/i,
  /7\s*dias/i,
  /seu\s+teste/i,
];

const expectNoTrialCopy = (container: HTMLElement) => {
  const text = container.textContent ?? "";
  for (const re of TRIAL_PATTERNS) {
    expect(text).not.toMatch(re);
  }
};

describe("Gestora com assinatura ativa: nenhum banner de trial em /gestor", () => {
  beforeEach(() => {
    // Cenário: gestora paga mensal, vence em 29 dias
    const future = new Date(Date.now() + 29 * 86400000).toISOString();

    rpcResponses["get_my_trial_status"] = [
      {
        is_approved: true,
        approved_until: future,
        trial_expired: false,
        school_subscription_status: "active",
        school_subscription_end_date: future,
        subscription_source: "assinatura_escola",
      },
    ];

    rpcResponses["get_my_subscription_deadline"] = [
      {
        subscription_deadline: future,
        days_remaining: 29,
        grace_period_days: 15,
        is_blocked: false,
        in_grace: false,
        school_name: "Escola Teste",
      },
    ];

    rpcResponses["__assinaturas__"] = {
      status: "ativo",
      tipo: "mensal",
      validade: future,
    };
  });

  it("GestorTrialBanner não renderiza quando assinatura está ativa", async () => {
    const { container } = renderWith(<GestorTrialBanner />);
    // Aguarda effect assíncrono terminar
    await waitFor(() => {
      // Sem nó de status
      expect(container.querySelector('[role="status"]')).toBeNull();
    });
    expectNoTrialCopy(container);
  });

  it("SubscriptionHeader não renderiza para perfil de gestora", async () => {
    const { container } = renderWith(<SubscriptionHeader />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
    expectNoTrialCopy(container);
  });

  it("SubscriptionDeadlineBanner mostra apenas mensagem de próximo pagamento, sem trial", async () => {
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/Assinatura ativa/i);
    expect(screen.getByText(/próximo pagamento/i)).toBeInTheDocument();
    expect(screen.getByText(/mensalidade/i)).toBeInTheDocument();
    expectNoTrialCopy(container);
  });

  it("Conjunto dos três banners renderizados juntos: zero menção a trial", async () => {
    const { container } = renderWith(
      <>
        <GestorTrialBanner />
        <SubscriptionHeader />
        <SubscriptionDeadlineBanner />
      </>,
    );
    await screen.findByText(/Assinatura ativa/i);
    expectNoTrialCopy(container);
  });
});

describe("Gestora em carência ou bloqueada: ainda sem copy de trial", () => {
  it("Em carência: texto fala em mensalidade/bloqueio, não em trial", async () => {
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    rpcResponses["get_my_subscription_deadline"] = [
      {
        subscription_deadline: past,
        days_remaining: -3,
        grace_period_days: 15,
        is_blocked: false,
        in_grace: true,
        school_name: "Escola Teste",
      },
    ];
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/carência/i);
    expectNoTrialCopy(container);
  });

  it("Bloqueada: texto fala em assinatura expirada, não em trial", async () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    rpcResponses["get_my_subscription_deadline"] = [
      {
        subscription_deadline: past,
        days_remaining: -30,
        grace_period_days: 15,
        is_blocked: true,
        in_grace: false,
        school_name: "Escola Teste",
      },
    ];
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/Assinatura expirada/i);
    expectNoTrialCopy(container);
  });
});
