import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contrato SQL: cada entrada em audit_logs gravada via admin_log_action
 * precisa carregar performed_by=auth.uid(), school_id do _school_id passado,
 * e reason exatamente como recebido (_reason) — sem reescrita.
 *
 * Cada RPC de ação (approval/role/blocked) precisa passar o school_id do
 * usuário-alvo (v_school) e _reason ao helper, na ordem correta.
 */
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const SRC =
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf-8"))
    .find((sql) => sql.includes("CREATE OR REPLACE FUNCTION public.admin_log_action"))!;

function body(fn: string): string {
  const m = SRC.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`)
  );
  if (!m) throw new Error(`função ${fn} não encontrada`);
  return m[1];
}

describe("audit_logs INSERT — contrato de campos", () => {
  const log = body("admin_log_action");

  it("colunas inseridas, na ordem: action, table_name, record_id, old_data, new_data, performed_by, school_id", () => {
    expect(log).toMatch(
      /INSERT INTO public\.audit_logs\s*\(\s*action\s*,\s*table_name\s*,\s*record_id\s*,\s*old_data\s*,\s*new_data\s*,\s*performed_by\s*,\s*school_id\s*\)/
    );
  });

  it("performed_by é sempre auth.uid() do chamador (não confiavel em parâmetro)", () => {
    // performed_by ocupa a 6ª posição do VALUES → deve ser auth.uid()
    const valuesMatch = log.match(/VALUES\s*\(([\s\S]*?)\)\s*RETURNING/);
    expect(valuesMatch).toBeTruthy();
    const cols = valuesMatch![1].split(/,(?![^()]*\))/).map((s) => s.trim());
    expect(cols).toHaveLength(7);
    expect(cols[5]).toBe("auth.uid()");
    expect(cols[6]).toBe("_school_id");
  });

  it("reason é embutido em new_data exatamente como recebido (_reason, sem transformação)", () => {
    expect(log).toMatch(
      /jsonb_build_object\(\s*'reason'\s*,\s*_reason\s*\)/
    );
    // Não pode haver lower(), btrim(), substring() etc. envolvendo _reason no INSERT
    expect(log).not.toMatch(/lower\(\s*_reason/);
    expect(log).not.toMatch(/substring\(\s*_reason/);
    expect(log).not.toMatch(/btrim\(\s*_reason\s*\)[\s\S]*jsonb_build_object/);
  });

  it("RPC executora não consegue forjar performed_by: parâmetro inexistente", () => {
    // Não há parâmetro _performed_by no helper
    expect(log).not.toMatch(/_performed_by/);
  });
});

describe("RPCs de ação encaminham school_id correto (v_school) e _reason ao helper", () => {
  for (const fn of ["admin_set_user_approval", "admin_set_user_role", "admin_set_user_blocked"]) {
    it(`${fn}: captura v_school do perfil-alvo e chama admin_log_action(..., v_school, ..., _reason)`, () => {
      const src = body(fn);
      // school_id vem do profile do _user_id (não do chamador)
      expect(src).toMatch(
        /SELECT[\s\S]+p\.school_id\s+INTO[\s\S]*v_school[\s\S]+FROM profiles p WHERE p\.user_id = _user_id/
      );
      // Chamada ao helper com v_school E _reason verbatim
      const call = src.match(/admin_log_action\(([\s\S]*?)\);/);
      expect(call).toBeTruthy();
      const argsStr = call![1];
      expect(argsStr).toMatch(/\bv_school\b/);
      expect(argsStr).toMatch(/\b_reason\b/);
      // Não há reescrita do _reason antes de logar
      expect(argsStr).not.toMatch(/lower\(\s*_reason/);
      expect(argsStr).not.toMatch(/concat\([^)]*_reason/);
    });
  }
});
