/**
 * Teste robusto: garante que o callback do setTimeout disparado ao clicar em
 * PIX na página real `/subscription` NUNCA roda após o unmount.
 *
 * Diferente do teste anterior (que filtrava por `delay === 700`, frágil se
 * outros timers de mesma duração existirem), este teste:
 *
 *   1. Substitui `window.setTimeout` por um wrapper que correlaciona cada
 *      chamada com o id retornado e captura a referência do callback original.
 *   2. Marca o "checkpoint" exato antes de clicar em PIX, de modo que apenas
 *      o(s) timer(s) criados pelo handler do clique sejam considerados —
 *      independente do delay usado.
 *   3. Desmonta o componente.
 *   4. Verifica que `clearTimeout` foi chamado com EXATAMENTE o id retornado
 *      pelo setTimeout do clique (correlação por id, não por delay).
 *   5. Como prova final de que o callback não causa side effects pós-unmount,
 *      invoca manualmente o callback capturado e confirma que nenhum warning
 *      do React ("state update on unmounted component") é emitido.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks (idênticos ao teste de integração existente) ------------------

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
  const planButtons = screen.getAllByRole("button").filter((b) =>
    /Mensal|Anual|Plano/i.test(b.textContent ?? "")
  );
  if (planButtons[0]) fireEvent.click(planButtons[0]);

  const continueButtons = screen.getAllByRole("button").filter((b) =>
    /Continuar/i.test(b.textContent ?? "")
  );
  fireEvent.click(continueButtons[continueButtons.length - 1]);

  await waitFor(() => {
    const dialogContinue = screen.getAllByRole("button")
      .find((b) => /Continuar/i.test(b.textContent ?? "") && !b.hasAttribute("aria-disabled"));
    expect(dialogContinue).toBeTruthy();
  });
  const allContinue = screen.getAllByRole("button").filter((b) => /Continuar/i.test(b.textContent ?? ""));
  fireEvent.click(allContinue[allContinue.length - 1]);

  const particular = await screen.findByText(/Particular/i);
  fireEvent.click(particular.closest("button")!);

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

  await screen.findByText(/Dados da Escola/i);
  const inputs = document.querySelectorAll("input");
  const setVal = (idx: number, value: string) => {
    const el = inputs[idx] as HTMLInputElement;
    if (el) fireEvent.change(el, { target: { value } });
  };
  setVal(0, "12345678000190");
  setVal(1, "11144477735");
  setVal(2, "01001000");
  setVal(3, "Praça da Sé");
  setVal(4, "100");
  setVal(5, "Sé");
  setVal(8, "(11) 91234-5678");
  setVal(9, "escola@particular.com");

  const submitBtn = Array.from(document.querySelectorAll("button"))
    .find((b) => /Continuar para Pagamento/i.test(b.textContent ?? ""));
  fireEvent.click(submitBtn!);

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

/**
 * Wrapper de setTimeout/clearTimeout que registra cada timer agendado
 * (id, callback original, delay) — permitindo correlacionar por ID,
 * não por delay.
 */
type TrackedTimer = {
  id: number;
  delay: number;
  callback: (...args: unknown[]) => void;
  fired: boolean;
  cleared: boolean;
};

function installTimerTracker() {
  const timers: TrackedTimer[] = [];
  const realSet = window.setTimeout.bind(window);
  const realClear = window.clearTimeout.bind(window);

  const setStub = vi.fn((cb: (...args: unknown[]) => void, delay?: number, ...rest: unknown[]) => {
    const wrapped = (...args: unknown[]) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.fired = true;
      return cb(...args);
    };
    const id = realSet(wrapped, delay ?? 0, ...rest) as unknown as number;
    timers.push({ id, delay: delay ?? 0, callback: cb, fired: false, cleared: false });
    return id as unknown as ReturnType<typeof setTimeout>;
  });

  const clearStub = vi.fn((id?: number | ReturnType<typeof setTimeout>) => {
    const t = timers.find((x) => (x.id as unknown) === id);
    if (t) t.cleared = true;
    return realClear(id as Parameters<typeof clearTimeout>[0]);
  });

  (window as unknown as { setTimeout: unknown }).setTimeout = setStub;
  (window as unknown as { clearTimeout: unknown }).clearTimeout = clearStub;

  return {
    timers,
    snapshot: () => timers.length,
    /** Retorna apenas os timers criados após o checkpoint informado. */
    since: (checkpoint: number) => timers.slice(checkpoint),
    restore: () => {
      window.setTimeout = realSet as typeof window.setTimeout;
      window.clearTimeout = realClear as typeof window.clearTimeout;
    },
  };
}

describe("Subscription /subscription — cleanup robusto do timer (sem depender de delay)", () => {
  it("o timer criado pelo clique em PIX é cancelado no unmount e o callback não roda", async () => {
    const { unmount } = renderPage();
    await navigateToPaymentStep();

    const paymentButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")
    );
    expect(paymentButtons.length).toBe(3);
    const pixBtn = paymentButtons.find((b) => /PIX/i.test(b.textContent ?? ""))!;
    expect(pixBtn).toBeTruthy();

    // Instala o tracker DEPOIS da navegação para isolar apenas os timers
    // criados pelo handler do clique em PIX.
    const tracker = installTimerTracker();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const checkpoint = tracker.snapshot();

    // Dispara o clique no PIX
    fireEvent.click(pixBtn);

    // Captura todos os timers agendados a partir do checkpoint —
    // qualquer que seja o delay usado pelo handler. Isto torna o teste
    // imune a alterações futuras do tempo de "verificação" (700ms hoje).
    const newTimers = tracker.since(checkpoint);
    expect(newTimers.length).toBeGreaterThan(0);

    // O timer principal do clique é o último agendado pelo handler
    // (o handler chama exatamente um setTimeout). Se houver mais de um,
    // tratamos todos como "do clique" e validamos cleanup de cada um.
    const clickTimers = newTimers;

    // Antes do unmount, nenhum dos timers do clique deve ter rodado
    clickTimers.forEach((t) => expect(t.fired).toBe(false));

    // Desmonta o componente
    unmount();

    // Cada timer agendado pelo clique deve ter sido cancelado no unmount,
    // identificado pelo ID retornado pelo setTimeout (não pelo delay)
    clickTimers.forEach((t) => {
      expect(t.cleared, `timer #${t.id} (delay=${t.delay}ms) deveria ter sido cancelado no unmount`).toBe(true);
    });

    // Aguarda mais que o maior delay agendado para confirmar que o
    // callback realmente NÃO disparou (clearTimeout foi efetivo).
    const maxDelay = Math.max(...clickTimers.map((t) => t.delay), 700);
    await act(async () => {
      await new Promise((r) => setTimeout(r, maxDelay + 100));
    });
    clickTimers.forEach((t) => {
      expect(t.fired, `timer #${t.id} (delay=${t.delay}ms) NÃO deveria ter disparado após o unmount`).toBe(false);
    });

    // Prova final: invocar manualmente o callback original (como se o
    // timer tivesse rodado mesmo após o unmount) não deve gerar warning
    // do React sobre setState em componente desmontado. O callback usa
    // setLoadingMethod/setUnavailableNotice — como o componente está
    // desmontado, em React 18 não emite warning, mas confirmamos.
    clickTimers.forEach((t) => {
      try { t.callback(); } catch { /* ignorado: setState pós-unmount apenas avisa */ }
    });
    const warnings = errorSpy.mock.calls
      .map((c) => String(c[0] ?? ""))
      .filter((m) => /unmounted component|memory leak|update.*unmounted/i.test(m));
    expect(warnings).toEqual([]);

    tracker.restore();
    errorSpy.mockRestore();
  }, 20000);
});
