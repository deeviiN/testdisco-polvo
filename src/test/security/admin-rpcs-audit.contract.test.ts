import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contrato SQL: as RPCs administrativas precisam:
 *  - exigir has_role(auth.uid(),'admin')
 *  - exigir _reason com >= 3 caracteres
 *  - chamar admin_log_action passando v_school e _reason
 *
 * E admin_log_action precisa gravar performed_by=auth.uid(), school_id e reason.
 *
 * Esses testes leem o arquivo de migração para travar regressões.
 */
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const MIGRATION_FILE = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf-8"))
  .find((sql) => sql.includes("CREATE OR REPLACE FUNCTION public.admin_set_user_approval"));

if (!MIGRATION_FILE) throw new Error("Migration com admin_set_user_approval não encontrada");

function extractFunctionBody(source: string, fnName: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${fnName}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`,
    "m"
  );
  const m = source.match(re);
  if (!m) throw new Error(`Função ${fnName} não encontrada`);
  return m[1];
}

const ACTION_FNS = [
  { fn: "admin_set_user_approval", action: /admin_(approve|reject)_user/ },
  { fn: "admin_set_user_role", action: /admin_set_user_role/ },
  { fn: "admin_set_user_blocked", action: /admin_(block|unblock)_user/ },
];

describe("Contrato SQL — RPCs administrativas auditadas", () => {
  describe("admin_log_action helper grava performed_by, school_id e reason", () => {
    const body = extractFunctionBody(MIGRATION_FILE, "admin_log_action");

    it("checa has_role('admin') antes de inserir", () => {
      expect(body).toMatch(/has_role\(\s*auth\.uid\(\)\s*,\s*'admin'\s*\)/);
      expect(body).toMatch(/forbidden_admin_only/);
    });

    it("INSERT em audit_logs com colunas performed_by, school_id e new_data", () => {
      expect(body).toMatch(/INSERT INTO public\.audit_logs/);
      expect(body).toMatch(/performed_by/);
      expect(body).toMatch(/school_id/);
      expect(body).toMatch(/auth\.uid\(\)/);
    });

    it("embute o reason no payload de auditoria (new_data → 'reason')", () => {
      expect(body).toMatch(/jsonb_build_object\(\s*'reason'\s*,\s*_reason\s*\)/);
    });
  });

  for (const { fn, action } of ACTION_FNS) {
    describe(fn, () => {
      const body = extractFunctionBody(MIGRATION_FILE, fn);

      it("exige role 'admin'", () => {
        expect(body).toMatch(/has_role\(\s*auth\.uid\(\)\s*,\s*'admin'\s*\)/);
        expect(body).toMatch(/forbidden_admin_only/);
      });

      it("bloqueia chamadas sem motivo (length(_reason) >= 3)", () => {
        expect(body).toMatch(/length\(\s*btrim\(\s*_reason\s*\)\s*\)\s*<\s*3/);
        expect(body).toMatch(/reason_required/);
      });

      it("captura school_id atual do perfil-alvo (v_school)", () => {
        expect(body).toMatch(/p\.school_id\s+INTO\s+v_old\s*,\s*v_school/);
      });

      it("chama admin_log_action com v_school, _reason e a action correta", () => {
        expect(body).toMatch(/admin_log_action\(/);
        expect(body).toMatch(action);
        // Passa v_school e _reason como argumentos
        expect(body).toMatch(/v_school/);
        expect(body).toMatch(/_reason/);
      });
    });
  }

  it("admin_set_user_approval registra approve OU reject conforme _approved", () => {
    const body = extractFunctionBody(MIGRATION_FILE, "admin_set_user_approval");
    expect(body).toMatch(/CASE WHEN _approved THEN 'admin_approve_user' ELSE 'admin_reject_user' END/);
  });

  it("admin_set_user_blocked registra block OU unblock conforme _blocked", () => {
    const body = extractFunctionBody(MIGRATION_FILE, "admin_set_user_blocked");
    expect(body).toMatch(/CASE WHEN _blocked THEN 'admin_block_user' ELSE 'admin_unblock_user' END/);
  });

  it("RPCs administrativas têm EXECUTE revogado de PUBLIC", () => {
    expect(MIGRATION_FILE).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_user_approval/);
    expect(MIGRATION_FILE).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_user_role/);
    expect(MIGRATION_FILE).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_user_blocked/);
  });
});
