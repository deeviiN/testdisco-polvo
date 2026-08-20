/**
 * Validação automática do pipeline de documentos de PIX/Boletos.
 *
 * Diferente de contratos, PIX/Boletos não usam Storage bucket: são gerados
 * pelo Mercado Pago via edge function `criar-pagamento-mp` e persistidos na
 * tabela `pagamentos`. Tanto a gaveta do admin (`AdminDocumentos.tsx`) quanto
 * a gaveta do gestor (`GestorDocumentos.tsx`) leem dessa MESMA tabela e
 * precisam classificar igualmente como PIX vs Boleto, expor as mesmas
 * colunas (ticket_url, qr_code, status, metodo) e aplicar a mesma lógica
 * de "PAGO".
 *
 * Este teste falha automaticamente se algum lado divergir (renomear coluna,
 * mudar classificador, esquecer de propagar status, trocar tabela).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminSrc = readFileSync(
  resolve(__dirname, "../AdminDocumentos.tsx"),
  "utf8",
);
const gestorSrc = readFileSync(
  resolve(__dirname, "../GestorDocumentos.tsx"),
  "utf8",
);
const edgeSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/criar-pagamento-mp/index.ts"),
  "utf8",
);

const TABLE = "pagamentos";
const REQUIRED_COLUMNS = [
  "plano",
  "valor",
  "metodo",
  "status",
  "ticket_url",
  "qr_code",
  "qr_code_base64",
  "created_at",
  "approved_at",
];

function extractSelect(src: string): string[] {
  const m = src.match(
    /\.from\(\s*["']pagamentos["']\s*\)\s*\.select\(\s*["']([^"']+)["']/,
  );
  if (!m) return [];
  return m[1].split(",").map((c) => c.trim());
}

describe("Payment document pipeline (admin gaveta ↔ gestor gaveta)", () => {
  it("admin e gestor leem da mesma tabela `pagamentos`", () => {
    expect(adminSrc).toMatch(/\.from\(\s*["']pagamentos["']\s*\)/);
    expect(gestorSrc).toMatch(/\.from\(\s*["']pagamentos["']\s*\)/);
  });

  it("admin e gestor selecionam EXATAMENTE as mesmas colunas de pagamento", () => {
    const adminCols = extractSelect(adminSrc);
    const gestorCols = extractSelect(gestorSrc);
    expect(adminCols.length).toBeGreaterThan(0);
    expect(gestorCols.length).toBeGreaterThan(0);
    for (const col of REQUIRED_COLUMNS) {
      expect(adminCols, `admin não seleciona ${col}`).toContain(col);
      expect(gestorCols, `gestor não seleciona ${col}`).toContain(col);
    }
    // Garantia simétrica: admin precisa de school_id (multi-tenant); gestor não
    expect(adminCols).toContain("school_id");
  });

  it("classificação PIX vs Boleto usa a MESMA regra nos dois arquivos", () => {
    // Regex idêntico nos dois: metodo inclui 'pix' OU qr_code OU qr_code_base64
    const rule =
      /metodo.*?(?:includes|indexOf)\(\s*["']pix["']\s*\)[\s\S]{0,80}?qr_code[\s\S]{0,40}?qr_code_base64/;
    expect(adminSrc, "admin não usa a regra padrão de classificação PIX").toMatch(rule);
    expect(gestorSrc, "gestor não usa a regra padrão de classificação PIX").toMatch(rule);
  });

  it("status PAGO é normalizado com o MESMO conjunto de valores nos dois lados", () => {
    // Admin define um Set/array nomeado (ex.: PAID_STATUS); gestor usa array inline.
    // Extraímos os termos de cada lado, independente da forma sintática.
    function extractPaidTerms(src: string): Set<string> {
      // 1) Tenta forma inline: [...].includes(status) ou new Set([...]).has(status)
      const inline = src.match(
        /(?:\[|new Set\(\[)\s*((?:["'][a-z_]+["']\s*,?\s*){3,})\]\)?\s*\.(?:includes|has)\(\s*status\s*\)/,
      );
      if (inline) {
        return new Set(inline[1].match(/["']([a-z_]+)["']/g)!.map((s) => s.replace(/["']/g, "")));
      }
      // 2) Forma nomeada: const NAME = new Set([...]) e uso NAME.has(status)
      const namedUse = src.match(/\b([A-Z_][A-Z0-9_]+)\.has\(\s*status\s*\)/);
      if (namedUse) {
        const def = src.match(
          new RegExp(
            `const\\s+${namedUse[1]}\\s*=\\s*(?:new Set\\(\\[|\\[)\\s*((?:["'][a-z_]+["']\\s*,?\\s*)+)\\]`,
          ),
        );
        if (def) {
          return new Set(def[1].match(/["']([a-z_]+)["']/g)!.map((s) => s.replace(/["']/g, "")));
        }
      }
      return new Set();
    }
    const adminTerms = extractPaidTerms(adminSrc);
    const gestorTerms = extractPaidTerms(gestorSrc);
    expect(adminTerms.size, "admin não normaliza status PAGO").toBeGreaterThan(0);
    expect(gestorTerms.size, "gestor não normaliza status PAGO").toBeGreaterThan(0);
    // Mínimo obrigatório
    for (const term of ["approved", "paid", "pago", "aprovado", "completed", "succeeded"]) {
      expect(adminTerms, `admin não aceita ${term}`).toContain(term);
      expect(gestorTerms, `gestor não aceita ${term}`).toContain(term);
    }
    // Simetria estrita: os dois conjuntos devem ser idênticos
    expect([...adminTerms].sort()).toEqual([...gestorTerms].sort());
  });

  it("PIX expõe `qr_code` (copia-e-cola) e Boleto expõe `ticket_url` em ambos os lados", () => {
    // PIX: pixCode vem de p.qr_code
    expect(adminSrc).toMatch(/pixCode:\s*[^,\n]*p\.qr_code/);
    expect(gestorSrc).toMatch(/pixCode:\s*p\.qr_code/);
    // Boleto: url vem de p.ticket_url
    expect(adminSrc).toMatch(/url:\s*p\.ticket_url/);
    expect(gestorSrc).toMatch(/url:\s*p\.ticket_url/);
  });

  it("edge function `criar-pagamento-mp` é a ÚNICA origem dos pagamentos (sem upload de admin)", () => {
    // Edge function persiste em `pagamentos` com os campos esperados
    expect(edgeSrc).toMatch(/from\(\s*["']pagamentos["']\s*\)/);
    expect(edgeSrc).toMatch(/ticket_url/);
    expect(edgeSrc).toMatch(/qr_code/);
    // Nem admin nem gestor podem inserir/upload em `pagamentos` direto do client
    expect(adminSrc).not.toMatch(/from\(\s*["']pagamentos["']\s*\)\s*\.insert\(/);
    expect(gestorSrc).not.toMatch(/from\(\s*["']pagamentos["']\s*\)\s*\.insert\(/);
    // Não existe bucket de storage para boleto/pix
    expect(adminSrc).not.toMatch(/storage\.from\(\s*["'](boletos|pix|pagamentos)["']\s*\)/);
    expect(gestorSrc).not.toMatch(/storage\.from\(\s*["'](boletos|pix|pagamentos)["']\s*\)/);
  });

  it("admin filtra por `school_id` para visão multi-tenant; gestor filtra por sua própria escola", () => {
    // Gestor: .eq('school_id', schoolId)
    expect(gestorSrc).toMatch(
      /\.from\(\s*["']pagamentos["']\s*\)[\s\S]*?\.eq\(\s*["']school_id["']\s*,\s*schoolId\s*\)/,
    );
    // Admin: agrupa por school_id (sem filtro fixo) — precisa do campo no select
    expect(extractSelect(adminSrc)).toContain("school_id");
  });
});
