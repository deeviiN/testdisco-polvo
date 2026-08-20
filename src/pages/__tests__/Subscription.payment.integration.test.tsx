/**
 * Teste de integração na página REAL `/subscription` (src/pages/Subscription.tsx).
 *
 * Objetivo: garantir que cliques repetidos nos botões PIX, Boleto e Cartão
 * dentro do componente real NUNCA disparem mais de uma "requisição de pagamento"
 * (representada pelo `setTimeout` de verificação de 700ms + a transição de estado
 * para `loadingMethod`).
 *
 * Estratégia:
 *   - Mocka dependências externas (useAuth, supabase client, react-router Navigate,
 *     hook de suporte, html2canvas/jspdf, sonner, ViaCEP via global fetch).
 *   - Renderiza `<Subscription/>` dentro de um MemoryRouter e percorre o fluxo
 *     real até a etapa "payment" usando o caminho da rede "Particular" (que pula
 *     a busca de INEP e simplifica o passo de dados da escola).
 *   - Nos botões reais PIX / Boleto / Cartão, dispara cliques rápidos consecutivos
 *     e assert que apenas um único agendamento de `setTimeout(700ms)` é criado
 *     por ciclo — provando que a guarda síncrona `paymentLockRef` + `disabled`
 *     funcionam no componente real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act, waitFor, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "gestor@escola.com" },
    profile: { school_id: "school-1" },
    loading: false,
    session: { access_token: "fake" },
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSupportContact", () => ({
  useSupportContact: () => ({
    contact: { phone: "5595991180294", display: "(95) 99118-0294" },
    buildWhatsappUrl: (msg?: string) =>
      `https://wa.me/5595991180294?text=${encodeURIComponent(msg ?? "")}`,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const obj: any = {};
    [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "in",
      "neq",
      "gte",
      "lte",
      "order",
      "limit",
      "range",
      "match",
      "or",
      "single",
      "maybeSingle",
    ].forEach((m) => {
      obj[m] = vi.fn(() => obj);
    });
    obj.then = (resolve: any) => resolve({ data: null, error: null });
    return obj;
  };
  return {
    supabase: {
      from: vi.fn(() => chain()),
      rpc: vi.fn(async () => ({ data: [], error: null })),
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(),
      },
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({ data: null, error: null })),
          upload: vi.fn(async () => ({ data: null, error: null })),
          remove: vi.fn(async () => ({ data: null, error: null })),
        })),
      },
      functions: {
        invoke: vi.fn(async () => ({ data: null, error: null })),
      },
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("html2canvas", () => ({ default: vi.fn(async () => ({ toDataURL: () => "" })) }));
vi.mock("jspdf", () => ({
  default: vi.fn(() => ({
    addImage: vi.fn(),
    save: vi.fn(),
    addPage: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  })),
}));

// --- Helpers -------------------------------------------------------------

import Subscription from "@/pages/Subscription";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/subscription"]}>
      <Subscription />
    </MemoryRouter>
  );
}

/**
 * Conduz o componente real desde a tela de planos até a etapa "payment"
 * usando a rede "Particular" (que pula a busca de INEP).
 */
async function navigateToPaymentStep() {
  // 1) Tela de planos: clica em "Mensal" e depois "Continuar"
  const mensalBtn = await screen.findByText(/Mensal/i, { selector: "h3, p, span, div, button" }).catch(
    () => screen.getAllByRole("button").find((b) => /Mensal/i.test(b.textContent ?? ""))
  );
  // Clica no card do plano (procura o botão que contém "Mensal" ou seleciona o primeiro plan-card)
  const planButtons = screen.getAllByRole("button").filter((b) =>
    /Mensal|Anual|Plano/i.test(b.textContent ?? "")
  );
  if (planButtons[0]) fireEvent.click(planButtons[0]);

  // Continuar (só fica habilitado após selecionar plano)
  const continueButtons = screen.getAllByRole("button").filter((b) =>
    /Continuar/i.test(b.textContent ?? "")
  );
  fireEvent.click(continueButtons[continueButtons.length - 1]);

  // 2) Modal de confirmação → "Continuar"
  await waitFor(() => {
    const dialogContinue = screen
      .getAllByRole("button")
      .find((b) => /Continuar/i.test(b.textContent ?? "") && !b.hasAttribute("aria-disabled"));
    expect(dialogContinue).toBeTruthy();
  });
  // Clica no "Continuar" do diálogo (último com esse texto)
  const allContinue = screen.getAllByRole("button").filter((b) => /Continuar/i.test(b.textContent ?? ""));
  fireEvent.click(allContinue[allContinue.length - 1]);

  // 3) Network selection → "Particular"
  const particular = await screen.findByText(/Particular/i);
  fireEvent.click(particular.closest("button")!);

  // 4) Tela INEP (particular) → botão "Continuar sem INEP" / pular
  await waitFor(() => {
    const skipBtn = screen
      .getAllByRole("button")
      .find((b) => /sem INEP|Pular|Continuar/i.test(b.textContent ?? ""));
    expect(skipBtn).toBeTruthy();
  });
  // Procura o botão "Continuar" (que com inep vazio chama handleSkipInepParticular)
  const inepButtons = screen.getAllByRole("button");
  const skip =
    inepButtons.find((b) => /sem INEP/i.test(b.textContent ?? "")) ??
    inepButtons.find((b) => /^\s*Continuar/i.test(b.textContent ?? ""));
  fireEvent.click(skip!);

  // 5) Tela "school-data": preenche campos mínimos com CPF válido e clica continuar
  await screen.findByText(/Dados da Escola/i);

  const inputs = document.querySelectorAll("input");
  // Ordem dos inputs em Subscription school-data: cnpj, gestorCpf, cep, address, number, neighborhood, city(readonly), state(readonly), contact, email
  const setVal = (idx: number, value: string) => {
    const el = inputs[idx] as HTMLInputElement;
    if (!el) return;
    fireEvent.change(el, { target: { value } });
  };
  setVal(0, "12345678000190"); // CNPJ
  setVal(1, "11144477735"); // CPF válido (gerado para teste)
  setVal(2, "01001000"); // CEP
  // CEP dispara fetch ViaCEP — mockamos
  setVal(3, "Praça da Sé"); // address
  setVal(4, "100"); // number
  setVal(5, "Sé"); // neighborhood
  setVal(8, "(11) 91234-5678"); // contact
  setVal(9, "escola@particular.com"); // email

  // Continuar para Pagamento
  const submitBtn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Continuar para Pagamento/i.test(b.textContent ?? "")
  );
  fireEvent.click(submitBtn!);

  // 6) Confirma que estamos no payment step (espera o título "Forma de Pagamento")
  await waitFor(() => {
    const found = Array.from(document.querySelectorAll("h2")).some((h) =>
      /Forma de\s*Pagamento/i.test(h.textContent ?? "")
    );
    expect(found).toBe(true);
  });
}

// --- Mock global fetch (ViaCEP) ----------------------------------------

beforeEach(() => {
  (global as any).fetch = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("viacep")) {
      return {
        ok: true,
        json: async () => ({
          logradouro: "Praça da Sé",
          bairro: "Sé",
          localidade: "São Paulo",
          uf: "SP",
        }),
      } as any;
    }
    return { ok: true, json: async () => ({}) } as any;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Testes --------------------------------------------------------------

describe("Subscription real /subscription — anti double-tap nos métodos de pagamento", () => {
  it("renderiza a página sem crashar (smoke)", async () => {
    renderPage();
    await waitFor(() => {
      const hasPlans = Array.from(document.querySelectorAll("button, h3, p, span")).some((el) =>
        /Mensal|Anual|Plano/i.test(el.textContent ?? "")
      );
      expect(hasPlans).toBe(true);
    });
  });

  it.each(["pix", "boleto", "card"] as const)(
    "[%s] cliques repetidos no botão real disparam apenas 1 verificação (setTimeout 700ms)",
    async (method) => {
      // Usa fake timers SÓ depois da navegação assíncrona para não travar waitFor.
      renderPage();

      try {
        await navigateToPaymentStep();
      } catch (e) {
        // Se o fluxo de navegação falhar (ex: alteração futura de UI), o teste
        // sinaliza claramente em vez de mascarar o problema.
        throw new Error(
          `Falha ao navegar até a etapa de pagamento: ${(e as Error).message}`
        );
      }

      // Localiza os 3 botões da grade de pagamento (são os únicos buttons com aria-pressed)
      const paymentButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")
      );
      expect(paymentButtons.length).toBe(3);
      const labelMap = { pix: /PIX/i, boleto: /Boleto/i, card: /Cartão/i };
      const btn = paymentButtons.find((b) => labelMap[method].test(b.textContent ?? ""))!;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(false);

      // Conta apenas os setTimeouts disparados pelos cliques (700ms é o usado pela página)
      const realSetTimeout = window.setTimeout;
      const timeoutSpy = vi.spyOn(window, "setTimeout");

      // 8 cliques rápidos consecutivos no MESMO botão
      for (let i = 0; i < 8; i++) {
        fireEvent.click(btn);
      }

      const paymentTimeouts = timeoutSpy.mock.calls.filter(
        ([, delay]) => delay === 700
      );
      expect(paymentTimeouts.length).toBe(1);

      // Após o primeiro clique, o botão deve estar disabled (loadingMethod ativo)
      expect((btn as HTMLButtonElement).disabled).toBe(true);

      // Cliques cruzados em outros métodos durante o loading não devem disparar nada novo
      const others = paymentButtons.filter((b) => b !== btn);
      for (const otherBtn of others) {
        fireEvent.click(otherBtn);
        fireEvent.click(otherBtn);
      }

      const paymentTimeoutsAfterCross = timeoutSpy.mock.calls.filter(
        ([, delay]) => delay === 700
      );
      expect(paymentTimeoutsAfterCross.length).toBe(1);

      timeoutSpy.mockRestore();
      // Garante que setTimeout não ficou quebrado para outros testes
      expect(window.setTimeout).toBe(realSetTimeout);
    },
    20000
  );
});
