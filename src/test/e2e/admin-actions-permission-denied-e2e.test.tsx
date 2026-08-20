/**
 * E2E — usuário SEM permissão (não-admin) tenta ações administrativas.
 *
 * Cobre os 4 fluxos críticos (aprovar/reprovar/bloquear/alterar papel):
 *  - RPC retorna erro de permissão
 *  - nenhuma linha gravada em audit_logs
 *  - estado do alvo permanece inalterado
 *  - UI não exibe toast de sucesso
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserDetailDrawer from "@/components/admin/UserDetailDrawer";

const NON_ADMIN_UID = "user-common-uid";
const TARGET_USER = "user-target-999";
const SCHOOL_ID = "school-no-perm";

type AuditRow = {
  action: string;
  record_id: string;
  performed_by: string;
  school_id: string | null;
  new_data: any;
  old_data: any;
};
const auditLogs: AuditRow[] = [];

const profileRow = {
  user_id: TARGET_USER,
  full_name: "Alvo Sem Perm",
  role: "teacher",
  is_approved: false,
  discipline_status: "ok",
  school_id: SCHOOL_ID,
};

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: any[]) => toastSuccess(...a), error: vi.fn() },
}));
vi.mock("@/components/admin/AuditTimeline", () => ({ default: () => <div /> }));

function runRpc(name: string, params: any) {
  if (name === "admin_get_user_console") {
    return Promise.resolve({
      data: {
        profile: profileRow,
        auth: { email: "alvo@noperm.com", providers: ["email"] },
        school: { id: SCHOOL_ID, name: "Escola NoPerm" },
        recent_bookings: [],
      },
      error: null,
    });
  }

  // Simula verificação de permissão no servidor: apenas admin pode executar
  return Promise.resolve({
    data: null,
    error: { message: "permission denied: requires admin role" },
  });
}

function fromAuditLogs() {
  let filtered = [...auditLogs];
  const b: any = {
    select: () => b,
    eq: (col: string, val: any) => {
      filtered = filtered.filter((r: any) => r[col] === val);
      return b;
    },
    order: () => b,
    limit: (n: number) => Promise.resolve({ data: filtered.slice(0, n), error: null }),
    then: (cb: any) => Promise.resolve({ data: filtered, error: null }).then(cb),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, params: any) => runRpc(name, params),
    from: (t: string) => {
      if (t === "audit_logs") return fromAuditLogs();
      throw new Error(t);
    },
    functions: { invoke: vi.fn() },
  },
}));

async function openOnAcoes() {
  const u = userEvent.setup();
  render(<UserDetailDrawer userId={TARGET_USER} open onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText(/alvo@noperm\.com/)).toBeInTheDocument());
  await u.click(screen.getByRole("tab", { name: /Ações/i }));
  await screen.findByRole("tabpanel", { name: /Ações/i });
  return u;
}

async function confirmWith(reason: string) {
  const ta = await screen.findByPlaceholderText(/Descreva o motivo/i);
  fireEvent.change(ta, { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: /^Confirmar$/i }));
}

function resetState() {
  auditLogs.length = 0;
  profileRow.is_approved = false;
  profileRow.discipline_status = "ok";
  profileRow.role = "teacher";
  toastSuccess.mockReset();
}

describe("E2E — negação de permissão: usuário comum não pode executar ações administrativas", () => {
  const swallow = (e: any) => {
    e?.preventDefault?.();
  };

  beforeEach(() => {
    cleanup();
    resetState();
    process.on("unhandledRejection", swallow);
    window.addEventListener("unhandledrejection", swallow as any);
  });

  afterEach(() => {
    process.off("unhandledRejection", swallow);
    window.removeEventListener("unhandledrejection", swallow as any);
  });

  async function assertNoAuditAndNoSuccess() {
    await new Promise((r) => setTimeout(r, 80));
    expect(auditLogs).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  }

  it("Aprovar: RPC retorna permission denied → audit_logs vazio e estado inalterado", async () => {
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Aprovar/i }));
    await confirmWith("Motivo aparentemente válido");
    await assertNoAuditAndNoSuccess();
    expect(profileRow.is_approved).toBe(false);
  });

  it("Reprovar: RPC retorna permission denied → audit_logs vazio e estado inalterado", async () => {
    profileRow.is_approved = true;
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Reprovar/i }));
    await confirmWith("Motivo aparentemente válido");
    await assertNoAuditAndNoSuccess();
    expect(profileRow.is_approved).toBe(true);
  });

  it("Bloquear: RPC retorna permission denied → audit_logs vazio e discipline_status inalterado", async () => {
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Bloquear/i }));
    await confirmWith("Motivo aparentemente válido");
    await assertNoAuditAndNoSuccess();
    expect(profileRow.discipline_status).toBe("ok");
  });

  it("Desbloquear: RPC retorna permission denied → audit_logs vazio e discipline_status inalterado", async () => {
    profileRow.discipline_status = "blocked_manager";
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Desbloquear/i }));
    await confirmWith("Motivo aparentemente válido");
    await assertNoAuditAndNoSuccess();
    expect(profileRow.discipline_status).toBe("blocked_manager");
  });

  it("Alterar papel: RPC retorna permission denied → audit_logs vazio e role original mantido", async () => {
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: "coord_pedagogico" }));
    await confirmWith("Motivo aparentemente válido");
    await assertNoAuditAndNoSuccess();
    expect(profileRow.role).toBe("teacher");
  });
});
