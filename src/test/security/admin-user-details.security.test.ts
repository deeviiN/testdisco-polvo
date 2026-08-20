import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contrato de segurança: a Edge Function `admin-user-details` NUNCA pode
 * expor senha, hash ou qualquer material criptográfico do auth.users.
 * Este teste lê o código-fonte e bloqueia regressões.
 */
const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/admin-user-details/index.ts"),
  "utf-8"
);

const FORBIDDEN_FIELDS = [
  "encrypted_password",
  "password_hash",
  "recovery_token",
  "confirmation_token",
  "email_change_token",
  "reauthentication_token",
];

describe("admin-user-details edge function — segurança de campos sensíveis", () => {
  for (const field of FORBIDDEN_FIELDS) {
    it(`não menciona o campo sensível "${field}"`, () => {
      expect(SRC.includes(field)).toBe(false);
    });
  }

  it("não retorna o objeto completo do auth user (sem `return ... u.user` cru)", () => {
    // Permitimos `u.user.email`, `u.user.created_at` etc., mas não `user: u.user`
    // nem `...u.user` em respostas JSON.
    expect(/\.\.\.u\.user\b/.test(SRC)).toBe(false);
    expect(/user:\s*u\.user\b/.test(SRC)).toBe(false);
  });

  it("a resposta padrão expõe apenas a allowlist de campos públicos", () => {
    // Garante que existe o bloco com email/created_at/last_sign_in_at/
    // email_confirmed_at/phone/providers e nada mais nessa allowlist.
    const allow = [
      "email:",
      "created_at:",
      "last_sign_in_at:",
      "email_confirmed_at:",
      "phone:",
      "providers:",
    ];
    for (const key of allow) {
      expect(SRC.includes(key)).toBe(true);
    }
  });

  it("valida permissão via has_role('admin') antes de qualquer ação", () => {
    expect(SRC).toMatch(/has_role/);
    expect(SRC).toMatch(/_role:\s*["']admin["']/);
  });

  it("retorna 403 quando o caller não está autorizado", () => {
    expect(SRC).toMatch(/Sem permissão/);
    expect(SRC).toMatch(/\b403\b/);
  });

  it("senha temporária não é persistida no banco do app", () => {
    // Não pode haver insert em uma tabela contendo a senha em texto.
    expect(SRC).not.toMatch(/insert\([^)]*password:\s*tempPassword/i);
    expect(SRC).not.toMatch(/from\(["']temp_passwords?["']\)/i);
    // O valor só é retornado uma vez no JSON da resposta.
    expect(SRC).toMatch(/temp_password:\s*tempPassword/);
  });
});
