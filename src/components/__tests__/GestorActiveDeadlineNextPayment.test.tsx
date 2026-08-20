import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockProfile = {
  role: "gestor_pedagogico" as const,
  is_approved: true,
};
const mockUser = { id: "gestor-active-uuid" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}));

const rpcResponses: Record<string, { data: any; error: any }> = {};
const fromResponse: { data: any; error: any } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn((name: string) =>
      Promise.resolve(rpcResponses[name] ?? { data: null, error: null }),
    ),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(fromResponse),
        }),
      }),
    })),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import GestorTrialBanner from "@/components/GestorTrialBanner";
import SubscriptionDeadlineBanner from "@/components/SubscriptionDeadlineBanner";
import { SubscriptionHeader } from "@/components/SubscriptionHeader";

const renderWith = (ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={["/gestor"]}>{ui}</MemoryRouter>);

const TRIAL_PATTERNS = [/trial/i, /teste/i, /7\s*dias/i, /seu\s+teste/i];

const expectNoTrialCopy = (container: HTMLElement) => {
  const text = container.textContent ?? "";
  for (const re of TRIAL_PATTERNS) expect(text).not.toMatch(re);
};

const setupActive = (daysAhead: number) => {
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString();
  rpcResponses["get_my_trial_status"] = {
    data: [
      {
        is_approved: true,
        approved_until: future,
        trial_expired: false,
        school_subscription_status: "active",
        school_subscription_end_date: future,
        subscription_source: "assinatura_escola",
      },
    ],
    error: null,
  };
  rpcResponses["get_my_subscription_deadline"] = {
    data: [
      {
        subscription_deadline: future,
        days_remaining: daysAhead,
        grace_period_days: 15,
        is_blocked: false,
        in_grace: false,
        school_name: "Escola Teste",
      },
    ],
    error: null,
  };
  fromResponse.data = { status: "ativo", tipo: "mensal", validade: future };
  fromResponse.error = null;
};

describe("Painel /gestor com assinatura ativa: exibe banner 'próximo pagamento'", () => {
  beforeEach(() => {
    Object.keys(rpcResponses).forEach((k) => delete rpcResponses[k]);
  });

  it("Distante (29 dias): mostra 'Assinatura ativa · 29 dias até o próximo pagamento'", async () => {
    setupActive(29);
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/Assinatura ativa · 29 dias até o próximo pagamento/i);
    expect(screen.getByText(/mensalidade vence/i)).toBeInTheDocument();
    expectNoTrialCopy(container);
  });

  it("Próximo (10 dias): mostra 'Próximo pagamento em 10 dias' com CTA Pagar", async () => {
    setupActive(10);
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/Próximo pagamento em 10 dias/i);
    expect(screen.getByRole("button", { name: /Pagar/i })).toBeInTheDocument();
    expectNoTrialCopy(container);
  });

  it("Urgente (3 dias): banner urgente, sem qualquer copy de trial", async () => {
    setupActive(3);
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/Próximo pagamento em 3 dias/i);
    expectNoTrialCopy(container);
  });

  it("1 dia: usa singular 'dia' e mantém copy de pagamento", async () => {
    setupActive(1);
    const { container } = renderWith(<SubscriptionDeadlineBanner />);
    await screen.findByText(/Próximo pagamento em 1 dia\b/i);
    expectNoTrialCopy(container);
  });

  it("Conjunto dos três banners com assinatura ativa: apenas 'próximo pagamento', zero trial", async () => {
    setupActive(29);
    const { container } = renderWith(
      <>
        <GestorTrialBanner />
        <SubscriptionHeader />
        <SubscriptionDeadlineBanner />
      </>,
    );
    await screen.findByText(/próximo pagamento/i);
    // GestorTrialBanner não pode renderizar nó status quando assinatura ativa
    const statuses = container.querySelectorAll('[role="status"]');
    // Apenas o SubscriptionDeadlineBanner deve aparecer
    expect(statuses.length).toBe(1);
    expectNoTrialCopy(container);
  });
});

describe("Painel /gestor em carência (in_grace=true)", () => {
  beforeEach(() => {
    Object.keys(rpcResponses).forEach((k) => delete rpcResponses[k]);
  });

  it("Mostra banner de carência com texto de pagamento/mensalidade e zero copy de trial", async () => {
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    rpcResponses["get_my_trial_status"] = {
      data: [
        {
          is_approved: true,
          approved_until: past,
          trial_expired: false,
          school_subscription_status: "active",
          school_subscription_end_date: past,
          subscription_source: "assinatura_escola",
        },
      ],
      error: null,
    };
    rpcResponses["get_my_subscription_deadline"] = {
      data: [
        {
          subscription_deadline: past,
          days_remaining: -3,
          grace_period_days: 15,
          is_blocked: false,
          in_grace: true,
          school_name: "Escola Teste",
        },
      ],
      error: null,
    };

    const { container } = renderWith(<SubscriptionDeadlineBanner />);

    // Título da carência (12 dias antes do bloqueio: 15 - 3)
    await screen.findByText(/Em carência · 12 dias antes do bloqueio/i);
    // Subtítulo deve mencionar pagamento para evitar bloqueio
    expect(
      screen.getByText(/Pague agora para evitar bloqueio automático/i),
    ).toBeInTheDocument();
    // CTA explícito de pagamento
    expect(screen.getByRole("button", { name: /Pagar/i })).toBeInTheDocument();
    // Sem nenhuma copy de trial
    expectNoTrialCopy(container);
  });

  it("Conjunto dos três banners em carência: apenas banner de carência visível, sem trial", async () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    rpcResponses["get_my_trial_status"] = {
      data: [
        {
          is_approved: true,
          approved_until: past,
          trial_expired: false,
          school_subscription_status: "active",
          school_subscription_end_date: past,
          subscription_source: "assinatura_escola",
        },
      ],
      error: null,
    };
    rpcResponses["get_my_subscription_deadline"] = {
      data: [
        {
          subscription_deadline: past,
          days_remaining: -5,
          grace_period_days: 15,
          is_blocked: false,
          in_grace: true,
          school_name: "Escola Teste",
        },
      ],
      error: null,
    };

    const { container } = renderWith(
      <>
        <GestorTrialBanner />
        <SubscriptionHeader />
        <SubscriptionDeadlineBanner />
      </>,
    );

    await screen.findByText(/Em carência/i);
    const statuses = container.querySelectorAll('[role="status"]');
    expect(statuses.length).toBe(1);
    expectNoTrialCopy(container);
  });
});
