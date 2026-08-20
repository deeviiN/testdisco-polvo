/**
 * E2E — AuditTimeline: usuário sem permissão vê acesso negado.
 *
 * Quando o RPC admin_list_audit_logs retorna permission denied,
 * o componente deve exibir mensagem de acesso negado em vez de
 * "Sem registros." ou qualquer item de auditoria.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AuditTimeline from "@/components/admin/AuditTimeline";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () =>
      Promise.resolve({
        data: null,
        error: { message: "permission denied for function admin_list_audit_logs" },
      }),
    from: () => {
      throw new Error("unexpected table access");
    },
    functions: { invoke: vi.fn() },
  },
}));

describe("E2E — AuditTimeline nega acesso a usuários sem permissão", () => {
  it("Renderiza mensagem de acesso negado e nenhum registro", async () => {
    render(<AuditTimeline schoolId="school-x" limit={50} />);

    // Aguarda sair do estado de loading
    await waitFor(() =>
      expect(screen.queryByText(/Carregando/i)).not.toBeInTheDocument()
    );

    // Mensagem de acesso negado deve estar visível
    expect(screen.getByText(/Acesso negado/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Você não tem permissão para visualizar os registros de auditoria/i)
    ).toBeInTheDocument();

    // Não deve mostrar "Sem registros." (mensagem de lista vazia normal)
    expect(screen.queryByText(/Sem registros/i)).not.toBeInTheDocument();

    // Nenhum item de lista deve estar renderizado
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
