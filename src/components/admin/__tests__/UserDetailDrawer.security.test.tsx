import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import UserDetailDrawer from "../UserDetailDrawer";

const rpcMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: any[]) => rpcMock(...a),
    functions: { invoke: (...a: any[]) => invokeMock(...a) },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../AuditTimeline", () => ({ default: () => <div>AUDIT</div> }));

const POISONED_PAYLOAD = {
  profile: { full_name: "Fulano", role: "teacher", is_approved: true, phone: "999" },
  auth: {
    email: "fulano@example.com",
    providers: ["email"],
    created_at: "2026-01-01T00:00:00Z",
    last_sign_in_at: null,
    email_confirmed_at: "2026-01-02T00:00:00Z",
    // Campos que NUNCA podem aparecer renderizados, mesmo se vierem do backend:
    encrypted_password: "$2a$10$abcdefSECRETHASHvalueXYZ",
    password_hash: "HASHSECRET999",
    recovery_token: "RECOVERYTOKENXYZ",
  },
  school: { id: "s1", name: "Escola Teste" },
  recent_bookings: [],
};

describe("UserDetailDrawer — segurança de exibição", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invokeMock.mockReset();
    rpcMock.mockResolvedValue({ data: POISONED_PAYLOAD, error: null });
  });

  it("não renderiza hash, senha criptografada nem tokens de recuperação", async () => {
    render(<UserDetailDrawer userId="u1" open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/fulano@example\.com/)).toBeInTheDocument());

    const html = document.body.innerHTML;
    expect(html).not.toContain("encrypted_password");
    expect(html).not.toContain("password_hash");
    expect(html).not.toContain("recovery_token");
    expect(html).not.toContain("SECRETHASH");
    expect(html).not.toContain("HASHSECRET");
    expect(html).not.toContain("RECOVERYTOKEN");
  });

  it("não inicializa com senha temporária visível", async () => {
    render(<UserDetailDrawer userId="u1" open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/fulano@example\.com/)).toBeInTheDocument());
    expect(screen.queryByText(/Senha temporária/i)).not.toBeInTheDocument();
  });
});
