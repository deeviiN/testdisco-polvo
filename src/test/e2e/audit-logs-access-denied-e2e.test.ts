/**
 * E2E — leitura de audit_logs por usuários sem permissão.
 *
 * Simula o contrato de RLS do servidor:
 *  - Usuário comum (teacher)    → SELECT em audit_logs retorna permission denied
 *  - Gestor (school-A)          → SELECT em audit_logs retorna permission denied
 *    (gestor NÃO tem acesso a audit_logs; apenas admin global)
 *  - Admin de school-A          → enxerga apenas registros do school-A,
 *                                 nunca registros atribuídos a outras escolas
 *
 * Cobre tanto negação de leitura geral quanto isolamento cross-tenant
 * (vazamento de registros entre escolas).
 */
import { describe, it, expect, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// Fixtures: registros de audit_logs em múltiplas escolas
// --------------------------------------------------------------------------
type AuditRow = {
  id: string;
  action: string;
  performed_by: string;
  school_id: string | null;
  record_id: string;
  reason: string;
  created_at: string;
};

const ALL_LOGS: AuditRow[] = [
  {
    id: "log-1",
    action: "approve_user",
    performed_by: "admin-A",
    school_id: "school-A",
    record_id: "user-A1",
    reason: "Aprovação inicial",
    created_at: "2026-06-01T10:00:00Z",
  },
  {
    id: "log-2",
    action: "block_user",
    performed_by: "admin-A",
    school_id: "school-A",
    record_id: "user-A2",
    reason: "Conduta",
    created_at: "2026-06-02T10:00:00Z",
  },
  {
    id: "log-3",
    action: "change_role",
    performed_by: "admin-B",
    school_id: "school-B",
    record_id: "user-B1",
    reason: "Promoção a coord",
    created_at: "2026-06-03T10:00:00Z",
  },
  {
    id: "log-4",
    action: "reject_user",
    performed_by: "admin-B",
    school_id: "school-B",
    record_id: "user-B2",
    reason: "Documentos inválidos",
    created_at: "2026-06-04T10:00:00Z",
  },
];

// --------------------------------------------------------------------------
// Cliente Supabase simulado com enforcement de RLS sobre audit_logs
// --------------------------------------------------------------------------
type Session = {
  uid: string;
  role: "teacher" | "gestor" | "admin";
  school_id: string | null;
};

function makeClient(session: Session) {
  function selectAuditLogs(): AuditRow[] | { error: { message: string } } {
    // Apenas admin global lê audit_logs. Demais roles → permission denied.
    if (session.role !== "admin") {
      return { error: { message: "permission denied for table audit_logs" } };
    }
    // Admin enxerga apenas registros da própria escola
    return ALL_LOGS.filter((r) => r.school_id === session.school_id);
  }

  function from(table: string) {
    if (table !== "audit_logs") throw new Error("table not mocked: " + table);

    let filtered: AuditRow[] | null = null;
    let denied: { message: string } | null = null;

    const res = selectAuditLogs();
    if ("error" in (res as any)) {
      denied = (res as any).error;
    } else {
      filtered = res as AuditRow[];
    }

    const builder: any = {
      select: () => builder,
      eq: (col: keyof AuditRow, val: any) => {
        if (filtered) filtered = filtered.filter((r) => r[col] === val);
        return builder;
      },
      order: () => builder,
      limit: (n: number) =>
        denied
          ? Promise.resolve({ data: null, error: denied })
          : Promise.resolve({ data: (filtered ?? []).slice(0, n), error: null }),
      then: (cb: any) =>
        Promise.resolve(
          denied ? { data: null, error: denied } : { data: filtered ?? [], error: null }
        ).then(cb),
    };
    return builder;
  }

  return { from };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe("E2E — audit_logs: negação de leitura e isolamento por escola", () => {
  let teacher: ReturnType<typeof makeClient>;
  let gestor: ReturnType<typeof makeClient>;
  let adminA: ReturnType<typeof makeClient>;
  let adminB: ReturnType<typeof makeClient>;

  beforeEach(() => {
    teacher = makeClient({ uid: "user-teacher", role: "teacher", school_id: "school-A" });
    gestor = makeClient({ uid: "user-gestor", role: "gestor", school_id: "school-A" });
    adminA = makeClient({ uid: "admin-A", role: "admin", school_id: "school-A" });
    adminB = makeClient({ uid: "admin-B", role: "admin", school_id: "school-B" });
  });

  it("Usuário comum (teacher) recebe permission denied ao consultar audit_logs", async () => {
    const { data, error } = await teacher.from("audit_logs").select("*").limit(100);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/permission denied/i);
  });

  it("Gestor recebe permission denied ao consultar audit_logs (não é admin global)", async () => {
    const { data, error } = await gestor.from("audit_logs").select("*").limit(100);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/permission denied/i);
  });

  it("Usuário comum não vaza registros mesmo ao filtrar por sua própria escola", async () => {
    const { data, error } = await teacher
      .from("audit_logs")
      .select("*")
      .eq("school_id", "school-A")
      .limit(100);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/permission denied/i);
  });

  it("Usuário comum não vaza registros ao tentar filtrar por outra escola", async () => {
    const { data, error } = await teacher
      .from("audit_logs")
      .select("*")
      .eq("school_id", "school-B")
      .limit(100);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/permission denied/i);
  });

  it("Admin de school-A enxerga apenas registros da própria escola", async () => {
    const { data, error } = await adminA.from("audit_logs").select("*").limit(100);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data!.every((r: AuditRow) => r.school_id === "school-A")).toBe(true);
    expect(data!.map((r: AuditRow) => r.id).sort()).toEqual(["log-1", "log-2"]);
  });

  it("Admin de school-A NÃO consegue ver registros de school-B mesmo filtrando explicitamente", async () => {
    const { data, error } = await adminA
      .from("audit_logs")
      .select("*")
      .eq("school_id", "school-B")
      .limit(100);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("Admin de school-B vê apenas seus próprios registros (isolamento simétrico)", async () => {
    const { data, error } = await adminB.from("audit_logs").select("*").limit(100);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data!.every((r: AuditRow) => r.school_id === "school-B")).toBe(true);
  });

  it("Nenhum registro de outra escola aparece em consulta por record_id alheio", async () => {
    // admin-A tenta puxar log de user-B1 (pertence a school-B)
    const { data, error } = await adminA
      .from("audit_logs")
      .select("*")
      .eq("record_id", "user-B1")
      .limit(100);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
