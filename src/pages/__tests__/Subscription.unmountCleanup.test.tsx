/**
 * Teste: o setTimeout(700ms) dos botões PIX/Boleto/Cartão na página real
 * `/subscription` é cancelado no unmount, evitando setState após desmontar
 * (warning "Can't perform a React state update on an unmounted component").
 *
 * Estratégia:
 *   1. Mocka dependências externas (idêntico ao integration test existente).
 *   2. Navega o componente real até a etapa "payment".
 *   3. Espia `window.setTimeout` e `window.clearTimeout`.
 *   4. Clica em um botão de pagamento → captura o timer id retornado pelo
 *      setTimeout(700ms).
 *   5. Desmonta o componente ANTES do timeout disparar.
 *   6. Verifica que `clearTimeout` foi chamado com aquele timer id.
 *   7. Avança o tempo e confirma que NENHUM warning de setState pós-unmount
 *      foi emitido em console.error.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks (mesma base do integration test existente) -------------------

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
      "select", "insert", "update", "delete", "upsert", "eq", "in", "neq",
      "gte", "lte", "order", "limit", "range", "match", "or", "single", "maybeSingle",
    ].forEach((m) => { obj[m] = vi.fn(() => obj); });
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
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
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
    error: vi.fn(), success: vi.fn(), info: vi.fn(),
    warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn(),
  },
}));

vi.mock("html2canvas", () => ({ default: vi.fn(async () => ({ toDataURL: () => "" })) }));
vi.mock("jspdf", () => ({
  default: vi.fn(() => ({
    addImage: vi.fn(), save: vi.fn(), addPage: vi.fn(),
    setFontSize: vi.fn(), text: vi.fn(),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  })),
}));

import Subscription from "@/pages/Subscription";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/subscription"]}>
      <Subscription />
    </MemoryRouter>
  );
}

async function navigateToPaymentStep() {
  // Plans → seleciona o primeiro plano e clica Continuar
  const planButtons = screen.getAllByRole("button").filter((b) =>
    /Mensal|Anual|Plano/i.test(b.textContent ?? "")
  );
  if (planButtons[0]) fireEvent.click(planButtons[0]);

  const continueButtons = screen.getAllByRole("button").filter((b) =>
    /Continuar/i.test(b.textContent ?? "")
  );
  fireEvent.click(continueButtons[continueButtons.length - 1]);

  // Diálogo de confirmação → Continuar
  await waitFor(() => {
    const dialogContinue = screen.getAllByRole("button")
      .find((b) => /Continuar/i.test(b.textContent ?? "") && !b.hasAttribute("aria-disabled"));
    expect(dialogContinue).toBeTruthy();
  });
  const allContinue = screen.getAllByRole("button").filter((b) => /Continuar/i.test(b.textContent ?? ""));
  fireEvent.click(allContinue[allContinue.length - 1]);

  // Network → Particular
  const particular = await screen.findByText(/Particular/i);
  fireEvent.click(particular.closest("button")!);

  // INEP particular → continuar sem INEP
  await waitFor(() => {
    const skipBtn = screen.getAllByRole("button")
      .find((b) => /sem INEP|Continuar/i.test(b.textContent ?? ""));
    expect(skipBtn).toBeTruthy();
  });
  const inepButtons = screen.getAllByRole("button");
  const skip =
    inepButtons.find((b) => /sem INEP/i.test(b.textContent ?? "")) ??
    inepButtons.find((b) => /^\s*Continuar/i.test(b.textContent ?? ""));
  fireEvent.click(skip!);

  // School-data: preenche campos mínimos
  await screen.findByText(/Dados da Escola/i);
  const inputs = document.querySelectorAll("input");
  const setVal = (idx: number, value: string) => {
    const el = inputs[idx] as HTMLInputElement;
    if (el) fireEvent.change(el, { target: { value } });
  };
  setVal(0, "12345678000190");
  setVal(1, "11144477735"); // CPF válido
  setVal(2, "01001000");
  setVal(3, "Praça da Sé");
  setVal(4, "100");
  setVal(5, "Sé");
  setVal(8, "(11) 91234-5678");
  setVal(9, "escola@particular.com");

  const submitBtn = Array.from(document.querySelectorAll("button"))
    .find((b) => /Continuar para Pagamento/i.test(b.textContent ?? ""));
  fireEvent.click(submitBtn!);

  // Confirma payment step
  await waitFor(() => {
    const found = Array.from(document.querySelectorAll("h2")).some((h) =>
      /Forma de\s*Pagamento/i.test(h.textContent ?? "")
    );
    expect(found).toBe(true);
  });
}

beforeEach(() => {
  (global as any).fetch = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("viacep")) {
      return {
        ok: true,
        json: async () => ({
          logradouro: "Praça da Sé", bairro: "Sé",
          localidade: "São Paulo", uf: "SP",
        }),
      } as any;
    }
    return { ok: true, json: async () => ({}) } as any;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Subscription /subscription — cleanup do timeout no unmount", () => {
  it("cancela o setTimeout(700ms) ao desmontar e não dispara setState após unmount", async () => {
    const { unmount } = renderPage();
    await navigateToPaymentStep();

    // Localiza os 3 botões da grade de pagamento
    const paymentButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")
    );
    expect(paymentButtons.length).toBe(3);

    // Espia setTimeout/clearTimeout para capturar o id do timer de 700ms
    const setSpy = vi.spyOn(window, "setTimeout");
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Clica em PIX para iniciar o timer de 700ms
    fireEvent.click(paymentButtons[0]);

    const timer700 = setSpy.mock.results
      .map((r, i) => ({ id: r.value as number, delay: setSpy.mock.calls[i][1] }))
      .find((c) => c.delay === 700);
    expect(timer700).toBeTruthy();

    // Desmonta a página ANTES do timeout disparar
    unmount();

    // clearTimeout deve ter sido chamado com o id do timer de 700ms
    const clearedIds = clearSpy.mock.calls.map((c) => c[0]);
    expect(clearedIds).toContain(timer700!.id);

    // Avança o "tempo" (na real, só validamos que nenhum warning foi emitido,
    // pois o timer já foi limpo e não dispararia o callback).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Nenhum warning do React do tipo "state update on unmounted component"
    const warnings = errorSpy.mock.calls
      .map((c) => String(c[0] ?? ""))
      .filter((m) => /unmounted component|memory leak|update.*unmounted/i.test(m));
    expect(warnings).toEqual([]);

    setSpy.mockRestore();
    clearSpy.mockRestore();
    errorSpy.mockRestore();
  }, 20000);
});
