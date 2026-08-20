/**
 * Testes de integração: anti double-tap nos botões PIX, Boleto e Cartão.
 *
 * Reproduz fielmente o handler de clique implementado em
 * src/pages/Subscription.tsx (etapa "payment"), que combina:
 *   - paymentLockRef (useRef síncrono) → bloqueia cliques imediatos antes do React
 *     processar o setState.
 *   - loadingMethod (useState) → reflete o lock visualmente e desabilita o botão
 *     via `disabled`.
 *   - window.setTimeout(700ms) → simula a verificação do método; ao fim, libera
 *     o lock.
 *
 * Garantias verificadas:
 *   1. Cliques repetidos no MESMO botão durante o loading disparam apenas 1
 *      requisição (1 chamada do callback de pagamento).
 *   2. Cliques em botões DIFERENTES enquanto outro está em loading são ignorados.
 *   3. Após o término do loading (700ms), um novo clique funciona normalmente.
 *   4. O atributo `disabled` é aplicado em todos os 3 botões durante o loading.
 *   5. Mesmo que o `disabled` seja contornado (fireEvent.click ignora o atributo
 *      em jsdom), a guarda síncrona do ref impede dispatches duplicados.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import React, { useRef, useState } from "react";

type Method = "pix" | "boleto" | "card";

interface HarnessProps {
  onDispatch: (method: Method) => void;
}

/**
 * Réplica do fluxo de clique de Subscription.tsx para isolar a lógica de
 * anti double-tap (sem depender de Supabase, router etc).
 */
function PaymentHarness({ onDispatch }: HarnessProps) {
  const [loadingMethod, setLoadingMethod] = useState<Method | null>(null);
  const paymentLockRef = useRef(false);

  const handleClick = (id: Method) => {
    if (paymentLockRef.current || loadingMethod) return;
    paymentLockRef.current = true;
    setLoadingMethod(id);
    onDispatch(id);
    window.setTimeout(() => {
      setLoadingMethod(null);
      paymentLockRef.current = false;
    }, 700);
  };

  return (
    <div>
      {(["pix", "boleto", "card"] as Method[]).map((id) => (
        <button
          key={id}
          data-testid={`btn-${id}`}
          type="button"
          disabled={!!loadingMethod}
          onClick={() => handleClick(id)}
        >
          {loadingMethod === id ? "..." : id}
        </button>
      ))}
      <span data-testid="loading-state">{loadingMethod ?? "idle"}</span>
    </div>
  );
}

describe("PaymentHarness anti double-tap (PIX / Boleto / Cartão)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  (["pix", "boleto", "card"] as Method[]).forEach((method) => {
    it(`${method}: cliques repetidos durante o loading disparam apenas 1 requisição`, () => {
      const dispatch = vi.fn();
      const { getByTestId } = render(<PaymentHarness onDispatch={dispatch} />);
      const btn = getByTestId(`btn-${method}`);

      // 10 cliques consecutivos (double/triple tap furioso)
      for (let i = 0; i < 10; i++) {
        fireEvent.click(btn);
      }

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith(method);
      expect(getByTestId("loading-state").textContent).toBe(method);
    });
  });

  it("cliques em botões diferentes durante o loading são ignorados", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(<PaymentHarness onDispatch={dispatch} />);

    fireEvent.click(getByTestId("btn-pix"));
    fireEvent.click(getByTestId("btn-boleto"));
    fireEvent.click(getByTestId("btn-card"));
    fireEvent.click(getByTestId("btn-pix"));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("pix");
  });

  it("todos os 3 botões ficam disabled enquanto há loading ativo", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(<PaymentHarness onDispatch={dispatch} />);

    fireEvent.click(getByTestId("btn-boleto"));

    expect((getByTestId("btn-pix") as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId("btn-boleto") as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId("btn-card") as HTMLButtonElement).disabled).toBe(true);
  });

  it("após o término do loading (700ms), novo clique dispara nova requisição", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(<PaymentHarness onDispatch={dispatch} />);

    fireEvent.click(getByTestId("btn-pix"));
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Cliques durante o loading não fazem nada
    fireEvent.click(getByTestId("btn-pix"));
    fireEvent.click(getByTestId("btn-card"));
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Avança o tempo até liberar o lock
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(getByTestId("loading-state").textContent).toBe("idle");
    expect((getByTestId("btn-pix") as HTMLButtonElement).disabled).toBe(false);

    // Agora um novo clique funciona
    fireEvent.click(getByTestId("btn-card"));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith("card");
  });

  it("ciclo completo de 3 métodos: 1 dispatch por ciclo, nunca paralelo", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(<PaymentHarness onDispatch={dispatch} />);

    const sequence: Method[] = ["pix", "boleto", "card"];
    sequence.forEach((m, idx) => {
      // Spam de cliques no método atual + cliques cruzados nos outros
      for (let i = 0; i < 5; i++) fireEvent.click(getByTestId(`btn-${m}`));
      fireEvent.click(getByTestId("btn-pix"));
      fireEvent.click(getByTestId("btn-boleto"));
      fireEvent.click(getByTestId("btn-card"));

      expect(dispatch).toHaveBeenCalledTimes(idx + 1);
      expect(dispatch).toHaveBeenLastCalledWith(m);

      act(() => {
        vi.advanceTimersByTime(700);
      });
    });

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual(["pix", "boleto", "card"]);
  });
});
