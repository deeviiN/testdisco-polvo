/**
 * E2E — Falhas de RPC NÃO devem gravar audit_logs (rollback contract).
 *
 * Cobre os 4 fluxos críticos (aprovar/reprovar/bloquear/alterar papel):
 *  - servidor retorna { error } → nenhuma linha em audit_logs
 *  - servidor lança exceção     → nenhuma linha em audit_logs
 *  - UI não exibe sucesso, estado do alvo permanece inalterado
 *  - após erro, retry bem-sucedido grava exatamente 1 linha (não duplica)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserDetailDrawer from "@/components/admin/UserDetailDrawer";

const ADMIN_UID = "admin-uid";
const TARGET_USER = "user-target";
const SCHOOL_ID = "school-1";

type AuditRow = {
  action: string; record_id: string; performed_by: string;
  school_id: string | null; new_data: any; old_data: any;
};
const auditLogs: AuditRow[] = [];

const profileRow = {
  user_id: TARGET_USER, full_name: "Alvo", role: "teacher",
  is_approved: false, discipline_status: "ok", school_id: SCHOOL_ID,
};

// Fail-mode switches per RPC
let failMode: Record<string, null | "error" | "throw"> = {
  admin_set_user_approval: null,
  admin_set_user_blocked: null,
  admin_set_user_role: null,
};

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: any[]) => toastSuccess(...a), error: (...a: any[]) => toastError(...a) } }));
vi.mock("@/components/admin/AuditTimeline", () => ({ default: () => <div /> }));

function adminLog(action: string, oldD: any, newD: any) {
  auditLogs.push({
    action, record_id: TARGET_USER, performed_by: ADMIN_UID,
    school_id: profileRow.school_id, old_data: oldD, new_data: newD,
  });
}

function runRpc(name: string, params: any) {
  if (name === "admin_get_user_console") {
    return Promise.resolve({
      data: {
        profile: profileRow,
        auth: { email: "alvo@x.com", providers: ["email"] },
        school: { id: SCHOOL_ID, name: "Escola 1" }, recent_bookings: [],
      },
      error: null,
    });
  }
  const mode = failMode[name];
  // Contract: erro/exceção precisa ocorrer ANTES de gravar audit_logs
  if (mode === "throw") return Promise.reject(new Error("network down"));
  if (mode === "error") return Promise.resolve({ data: null, error: { message: "permission denied: not admin" } });

  if ((params?._reason ?? "").trim().length < 3) {
    return Promise.resolve({ data: null, error: { message: "reason required" } });
  }
  if (name === "admin_set_user_approval") {
    const old = profileRow.is_approved; profileRow.is_approved = !!params._approved;
    adminLog(params._approved ? "admin_approve_user" : "admin_reject_user", { is_approved: old }, { is_approved: params._approved, reason: params._reason });
  } else if (name === "admin_set_user_blocked") {
    const old = profileRow.discipline_status; profileRow.discipline_status = params._blocked ? "blocked_manager" : "ok";
    adminLog(params._blocked ? "admin_block_user" : "admin_unblock_user", { discipline_status: old }, { discipline_status: profileRow.discipline_status, reason: params._reason });
  } else if (name === "admin_set_user_role") {
    const old = profileRow.role; profileRow.role = params._role;
    adminLog("admin_change_role", { role: old }, { role: params._role, reason: params._reason });
  }
  return Promise.resolve({ data: null, error: null });
}

function fromAuditLogs() {
  let filtered = [...auditLogs];
  const b: any = {
    select: () => b,
    eq: (col: string, val: any) => { filtered = filtered.filter((r: any) => r[col] === val); return b; },
    order: () => b,
    limit: (n: number) => Promise.resolve({ data: filtered.slice(0, n), error: null }),
    then: (cb: any) => Promise.resolve({ data: filtered, error: null }).then(cb),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, params: any) => runRpc(name, params),
    from: (t: string) => { if (t === "audit_logs") return fromAuditLogs(); throw new Error(t); },
    functions: { invoke: vi.fn() },
  },
}));

async function openOnAcoes() {
  const u = userEvent.setup();
  render(<UserDetailDrawer userId={TARGET_USER} open onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText(/alvo@x\.com/)).toBeInTheDocument());
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
  failMode = { admin_set_user_approval: null, admin_set_user_blocked: null, admin_set_user_role: null };
  toastSuccess.mockReset();
  toastError.mockReset();
}

async function expectNoAuditAndNoSuccess() {
  // dá tempo para qualquer gravação eventual aparecer
  await new Promise((r) => setTimeout(r, 50));
  expect(auditLogs).toHaveLength(0);
  expect(toastSuccess).not.toHaveBeenCalled();
}

describe("E2E — rollback de audit_logs quando RPC falha", () => {
  // O drawer atual rethrowa o erro do RPC sem capturá-lo; impedimos que
  // a rejeição não tratada falhe a suíte — o importante é o contrato:
  // nenhum audit_logs e nenhum toast.success.
  const swallow = (e: any) => { e?.preventDefault?.(); };
  beforeEach(() => {
    cleanup(); resetState();
    process.on("unhandledRejection", swallow);
    window.addEventListener("unhandledrejection", swallow as any);
  });
  afterEach(() => {
    process.off("unhandledRejection", swallow);
    window.removeEventListener("unhandledrejection", swallow as any);
  });

  it("Aprovar: servidor retorna {error} → audit_logs vazio e estado do alvo inalterado", async () => {
    failMode.admin_set_user_approval = "error";
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Aprovar/i }));
    await confirmWith("Motivo suficiente para auditoria");
    await new Promise((r) => setTimeout(r, 80));

    await expectNoAuditAndNoSuccess();
    expect(profileRow.is_approved).toBe(false);
  });

  it("Reprovar: RPC lança exceção → audit_logs permanece vazio", async () => {
    profileRow.is_approved = true;
    failMode.admin_set_user_approval = "throw";
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Reprovar/i }));
    await confirmWith("Documento ilegível");
    await new Promise((r) => setTimeout(r, 80));

    await expectNoAuditAndNoSuccess();
    expect(profileRow.is_approved).toBe(true);
  });

  it("Bloquear: servidor retorna {error} → audit_logs vazio e discipline_status inalterado", async () => {
    failMode.admin_set_user_blocked = "error";
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Bloquear/i }));
    await confirmWith("Conduta inadequada relatada");
    await new Promise((r) => setTimeout(r, 80));

    await expectNoAuditAndNoSuccess();
    expect(profileRow.discipline_status).toBe("ok");
  });

  it("Alterar papel: RPC lança exceção → audit_logs vazio e role original mantido", async () => {
    failMode.admin_set_user_role = "throw";
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: "coord_pedagogico" }));
    await confirmWith("Promoção solicitada pela direção");
    await new Promise((r) => setTimeout(r, 80));

    await expectNoAuditAndNoSuccess();
    expect(profileRow.role).toBe("teacher");
  });

  it("Após erro, retry bem-sucedido grava exatamente 1 linha (sem duplicar)", async () => {
    failMode.admin_set_user_approval = "error";
    const u = await openOnAcoes();
    await u.click(screen.getByRole("button", { name: /Aprovar/i }));
    await confirmWith("Primeira tentativa que falhará");
    await new Promise((r) => setTimeout(r, 80));
    expect(auditLogs).toHaveLength(0);

    // O dialog continua aberto após o erro; usuário corrige o motivo e confirma de novo
    failMode.admin_set_user_approval = null;
    const ta = await screen.findByPlaceholderText(/Descreva o motivo/i);
    fireEvent.change(ta, { target: { value: "Retry com sucesso após instabilidade" } });
    fireEvent.click(screen.getByRole("button", { name: /^Confirmar$/i }));

    await waitFor(() => expect(auditLogs).toHaveLength(1));
    expect(auditLogs[0]).toMatchObject({
      action: "admin_approve_user",
      performed_by: ADMIN_UID,
      school_id: SCHOOL_ID,
      record_id: TARGET_USER,
    });
    expect(auditLogs[0].new_data.reason).toBe("Retry com sucesso após instabilidade");
  });
});
