import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockProfile = {
  role: "gestor_pedagogico" as const,
  is_approved: true,
};
const mockUser = { id: "gestor-fallback-uuid" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}));

// Resposta configurável por RPC
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

describe("Painel /gestor: fallback quando RPCs falham ou retornam null", () => {
  beforeEach(() => {
    Object.keys(rpcResponses).forEach((k) => delete rpcResponses[k]);
    fromResponse.data = null;
    fromResponse.error = null;
  });

  describe("RPC retorna null", () => {
    beforeEach(() => {
      rpcResponses["get_my_trial_status"] = { data: null, error: null };
      rpcResponses["get_my_subscription_deadline"] = { data: null, error: null };
    });

    it("GestorTrialBanner não renderiza quando status é null", async () => {
      const { container } = renderWith(<GestorTrialBanner />);
      await waitFor(() => {
        expect(container.querySelector('[role="status"]')).toBeNull();
      });
      expectNoTrialCopy(container);
    });

    it("SubscriptionDeadlineBanner não renderiza quando deadline é null", async () => {
      const { container } = renderWith(<SubscriptionDeadlineBanner />);
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
      expectNoTrialCopy(container);
    });

    it("Conjunto de banners: ausência total = fallback consistente, sem trial", async () => {
      const { container } = renderWith(
        <>
          <GestorTrialBanner />
          <SubscriptionHeader />
          <SubscriptionDeadlineBanner />
        </>,
      );
      await waitFor(() => {
        expect(container.querySelector('[role="status"]')).toBeNull();
      });
      expectNoTrialCopy(container);
    });
  });

  describe("RPC retorna erro", () => {
    beforeEach(() => {
      rpcResponses["get_my_trial_status"] = {
        data: null,
        error: { code: "42501", message: "permission denied" },
      };
      rpcResponses["get_my_subscription_deadline"] = {
        data: null,
        error: { code: "PGRST116", message: "RPC failed" },
      };
      fromResponse.error = { message: "RLS denied", code: "42501" };
    });

    it("GestorTrialBanner permanece silencioso quando RPC falha", async () => {
      const { container } = renderWith(<GestorTrialBanner />);
      await waitFor(() => {
        expect(container.querySelector('[role="status"]')).toBeNull();
      });
      expectNoTrialCopy(container);
    });

    it("SubscriptionDeadlineBanner permanece silencioso quando RPC falha", async () => {
      const { container } = renderWith(<SubscriptionDeadlineBanner />);
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
      expectNoTrialCopy(container);
    });

    it("SubscriptionHeader não renderiza para gestora mesmo com erro", async () => {
      const { container } = renderWith(<SubscriptionHeader />);
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
      expectNoTrialCopy(container);
    });

    it("Conjunto de banners com falha total: nenhuma copy de trial é exibida", async () => {
      const { container } = renderWith(
        <>
          <GestorTrialBanner />
          <SubscriptionHeader />
          <SubscriptionDeadlineBanner />
        </>,
      );
      await waitFor(() => {
        expect(container.querySelector('[role="status"]')).toBeNull();
      });
      expectNoTrialCopy(container);
    });
  });

  describe("Resposta parcial (subscription_deadline ausente)", () => {
    it("Linha sem subscription_deadline não exibe banner", async () => {
      rpcResponses["get_my_subscription_deadline"] = {
        data: [
          {
            subscription_deadline: null,
            days_remaining: null,
            grace_period_days: 15,
            is_blocked: false,
            in_grace: false,
            school_name: "Escola X",
          },
        ],
        error: null,
      };
      const { container } = renderWith(<SubscriptionDeadlineBanner />);
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
      expectNoTrialCopy(container);
    });
  });
});
