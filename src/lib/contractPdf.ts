// Gerador de PDF de contrato em formato ABNT (A4, Times 12, espaço 1,5,
// margens 3/3/2/2 cm, recuo 1,25 cm). Função pura — não depende do React —
// para permitir testes automatizados que validem o layout antes do save.

import jsPDF from "jspdf";
import {
  validateAbntLayout,
  ABNT_CONTRACT_LAYOUT,
  type AbntLayout,
  type AbntValidationResult,
} from "@/lib/abntValidation";

export interface ContractParty {
  name: string;
  cnpj?: string;
  cpf?: string;
  address?: string;
  city?: string;
  state?: string;
  email?: string;
  phone?: string;
  representative?: string;
  representativeCpf?: string;
  inep?: string;
}

export interface ContractClause {
  title: string;
  body: string;
}

export interface ContractInput {
  title: string;
  subtitle?: string;
  contratante: ContractParty;
  contratada: ContractParty;
  clauses: ContractClause[];
  cityForSignature?: string;
  date?: string;
}

export interface BuildContractResult {
  pdf: jsPDF;
  layout: AbntLayout;
  validation: AbntValidationResult;
  pageCount: number;
}

export function buildContractPdf(
  input: ContractInput,
  layoutOverride?: Partial<AbntLayout>,
): BuildContractResult {
  const layout: AbntLayout = { ...ABNT_CONTRACT_LAYOUT, ...layoutOverride };
  const validation = validateAbntLayout(layout);
  if (!validation.valid) {
    // Devolve a referência (sem gerar) para que o chamador decida.
    const emptyPdf = new jsPDF("p", "mm", "a4");
    return { pdf: emptyPdf, layout, validation, pageCount: 0 };
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const maxW = pageW - layout.marginLeftMm - layout.marginRightMm;
  let y = layout.marginTopMm;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - layout.marginBottomMm) {
      pdf.addPage();
      y = layout.marginTopMm;
    }
  };

  const addParagraph = (
    text: string,
    opts?: { bold?: boolean; align?: "left" | "center"; gap?: number; indent?: boolean },
  ) => {
    pdf.setFont(layout.fontFamily, opts?.bold ? "bold" : "normal");
    pdf.setFontSize(layout.fontSizePt);
    const lh = layout.fontSizePt * 0.3528 * layout.lineSpacing;
    const indent = opts?.indent ?? true;
    const firstW = indent ? maxW - layout.firstLineIndentMm : maxW;
    const allLines = pdf.splitTextToSize(text, maxW) as string[];
    // Recompõe respeitando recuo da 1ª linha.
    const firstLines = pdf.splitTextToSize(text, firstW) as string[];
    const first = firstLines[0] ?? "";
    const restRaw = text.substring(first.length).trimStart();
    const restLines = restRaw ? (pdf.splitTextToSize(restRaw, maxW) as string[]) : [];
    const lines = [
      { text: first, x: layout.marginLeftMm + (indent ? layout.firstLineIndentMm : 0) },
      ...restLines.map((t) => ({ text: t, x: layout.marginLeftMm })),
    ].filter((l) => l.text);

    lines.forEach((ln) => {
      ensureSpace(lh);
      if (opts?.align === "center") {
        pdf.text(ln.text, pageW / 2, y, { align: "center" });
      } else {
        pdf.text(ln.text, ln.x, y);
      }
      y += lh;
    });
    void allLines; // mantém referência opcional
    y += opts?.gap ?? 3;
  };

  addParagraph(input.title, { bold: true, align: "center", gap: 2, indent: false });
  if (input.subtitle) addParagraph(input.subtitle, { bold: true, align: "center", gap: 6, indent: false });

  const partyLine = (label: string, p: ContractParty) => {
    addParagraph(label, { bold: true, gap: 1, indent: false });
    const parts = [
      p.name,
      p.cnpj && `CNPJ ${p.cnpj}`,
      p.cpf && `CPF ${p.cpf}`,
      p.inep && `INEP ${p.inep}`,
      p.address && `endereço: ${p.address}`,
      [p.city, p.state].filter(Boolean).join("/"),
      p.email && `e-mail: ${p.email}`,
      p.phone && `telefone: ${p.phone}`,
      p.representative && `representado por ${p.representative}` + (p.representativeCpf ? `, CPF ${p.representativeCpf}` : ""),
    ].filter(Boolean);
    addParagraph(parts.join(", ") + ".", { gap: 4 });
  };
  partyLine("CONTRATANTE (Prestadora):", input.contratante);
  partyLine("CONTRATADA (Escola):", input.contratada);

  const finalClauses = injectResponsabilidadePJClause(input.clauses);
  finalClauses.forEach((c) => {
    addParagraph(c.title, { bold: true, gap: 1, indent: false });
    addParagraph(c.body);
  });

  const date = input.date ?? new Date().toLocaleDateString("pt-BR");
  const city = input.cityForSignature ?? input.contratante.city ?? "—";
  y += 8;
  addParagraph(`${city}, ${date}.`, { align: "center", gap: 16, indent: false });
  addParagraph("____________________________________________", { align: "center", gap: 1, indent: false });
  addParagraph(`CONTRATANTE — ${input.contratante.name}`, { align: "center", gap: 12, indent: false });
  addParagraph("____________________________________________", { align: "center", gap: 1, indent: false });
  addParagraph(`CONTRATADA — ${input.contratada.name}`, { align: "center", indent: false });

  return {
    pdf,
    layout,
    validation,
    pageCount: pdf.getNumberOfPages(),
  };
}

export const RESPONSABILIDADE_PJ_CLAUSE_BODY =
  "O Gestor, ao firmar este contrato em nome da instituição, exerce seu papel de representante temporário da escola, não assumindo qualquer responsabilidade pessoal ou penalidade decorrente de inadimplência. Em caso de descumprimento das obrigações financeiras ou não pagamento das mensalidades, a responsabilidade será exclusivamente da escola, pessoa jurídica titular do contrato, isentando o Gestor de quaisquer sanções, multas ou restrições por parte do aplicativo ou da contratante. Dessa forma, o gestor fica totalmente resguardado, e a escola (CNPJ) assume o compromisso, como deve ser.";

const ROMAN = ["", "1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª", "11ª", "12ª", "13ª", "14ª", "15ª", "16ª", "17ª", "18ª", "19ª", "20ª"];

/**
 * Insere automaticamente a Cláusula 9ª — Da Responsabilidade Exclusiva da Pessoa
 * Jurídica logo após a cláusula 8ª (Inadimplência) e renumera as cláusulas
 * seguintes (Foro passa a ser 10ª). Idempotente: não duplica se já existir.
 */
export function injectResponsabilidadePJClause(
  clauses: ContractClause[],
): ContractClause[] {
  const already = clauses.some((c) =>
    /respons[aá]bilidade\s+exclusiva\s+da\s+pessoa\s+jur[ií]dica/i.test(c.title),
  );
  if (already) return clauses;

  // Remove versão antiga (isenção de penalidade ao gestor), se existir.
  const filtered = clauses.filter(
    (c) => !/isen[çc][aã]o\s+de\s+penalidade\s+ao\s+gestor/i.test(c.title),
  );

  const idx8 = filtered.findIndex((c) => /^\s*CL[ÁA]USULA\s+8[ªa°]/i.test(c.title));
  const insertAt = idx8 >= 0 ? idx8 + 1 : filtered.length - 1; // antes do Foro se 8 não achada

  const newClause: ContractClause = {
    title: "CLÁUSULA 9ª — DA RESPONSABILIDADE EXCLUSIVA DA PESSOA JURÍDICA",
    body: RESPONSABILIDADE_PJ_CLAUSE_BODY,
  };

  const out = [...filtered.slice(0, insertAt), newClause, ...filtered.slice(insertAt)];

  // Renumera todos os títulos sequencialmente para manter coerência (1ª … Nª).
  return out.map((c, i) => {
    const n = i + 1;
    const numbered = c.title.replace(/^\s*CL[ÁA]USULA\s+\d+[ªa°]\s*[—\-–]\s*/i, "");
    return {
      ...c,
      title: `CLÁUSULA ${ROMAN[n] ?? `${n}ª`} — ${numbered}`.toUpperCase(),
    };
  });
}

/**
 * Helper que aplica a validação ABNT e só salva o PDF se o layout for compatível.
 * Retorna o ArrayBuffer (`null` se reprovado).
 */
export function buildContractPdfBufferStrict(
  input: ContractInput,
  layoutOverride?: Partial<AbntLayout>,
): { buffer: ArrayBuffer | null; validation: AbntValidationResult; pageCount: number } {
  const r = buildContractPdf(input, layoutOverride);
  if (!r.validation.valid) {
    return { buffer: null, validation: r.validation, pageCount: 0 };
  }
  const buffer = r.pdf.output("arraybuffer") as ArrayBuffer;
  return { buffer, validation: r.validation, pageCount: r.pageCount };
}
