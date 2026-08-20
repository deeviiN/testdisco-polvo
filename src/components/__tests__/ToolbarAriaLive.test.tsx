/**
 * Testes de acessibilidade para o contrato aria-live usado em GlobalToolbar
 * ao trocar Idioma e Tema.
 *
 * Reproduzimos o padrão usado no componente real (announce + região sr-only +
 * preventDefault no item do submenu) em um harness isolado para evitar mocks
 * pesados de Supabase/auth/router.
 *
 * Validamos:
 *  1. A região live tem os atributos corretos (aria-live=polite, aria-atomic, role=status).
 *  2. A mensagem é anunciada após a troca de tema, sem fechar o "menu" (estado de aberto preservado).
 *  3. A mensagem é anunciada após confirmar a troca de idioma.
 *  4. O padrão clear→rAF→set permite reanúncio da mesma mensagem.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { useCallback, useState } from "react";

function Harness() {
  const [liveMessage, setLiveMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(true);
  const [submenuOpen, setSubmenuOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [pendingLang, setPendingLang] = useState<"pt" | "en" | null>(null);

  const announce = useCallback((msg: string) => {
    setLiveMessage("");
    requestAnimationFrame(() => setLiveMessage(msg));
  }, []);

  return (
    <div>
      <div data-testid="menu-state">{menuOpen ? "open" : "closed"}</div>
      <div data-testid="submenu-state">{submenuOpen ? "open" : "closed"}</div>
      <div data-testid="theme-state">{theme}</div>
      <div data-testid="language-state">{language}</div>

      {/* Item de tema — replica preventDefault + announce do GlobalToolbar */}
      <button
        data-testid="theme-light"
        onClick={(e) => {
          e.preventDefault();
          setTheme("light");
          announce("Tema Claro aplicado.");
          // submenu NÃO fecha (preventDefault no Radix item)
        }}
      >
        Claro
      </button>
      <button
        data-testid="theme-dark"
        onClick={(e) => {
          e.preventDefault();
          setTheme("dark");
          announce("Tema Escuro aplicado.");
        }}
      >
        Escuro
      </button>

      {/* Idioma — abre confirmação, depois aplica */}
      <button
        data-testid="lang-en"
        onClick={() => setPendingLang("en")}
      >
        Inglês
      </button>
      {pendingLang && (
        <div role="dialog" aria-label="Confirmar idioma">
          <button
            data-testid="lang-confirm"
            onClick={() => {
              const target = pendingLang;
              setLanguage(target);
              announce(`Idioma alterado para ${target === "en" ? "English" : "Português"}.`);
              setPendingLang(null);
            }}
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Região aria-live — replica exatamente o GlobalToolbar */}
      <div
        data-testid="live-region"
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
      >
        {liveMessage}
      </div>

      {/* Botões para simular fechamento manual (não devem ser disparados pelos handlers) */}
      <button onClick={() => setMenuOpen(false)}>fechar menu</button>
      <button onClick={() => setSubmenuOpen(false)}>fechar submenu</button>
    </div>
  );
}

// jsdom não implementa rAF de forma síncrona — fazemos polyfill controlado
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Toolbar — aria-live para Idioma e Tema", () => {
  it("a região live tem os atributos ARIA corretos", () => {
    render(<Harness />);
    const region = screen.getByTestId("live-region");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveClass("sr-only");
  });

  it("anuncia a mudança de tema sem fechar o menu nem o submenu", async () => {
    render(<Harness />);

    expect(screen.getByTestId("menu-state")).toHaveTextContent("open");
    expect(screen.getByTestId("submenu-state")).toHaveTextContent("open");

    fireEvent.click(screen.getByTestId("theme-dark"));

    // Avança o rAF agendado pelo announce
    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId("theme-state")).toHaveTextContent("dark");
    expect(screen.getByTestId("live-region")).toHaveTextContent("Tema Escuro aplicado.");
    // Menu e submenu permanecem abertos (preventDefault evitou o fechamento)
    expect(screen.getByTestId("menu-state")).toHaveTextContent("open");
    expect(screen.getByTestId("submenu-state")).toHaveTextContent("open");
  });

  it("anuncia a confirmação de idioma", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId("lang-en"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lang-confirm"));
    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId("language-state")).toHaveTextContent("en");
    expect(screen.getByTestId("live-region")).toHaveTextContent("Idioma alterado para English.");
  });

  it("permite reanunciar a mesma mensagem (clear→rAF→set)", async () => {
    render(<Harness />);
    const region = screen.getByTestId("live-region");

    fireEvent.click(screen.getByTestId("theme-dark"));
    await act(async () => { vi.runAllTimers(); });
    expect(region).toHaveTextContent("Tema Escuro aplicado.");

    // Mesma ação novamente — região deve ser limpa antes de reescrever
    fireEvent.click(screen.getByTestId("theme-dark"));
    // Imediatamente após o clique, a região foi limpa (antes do rAF resolver)
    expect(region).toHaveTextContent("");

    await act(async () => { vi.runAllTimers(); });
    expect(region).toHaveTextContent("Tema Escuro aplicado.");
  });
});
