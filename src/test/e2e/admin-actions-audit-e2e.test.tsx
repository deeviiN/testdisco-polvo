/**
 * E2E-style integration test:
 * Drives the admin UI (UserDetailDrawer) end-to-end through approve/reject/
 * block/unblock/role-change, simulates the server-side SQL RPC contract
 * (writing into a fake audit_logs table just like the real
 * admin_log_action helper would), and then queries that audit_logs table
 * the same way the UI does (supabase.from("audit_logs").select(...))
 * to assert performed_by = auth.uid(), school_id matches the target user's
 * school, and reason is stored exactly as typed in the dialog.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserDetailDrawer from "@/components/admin/UserDetailDrawer";

const ADMIN_UID = "admin-uid-aaaa";
const TARGET_USER = "user-target-zzzz";
const SCHOOL_ID = "school-xyz-789";

// ---------- Fake "DB" + RPC layer ----------
type AuditRow = {
  id: string;
  action: string;
  table_name: string;
  record_id: string;
  old_data: any;
  new_data: any;
  performed_by: string;
  school_id: string | null;
  created_at: string;
};
const auditLogs: AuditRow[] = [];

const profileRow = {
  user_id: TARGET_USER,
  full_name: "Alvo E2E",
  role: "teacher",
  is_approved: false,
  discipline_status: "ok",
  school_id: SCHOOL_ID,
  phone: "999",
};

// Simulates SQL admin_log_action(_action, _table, _record, _old, _new, _school)
// which always uses auth.uid() for performed_by.
function adminLogAction(action: string, table: string, record: string, oldD: any, newD: any, school: string | null) {
  auditLogs.push({
    id: `log-${auditLogs.length + 1}`,
    action, table_name: table, record_id: record,
    old_data: oldD, new_data: newD,
    performed_by: ADMIN_UID,  // = auth.uid() in SQL
    school_id: school,
    created_at: new Date().toISOString(),
  });
}

// Simulates each admin_set_* RPC: requires admin role + reason >=3, then logs.
function simulateRpc(name: string, params: any) {
  if (name === "admin_get_user_console") {
    return Promise.resolve({
      data: {
        profile: profileRow,
        auth: { email: "alvo@e2e.com", providers: ["email"] },
        school: { id: SCHOOL_ID, name: "Escola E2E" },
        recent_bookings: [],
      },
      error: null,
    });
  }
  const reason = params?._reason;
  if (typeof reason !== "string" || reason.trim().length < 3) {
    return Promise.resolve({ data: null, error: { message: "reason required" } });
  }
  const targetSchool = profileRow.school_id; // server reads from target user's profile

  if (name === "admin_set_user_approval") {
    const oldV = profileRow.is_approved;
    profileRow.is_approved = !!params._approved;
    adminLogAction(
      params._approved ? "admin_approve_user" : "admin_reject_user",
      "profiles", params._user_id,
      { is_approved: oldV },
      { is_approved: params._approved, reason },
      targetSchool,
    );
    return Promise.resolve({ data: null, error: null });
  }
  if (name === "admin_set_user_blocked") {
    const oldV = profileRow.discipline_status;
    profileRow.discipline_status = params._blocked ? "blocked_manager" : "ok";
    adminLogAction(
      params._blocked ? "admin_block_user" : "admin_unblock_user",
      "profiles", params._user_id,
      { discipline_status: oldV },
      { discipline_status: profileRow.discipline_status, reason },
      targetSchool,
    );
    return Promise.resolve({ data: null, error: null });
  }
  if (name === "admin_set_user_role") {
    const oldV = profileRow.role;
    profileRow.role = params._role;
    adminLogAction(
      "admin_change_role",
      "profiles", params._user_id,
      { role: oldV },
      { role: params._role, reason },
      targetSchool,
    );
    return Promise.resolve({ data: null, error: null });
  }
  return Promise.resolve({ data: null, error: null });
}

// Minimal supabase.from("audit_logs") query builder used to verify the row
function fromAuditLogs() {
  let filtered = [...auditLogs];
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { filtered = filtered.filter((r: any) => r[col] === val); return builder; },
    order: () => builder,
    limit: (n: number) => Promise.resolve({ data: filtered.slice(0, n), error: null }),
    then: (cb: any) => Promise.resolve({ data: filtered, error: null }).then(cb),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, params: any) => simulateRpc(name, params),
    from: (table: string) => {
      if (table === "audit_logs") return fromAuditLogs();
      throw new Error("unexpected table " + table);
    },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/admin/AuditTimeline", () => ({ default: () => <div /> }));

async function openDrawer() {
  const user = userEvent.setup();
  render(<UserDetailDrawer userId={TARGET_USER} open onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText(/alvo@e2e\.com/)).toBeInTheDocument());
  await user.click(screen.getByRole("tab", { name: /Ações/i }));
  await screen.findByRole("tabpanel", { name: /Ações/i });
  return user;
}

async function confirmWith(reason: string) {
  const ta = await screen.findByPlaceholderText(/Descreva o motivo/i);
  fireEvent.change(ta, { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: /^Confirmar$/i }));
}

async function queryLastLogFor(action: string) {
  let row: any = null;
  await waitFor(async () => {
    const res = await fromAuditLogs()
      .select("*")
      .eq("record_id", TARGET_USER)
      .eq("action", action)
      .limit(1);
    expect(res.data.length).toBe(1);
    row = res.data[0];
  });
  return row;
}

function resetState() {
  auditLogs.length = 0;
  profileRow.is_approved = false;
  profileRow.discipline_status = "ok";
  profileRow.role = "teacher";
}

describe("E2E — ações administrativas gravam audit_logs corretamente", () => {
  beforeEach(() => { cleanup(); resetState(); });

  it("Aprovar: dispara RPC, UI mostra sucesso e audit_logs tem performed_by/school_id/reason exatos", async () => {
    const user = await openDrawer();
    const REASON = "Documento validado pela coordenação";
    await user.click(screen.getByRole("button", { name: /Aprovar/i }));
    await confirmWith(REASON);

    const log = await queryLastLogFor("admin_approve_user");
    expect(log.performed_by).toBe(ADMIN_UID);
    expect(log.school_id).toBe(SCHOOL_ID);
    expect(log.new_data.reason).toBe(REASON);
    expect(log.record_id).toBe(TARGET_USER);
  });

  it("Reprovar: audit_logs grava reason verbatim com acentos e pontuação", async () => {
    profileRow.is_approved = true;
    const user = await openDrawer();
    const REASON = "Documentação inválida: faltou CPF.";
    await user.click(screen.getByRole("button", { name: /Reprovar/i }));
    await confirmWith(REASON);

    const log = await queryLastLogFor("admin_reject_user");
    expect(log.performed_by).toBe(ADMIN_UID);
    expect(log.school_id).toBe(SCHOOL_ID);
    expect(log.new_data.reason).toBe(REASON);
  });

  it("Bloquear: audit_logs grava action=admin_block_user com school_id do alvo", async () => {
    const user = await openDrawer();
    const REASON = "Conduta inadequada relatada pela escola";
    await user.click(screen.getByRole("button", { name: /Bloquear/i }));
    await confirmWith(REASON);

    const log = await queryLastLogFor("admin_block_user");
    expect(log.performed_by).toBe(ADMIN_UID);
    expect(log.school_id).toBe(SCHOOL_ID);
    expect(log.new_data.reason).toBe(REASON);
    expect(log.new_data.discipline_status).toBe("blocked_manager");
  });

  it("Desbloquear: audit_logs grava action=admin_unblock_user", async () => {
    profileRow.discipline_status = "blocked_manager";
    const user = await openDrawer();
    const REASON = "Recurso aprovado pela direção";
    await user.click(screen.getByRole("button", { name: /Desbloquear/i }));
    await confirmWith(REASON);

    const log = await queryLastLogFor("admin_unblock_user");
    expect(log.performed_by).toBe(ADMIN_UID);
    expect(log.school_id).toBe(SCHOOL_ID);
    expect(log.new_data.reason).toBe(REASON);
  });

  it("Alterar função: audit_logs grava action=admin_change_role com new_data.role e reason", async () => {
    const user = await openDrawer();
    const REASON = "Promoção aprovada pela secretaria";
    await user.click(screen.getByRole("button", { name: "coord_pedagogico" }));
    await confirmWith(REASON);

    const log = await queryLastLogFor("admin_change_role");
    expect(log.performed_by).toBe(ADMIN_UID);
    expect(log.school_id).toBe(SCHOOL_ID);
    expect(log.new_data.reason).toBe(REASON);
    expect(log.new_data.role).toBe("coord_pedagogico");
    expect(log.old_data.role).toBe("teacher");
  });

  it("Fluxo completo (aprovar → alterar papel → bloquear) gera 3 logs auditados em ordem", async () => {
    const user = await openDrawer();

    await user.click(screen.getByRole("button", { name: /Aprovar/i }));
    await confirmWith("Aprovação inicial após verificação");
    await queryLastLogFor("admin_approve_user");

    // O drawer recarrega após cada ação (mostra Loader2 e depois remonta Tabs),
    // então reativamos a aba "Ações" antes da próxima interação.
    async function gotoAcoes() {
      await waitFor(() => expect(screen.getByRole("tab", { name: /Ações/i })).toBeInTheDocument(), { timeout: 4000 });
      await user.click(screen.getByRole("tab", { name: /Ações/i }));
      await screen.findByRole("tabpanel", { name: /Ações/i });
    }

    await gotoAcoes();
    await user.click(screen.getByRole("button", { name: "supervisor" }));
    await confirmWith("Mudança hierárquica autorizada");
    await queryLastLogFor("admin_change_role");

    await gotoAcoes();
    await user.click(screen.getByRole("button", { name: /Bloquear/i }));
    await confirmWith("Investigação disciplinar em andamento");
    await queryLastLogFor("admin_block_user");

    expect(auditLogs).toHaveLength(3);
    for (const log of auditLogs) {
      expect(log.performed_by).toBe(ADMIN_UID);
      expect(log.school_id).toBe(SCHOOL_ID);
      expect(log.record_id).toBe(TARGET_USER);
      expect(typeof log.new_data.reason).toBe("string");
      expect(log.new_data.reason.length).toBeGreaterThanOrEqual(3);
    }
    expect(auditLogs.map(l => l.action)).toEqual([
      "admin_approve_user", "admin_change_role", "admin_block_user",
    ]);
  });
});
