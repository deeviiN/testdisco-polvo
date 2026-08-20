import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { criarPagamentoMP, isValidEmail, normalizeEmail } from "@/lib/mercadoPago";

const basePayer = {
  first_name: "Gestor",
  last_name: "Escolar",
};

const baseParams = {
  plano: "mensal" as const,
  metodo: "pix" as const,
};

describe("criarPagamentoMP — validação de email", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string vazia", ""],
    ["apenas espaços", "   "],
    ["sem @", "usuario.exemplo.com"],
    ["sem domínio", "usuario@"],
    ["sem TLD", "usuario@dominio"],
    ["dois @", "user@@dominio.com"],
  ])("bloqueia email inválido (%s) com a mensagem padrão", async (_label, email) => {
    await expect(
      criarPagamentoMP({
        ...baseParams,
        payer: { ...basePayer, email: email as any },
      }),
    ).rejects.toThrow("Digite um email válido para continuar.");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("normaliza e aceita email válido com espaços/maiúsculas", async () => {
    invokeMock.mockResolvedValue({
      data: { pagamento_id: "pag-1", status: "pending" },
      error: null,
    });

    const res = await criarPagamentoMP({
      ...baseParams,
      payer: { ...basePayer, email: "  USER@Example.COM  " },
    });

    expect(res.pagamento_id).toBe("pag-1");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.payer.email).toBe("user@example.com");
  });

  it("isValidEmail e normalizeEmail funcionam de forma consistente", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("a@b.c")).toBe(true);
    expect(normalizeEmail("  Foo@BAR.com ")).toBe("foo@bar.com");
  });
});
