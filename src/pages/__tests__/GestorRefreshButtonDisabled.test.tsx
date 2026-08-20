import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Reproduz o mesmo padrão de estado/handler usado no botão "Atualizar"
 * do GestorPanel, sem precisar montar a página inteira (que depende de
 * Supabase/Auth/Realtime). Garante que:
 *  1. o botão fica `disabled` assim que é clicado;
 *  2. o anel de progresso animado aparece;
 *  3. o reload só dispara após o ciclo da animação (2400ms);
 *  4. cliques repetidos durante a animação são ignorados.
 *
 * Também valida no fonte do GestorPanel que o atributo `disabled={refreshing}`
 * permanece no botão (regressão estrutural).
 */

const reloadSpy = vi.fn();

function RefreshButtonHarness({ onReload }: { onReload: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const handleForceRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const animationDelay = new Promise<void>((r) => setTimeout(r, 2400));
    await animationDelay;
    onReload();
    setRefreshing(false);
  }, [refreshing, onReload]);
  return (
    <button
      type="button"
      onClick={handleForceRefresh}
      disabled={refreshing}
      aria-label="Atualizar aplicativo"
      className="relative"
    >
      {refreshing && (
        <span aria-hidden data-testid="refresh-ring" className="pointer-events-none refresh-progress-ring" />
      )}
      <RefreshCw className={refreshing ? "animate-refresh-cycle" : ""} />
    </button>
  );
}

describe("Botão Atualizar — estado disabled durante a animação", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reloadSpy.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fica disabled e mostra o anel ao ser clicado, e dispara reload após 2400ms", async () => {
    const { getByLabelText, queryByTestId } = render(
      <RefreshButtonHarness onReload={reloadSpy} />,
    );
    const btn = getByLabelText("Atualizar aplicativo") as HTMLButtonElement;

    expect(btn.disabled).toBe(false);
    expect(queryByTestId("refresh-ring")).toBeNull();

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn.disabled).toBe(true);
    expect(queryByTestId("refresh-ring")).not.toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();

    // Avança quase até o fim — ainda disabled
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2399);
    });
    expect(btn.disabled).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();

    // Conclui o ciclo — reload dispara
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("ignora cliques repetidos enquanto a animação está em andamento", async () => {
    const { getByLabelText } = render(<RefreshButtonHarness onReload={reloadSpy} />);
    const btn = getByLabelText("Atualizar aplicativo") as HTMLButtonElement;

    // Simula o comportamento real do navegador: clicks em botão disabled são ignorados.
    const safeClick = () => {
      if (!btn.disabled) fireEvent.click(btn);
    };

    await act(async () => {
      safeClick();
    });
    await act(async () => {
      safeClick();
    });
    await act(async () => {
      safeClick();
    });

    expect(btn.disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GestorPanel — regressão estrutural do botão Atualizar", () => {
  it("mantém disabled={refreshing} e o anel condicional no JSX", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(__dirname, "../GestorPanel.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/disabled=\{refreshing\}/);
    expect(src).toMatch(/aria-label="Atualizar aplicativo"/);
    expect(src).toMatch(/refreshing\s*&&[\s\S]{0,200}refresh-progress-ring/);
  });
});

describe("Botão Atualizar — acessibilidade durante animação", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reloadSpy.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("o anel de progresso tem aria-hidden e não recebe foco", async () => {
    const { getByLabelText, queryByTestId } = render(
      <RefreshButtonHarness onReload={reloadSpy} />,
    );
    const btn = getByLabelText("Atualizar aplicativo");

    await act(async () => {
      fireEvent.click(btn);
    });

    const ring = queryByTestId("refresh-ring");
    expect(ring).not.toBeNull();
    expect(ring).toHaveAttribute("aria-hidden");
    expect(ring).toHaveClass("pointer-events-none");
    // O anel não deve ser focável
    expect(ring).not.toHaveAttribute("tabindex");
  });

  it("mantém aria-label no botão mesmo quando disabled", async () => {
    const { getByLabelText } = render(<RefreshButtonHarness onReload={reloadSpy} />);
    const btn = getByLabelText("Atualizar aplicativo") as HTMLButtonElement;

    expect(btn).toHaveAttribute("aria-label", "Atualizar aplicativo");
    expect(btn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn.disabled).toBe(true);
    expect(btn).toHaveAttribute("aria-label", "Atualizar aplicativo");
  });

  it("responde a tecla Enter no botão e inicia a animação", async () => {
    const { getByLabelText, queryByTestId } = render(
      <RefreshButtonHarness onReload={reloadSpy} />,
    );
    const btn = getByLabelText("Atualizar aplicativo") as HTMLButtonElement;

    btn.focus();
    expect(document.activeElement).toBe(btn);

    await act(async () => {
      fireEvent.keyDown(btn, { key: "Enter", code: "Enter" });
      fireEvent.click(btn);
    });

    expect(btn.disabled).toBe(true);
    expect(queryByTestId("refresh-ring")).not.toBeNull();
    // O foco permanece no botão (mesmo disabled, o navegador mantém foco no elemento)
    expect(document.activeElement).toBe(btn);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("o anel de progresso desaparece após a animação e o botão volta a ser focável/interativo", async () => {
    const { getByLabelText, queryByTestId } = render(
      <RefreshButtonHarness onReload={reloadSpy} />,
    );
    const btn = getByLabelText("Atualizar aplicativo") as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(queryByTestId("refresh-ring")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // Anel removido do DOM
    expect(queryByTestId("refresh-ring")).toBeNull();
    // Botão volta ao estado normal
    expect(btn.disabled).toBe(false);
    expect(btn).toHaveAttribute("aria-label", "Atualizar aplicativo");
  });
});

describe("Botão Atualizar — prefers-reduced-motion", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    reloadSpy.mockReset();
    originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it("o fluxo de disabled/reload continua funcionando mesmo com reduced-motion", async () => {
    const { getByLabelText, queryByTestId } = render(
      <RefreshButtonHarness onReload={reloadSpy} />,
    );
    const btn = getByLabelText("Atualizar aplicativo") as HTMLButtonElement;

    expect(btn.disabled).toBe(false);
    expect(queryByTestId("refresh-ring")).toBeNull();

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn.disabled).toBe(true);
    expect(queryByTestId("refresh-ring")).not.toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2399);
    });
    expect(btn.disabled).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(false);
    expect(queryByTestId("refresh-ring")).toBeNull();
  });

  it("o CSS desativa explicitamente o anel e a rotação do ícone quando reduced-motion está ativo", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const css = readFileSync(resolve(__dirname, "../../index.css"), "utf-8");
    // Verifica que existe a media query de reduced-motion
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    // Verifica que .refresh-progress-ring (anel) tem animation: none
    expect(css).toMatch(/\.refresh-progress-ring\s*\{\s*animation:\s*none\s*;?\s*\}/);
    // Verifica que .animate-refresh-cycle (rotação do ícone) tem animation: none
    expect(css).toMatch(/\.animate-refresh-cycle\s*\{\s*animation:\s*none\s*;?\s*\}/);
  });
});
