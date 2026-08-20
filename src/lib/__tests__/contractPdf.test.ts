import { describe, it, expect } from "vitest";
import {
  buildContractPdf,
  buildContractPdfBufferStrict,
  type ContractInput,
} from "@/lib/contractPdf";

const baseContratante = {
  name: "Empresa Agendamento Escolar LTDA",
  cnpj: "49.437.570/0001-32",
  address: "Rua Pastor Fernando Granjeiro, 392",
  city: "Boa Vista",
  state: "RR",
  representative: "Elberth Viana Lima",
  representativeCpf: "517.530.062-87",
};

const cl = (n: number, title: string, body: string) => ({
  title: `CLÁUSULA ${n}ª — ${title}`,
  body,
});

const standardClauses = [
  cl(1, "DO OBJETO", "Acesso à plataforma de agendamento escolar."),
  cl(2, "DA VIGÊNCIA", "12 (doze) meses, renovável."),
  cl(3, "DO VALOR", "R$ 79,90 por mês via PIX, boleto ou cartão."),
  cl(4, "DA MULTA", "Rescisão antecipada implica multa de 50% (R$ 479,40)."),
  cl(5, "DAS OBRIGAÇÕES DA CONTRATANTE", "Acesso, suporte, segurança e LGPD."),
  cl(6, "DAS OBRIGAÇÕES DA CONTRATADA", "Pagamento em dia, uso regular, sigilo de credenciais."),
  cl(7, "DA RESCISÃO", "Aviso prévio de 30 dias; suspensão após 30 dias de inadimplência."),
  cl(8, "DA INADIMPLÊNCIA", "30/60/90 dias → suspensão, SPC/SERASA, protesto."),
  cl(9, "DO FORO", "Comarca de Boa Vista/RR."),
];

const contratos: { name: string; input: ContractInput }[] = [
  {
    name: "Escola militarizada — plano mensal",
    input: {
      title: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
      subtitle: "Plataforma Agendamento de Ambiente Escolar",
      contratante: baseContratante,
      contratada: {
        name: "Colégio Estadual Militarizado Presidente Tancredo Neves - CEM XXIII",
        inep: "14000539",
        cnpj: "45.903.043/0001-15",
        address: "Rua Leôncio Barbosa, 1186, Tancredo Neves",
        city: "Boa Vista",
        state: "RR",
        email: "eetancredoneves@gmail.com",
        phone: "(95) 99113-5502",
        representative: "Maria da Silva",
        representativeCpf: "123.456.789-00",
      },
      clauses: standardClauses,
    },
  },
  {
    name: "Escola civil pequena",
    input: {
      title: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
      subtitle: "Plataforma Agendamento de Ambiente Escolar",
      contratante: baseContratante,
      contratada: {
        name: "EE São José",
        inep: "14001234",
        cnpj: "11.222.333/0001-44",
        city: "Boa Vista",
        state: "RR",
        representative: "João Pereira",
      },
      clauses: standardClauses,
    },
  },
  {
    name: "Contrato extenso (cláusulas longas) — força quebra de página",
    input: {
      title: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
      contratante: baseContratante,
      contratada: {
        name: "Escola Federal de Roraima",
        inep: "14009999",
        city: "Boa Vista",
        state: "RR",
      },
      clauses: Array.from({ length: 12 }, (_, i) =>
        cl(
          i + 1,
          `CLÁUSULA EXTENSA ${i + 1}`,
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40),
        ),
      ),
    },
  },
];

describe("buildContractPdf — geração + validação ABNT por contrato", () => {
  it.each(contratos)(
    "$name: gera PDF e valida ABNT antes do save",
    ({ input }) => {
      const r = buildContractPdf(input);
      expect(r.validation.valid).toBe(true);
      expect(r.validation.errors).toEqual([]);
      expect(r.pageCount).toBeGreaterThanOrEqual(1);

      // Confere que o jsPDF realmente produziu uma página A4 (210x297 mm).
      const w = r.pdf.internal.pageSize.getWidth();
      const h = r.pdf.internal.pageSize.getHeight();
      expect(Math.round(w)).toBe(210);
      expect(Math.round(h)).toBe(297);
    },
  );

  it("contrato extenso gera múltiplas páginas mantendo o A4", () => {
    const r = buildContractPdf(contratos[2].input);
    expect(r.pageCount).toBeGreaterThan(1);
    for (let p = 1; p <= r.pageCount; p++) {
      r.pdf.setPage(p);
      expect(Math.round(r.pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(r.pdf.internal.pageSize.getHeight())).toBe(297);
    }
  });
});

describe("buildContractPdfBufferStrict — bloqueia save quando layout é inválido", () => {
  it("retorna ArrayBuffer não-vazio para layout válido", () => {
    const r = buildContractPdfBufferStrict(contratos[0].input);
    expect(r.validation.valid).toBe(true);
    expect(r.buffer).not.toBeNull();
    expect((r.buffer as ArrayBuffer).byteLength).toBeGreaterThan(500);
  });

  it.each([
    { name: "margem esquerda < 3cm", override: { marginLeftMm: 15 } },
    { name: "fonte tamanho 8 pt", override: { fontSizePt: 8 } },
    { name: "espaçamento simples", override: { lineSpacing: 1 } },
    { name: "recuo de 1ª linha = 0", override: { firstLineIndentMm: 0 } },
    { name: "fonte não recomendada", override: { fontFamily: "courier" } },
    { name: "página fora do A4", override: { pageWidthMm: 216, pageHeightMm: 279 } },
  ])("$name → buffer = null e erros reportados", ({ override }) => {
    const r = buildContractPdfBufferStrict(contratos[0].input, override);
    expect(r.validation.valid).toBe(false);
    expect(r.buffer).toBeNull();
    expect(r.validation.errors.length).toBeGreaterThan(0);
  });
});
