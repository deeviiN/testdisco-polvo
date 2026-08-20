import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const TARGET = "user-x";
const SCHOOL = "school-x";

const payload = {
  profile: { full_name: "Alvo", role: "teacher", is_approved: false, discipline_status: "ok", phone: "9", school_id: SCHOOL },
  auth: { email: "alvo@x.com", providers: ["email"] },
  school: { id: SCHOOL, name: "Escola X" },
  recent_bookings: [],
};

const SENSITIVE_RPCS = ["admin_set_user_approval", "admin_set_user_role", "admin_set_user_blocked"];

async function openAndClickAprovar() {
  rpcMock.mockImplementation((name: string) => {
    if (name === "admin_get_user_console") return Promise.resolve({ data: payload, error: null });
    return Promise.resolve({ data: { ok: true }, error: null });
  });
  const user = userEvent.setup();
  render(<UserDetailDrawer userId={TARGET} open onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText(/alvo@x\.com/)).toBeInTheDocument());
  await user.click(screen.getByRole("tab", { name: /Ações/i }));
  await screen.findByRole("tabpanel", { name: /Ações/i });
  await user.click(screen.getByRole("button", { name: /Aprovar/i }));
  const textarea = await screen.findByPlaceholderText(/Descreva o motivo/i);
  return { user, textarea };
}

describe("ReasonConfirmDialog — validação de motivo (0 / 2 / 3+ chars)", () => {
  beforeEach(() => { rpcMock.mockReset(); invokeMock.mockReset(); });

  it("0 caracteres: Confirmar desabilitado e nenhuma RPC sensível é chamada", async () => {
    await openAndClickAprovar();
    const confirm = screen.getByRole("button", { name: /Confirmar/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm); // mesmo clicando, nada deve acontecer
    await new Promise((r) => setTimeout(r, 50));
    expect(rpcMock.mock.calls.filter((c) => SENSITIVE_RPCS.includes(c[0]))).toHaveLength(0);
  });

  it("2 caracteres: ainda inválido — Confirmar desabilitado e nenhuma RPC sensível disparada", async () => {
    const { textarea } = await openAndClickAprovar();
    fireEvent.change(textarea, { target: { value: "ok" } });
    const confirm = screen.getByRole("button", { name: /Confirmar/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    await new Promise((r) => setTimeout(r, 50));
    expect(rpcMock.mock.calls.filter((c) => SENSITIVE_RPCS.includes(c[0]))).toHaveLength(0);
  });

  it("2 caracteres + espaços (' a '): trim resulta em 1 char — Confirmar permanece desabilitado", async () => {
    const { textarea } = await openAndClickAprovar();
    fireEvent.change(textarea, { target: { value: " a " } });
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDisabled();
    expect(rpcMock.mock.calls.filter((c) => SENSITIVE_RPCS.includes(c[0]))).toHaveLength(0);
  });

  it("3 caracteres: dispara a RPC exatamente uma vez com o motivo enviado", async () => {
    const { user, textarea } = await openAndClickAprovar();
    fireEvent.change(textarea, { target: { value: "abc" } });
    const confirm = screen.getByRole("button", { name: /Confirmar/i });
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    await waitFor(() => {
      const calls = rpcMock.mock.calls.filter((c) => c[0] === "admin_set_user_approval");
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ _user_id: TARGET, _approved: true, _reason: "abc" });
    });
  });

  it("motivo longo é repassado verbatim (após trim) à RPC", async () => {
    const { user, textarea } = await openAndClickAprovar();
    const reason = "  Aprovação após conferência de documento oficial e contato telefônico  ";
    fireEvent.change(textarea, { target: { value: reason } });
    await user.click(screen.getByRole("button", { name: /Confirmar/i }));
    await waitFor(() => {
      const call = rpcMock.mock.calls.find((c) => c[0] === "admin_set_user_approval");
      expect(call![1]._reason).toBe(reason.trim());
    });
  });
});
