import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { criarPagamentoMP, PaymentsUnavailableError } from "@/lib/mercadoPago";

const validParams = {
  plano: "mensal" as const,
  metodo: "pix" as const,
  payer: { email: "user@example.com" },
};

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

describe("criarPagamentoMP — tratamento de erro da edge function", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("não estoura 500: converte error do invoke em mensagem amigável", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "Internal Server Error" },
    });
    await expect(criarPagamentoMP(validParams)).rejects.toThrow("Internal Server Error");
  });

  it("erro sem mensagem retorna fallback amigável", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "" } });
    await expect(criarPagamentoMP(validParams)).rejects.toThrow(
      /erro inesperado|Falha ao criar pagamento/i
    );
  });

  it("resposta vazia gera mensagem amigável", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: null });
    await expect(criarPagamentoMP(validParams)).rejects.toThrow(/Resposta vazia/i);
  });

  it("data.error genérico vira mensagem amigável (não 500)", async () => {
    invoke.mockResolvedValueOnce({
      data: { error: "mp_failure", message: "Não foi possível processar o pagamento agora." },
      error: null,
    });
    await expect(criarPagamentoMP(validParams)).rejects.toThrow(
      "Não foi possível processar o pagamento agora."
    );
  });

  it("payments_unavailable vira PaymentsUnavailableError", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        error: "payments_unavailable",
        reason: "credentials_invalid",
        message: "Pagamentos temporariamente indisponíveis.",
      },
      error: null,
    });
    await expect(criarPagamentoMP(validParams)).rejects.toBeInstanceOf(PaymentsUnavailableError);
  });

  it("exceção lançada pelo invoke é capturada e retorna mensagem amigável", async () => {
    invoke.mockRejectedValueOnce(new Error("network down"));
    await expect(criarPagamentoMP(validParams)).rejects.toThrow("network down");
  });

  it("exceção sem mensagem retorna fallback genérico amigável", async () => {
    invoke.mockRejectedValueOnce({});
    await expect(criarPagamentoMP(validParams)).rejects.toThrow(/erro inesperado/i);
  });
});
