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

const TARGET_USER = "user-target-123";
const SCHOOL_ID = "school-abc";

function makePayload(overrides: any = {}) {
  return {
    profile: {
      full_name: "Alvo Teste",
      role: "teacher",
      is_approved: false,
      discipline_status: "ok",
      phone: "999",
      school_id: SCHOOL_ID,
      ...overrides,
    },
    auth: { email: "alvo@example.com", providers: ["email"] },
    school: { id: SCHOOL_ID, name: "Escola Teste" },
    recent_bookings: [],
  };
}

async function openDrawer(payload = makePayload()) {
  rpcMock.mockImplementation((name: string) => {
    if (name === "admin_get_user_console") return Promise.resolve({ data: payload, error: null });
    return Promise.resolve({ data: { ok: true }, error: null });
  });
  const user = userEvent.setup();
  render(<UserDetailDrawer userId={TARGET_USER} open onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText(/alvo@example\.com/)).toBeInTheDocument());
  await user.click(screen.getByRole("tab", { name: /Ações/i }));
  await screen.findByRole("tabpanel", { name: /Ações/i });
  return user;
}

async function confirmWithReason(reason: string) {
  const textarea = await screen.findByPlaceholderText(/Descreva o motivo/i);
  fireEvent.change(textarea, { target: { value: reason } });
  const confirm = screen.getByRole("button", { name: /Confirmar/i });
  expect(confirm).not.toBeDisabled();
  fireEvent.click(confirm);
}

describe("UserDetailDrawer — fluxo auditado (motivo obrigatório)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invokeMock.mockReset();
  });

  it("Aprovar usuário chama admin_set_user_approval com _approved=true e _reason", async () => {
    const user = await openDrawer(makePayload({ is_approved: false }));
    await user.click(screen.getByRole("button", { name: /Aprovar/i }));
    await confirmWithReason("Usuário verificado por documento oficial");

    await waitFor(() => {
      const call = rpcMock.mock.calls.find((c) => c[0] === "admin_set_user_approval");
      expect(call).toBeTruthy();
      expect(call![1]).toEqual({
        _user_id: TARGET_USER,
        _approved: true,
        _reason: "Usuário verificado por documento oficial",
      });
    });
  });

  it("Reprovar usuário chama admin_set_user_approval com _approved=false e _reason", async () => {
    const user = await openDrawer(makePayload({ is_approved: true }));
    await user.click(screen.getByRole("button", { name: /Reprovar/i }));
    await confirmWithReason("Documento inválido recebido");

    await waitFor(() => {
      const call = rpcMock.mock.calls.find((c) => c[0] === "admin_set_user_approval");
      expect(call![1]).toMatchObject({
        _user_id: TARGET_USER,
        _approved: false,
        _reason: "Documento inválido recebido",
      });
    });
  });

  it("Bloquear chama admin_set_user_blocked com _blocked=true e _reason", async () => {
    const user = await openDrawer(makePayload({ discipline_status: "ok" }));
    await user.click(screen.getByRole("button", { name: /Bloquear/i }));
    await confirmWithReason("Conduta inadequada relatada pela escola");

    await waitFor(() => {
      const call = rpcMock.mock.calls.find((c) => c[0] === "admin_set_user_blocked");
      expect(call![1]).toMatchObject({
        _user_id: TARGET_USER,
        _blocked: true,
        _reason: "Conduta inadequada relatada pela escola",
      });
    });
  });

  it("Desbloquear chama admin_set_user_blocked com _blocked=false e _reason", async () => {
    const user = await openDrawer(makePayload({ discipline_status: "blocked_manager" }));
    await user.click(screen.getByRole("button", { name: /Desbloquear/i }));
    await confirmWithReason("Recurso aprovado pela coordenação");

    await waitFor(() => {
      const call = rpcMock.mock.calls.find((c) => c[0] === "admin_set_user_blocked");
      expect(call![1]).toMatchObject({
        _user_id: TARGET_USER,
        _blocked: false,
        _reason: "Recurso aprovado pela coordenação",
      });
    });
  });

  it("Alterar função chama admin_set_user_role com novo papel e _reason", async () => {
    const user = await openDrawer(makePayload({ role: "teacher" }));
    // Clica no botão de papel diferente do atual
    await user.click(screen.getByRole("button", { name: "coord_pedagogico" }));
    await confirmWithReason("Promoção aprovada pela direção");

    await waitFor(() => {
      const call = rpcMock.mock.calls.find((c) => c[0] === "admin_set_user_role");
      expect(call![1]).toMatchObject({
        _user_id: TARGET_USER,
        _role: "coord_pedagogico",
        _reason: "Promoção aprovada pela direção",
      });
    });
  });

  it("Confirmar fica desabilitado quando o motivo tem menos de 3 caracteres", async () => {
    const user = await openDrawer(makePayload({ is_approved: false }));
    await user.click(screen.getByRole("button", { name: /Aprovar/i }));
    const textarea = await screen.findByPlaceholderText(/Descreva o motivo/i);
    fireEvent.change(textarea, { target: { value: "ok" } });
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDisabled();

    // Garante que nenhuma RPC sensível foi disparada sem motivo válido
    const sensitive = rpcMock.mock.calls.filter((c) =>
      ["admin_set_user_approval", "admin_set_user_role", "admin_set_user_blocked"].includes(c[0])
    );
    expect(sensitive).toHaveLength(0);
  });
});
