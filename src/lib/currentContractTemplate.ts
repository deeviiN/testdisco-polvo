// Cláusulas-base do contrato vigente (modelo atual).
// Centralizadas para que a Gaveta de Documentos do Gestor, o painel do
// administrador e a tela de assinatura usem exatamente o mesmo texto.
import {
  buildContractPdfBufferStrict,
  type ContractClause,
  type ContractInput,
  type ContractParty,
} from "@/lib/contractPdf";
import { supabase } from "@/integrations/supabase/client";

export const BASE_CONTRACT_CLAUSES: ContractClause[] = [
  { title: "CLÁUSULA 1ª — DO OBJETO", body: "Prestação de serviços mediante licença de uso da plataforma digital Agendamento de Ambiente Escolar." },
  { title: "CLÁUSULA 2ª — DA LICENÇA DE USO", body: "Licença limitada, não exclusiva, intransferível e revogável durante a vigência contratual." },
  { title: "CLÁUSULA 3ª — DA VIGÊNCIA E FIDELIDADE", body: "12 (doze) meses, renovável automaticamente. Fidelidade mínima de 24 meses; cancelamento antes desse prazo implica multa proporcional aos meses restantes." },
  { title: "CLÁUSULA 4ª — DOS VALORES", body: "Valor mensal de referência: R$ 199,90. Pagamento via PIX, boleto bancário ou cartão de crédito conforme plano contratado." },
  { title: "CLÁUSULA 5ª — DO REAJUSTE", body: "Reajuste anual pelo IPCA ou índice oficial substituto." },
  { title: "CLÁUSULA 6ª — DAS OBRIGAÇÕES DA CONTRATANTE", body: "a) Disponibilizar o acesso; b) Manutenção e evolução do sistema; c) Suporte técnico; d) Proteção dos dados conforme LGPD." },
  { title: "CLÁUSULA 7ª — DAS OBRIGAÇÕES DA CONTRATADA", body: "a) Pagamento em dia; b) Uso lícito da plataforma; c) Sigilo das credenciais; d) Informações verdadeiras e atualizadas." },
  { title: "CLÁUSULA 8ª — DA INADIMPLÊNCIA", body: "30/60/90 dias: suspensão, SPC/SERASA, protesto. Multa 2%, juros 1% a.m., honorários quando aplicáveis." },
  { title: "CLÁUSULA 9ª — DO FORO", body: "Comarca de Boa Vista/RR." },
];

export interface CurrentContractSources {
  schoolId: string;
}

export interface CurrentContractResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
}

/**
 * Busca dados da escola + empresa contratante e gera o PDF do contrato vigente
 * usando exatamente o mesmo template do painel administrativo.
 */
export async function generateCurrentContractPdf(
  { schoolId }: CurrentContractSources,
): Promise<CurrentContractResult> {
  const [schoolRes, companyRes] = await Promise.all([
    supabase.from("schools").select("id, name, city, state, inep_code").eq("id", schoolId).maybeSingle(),
    supabase.from("company_settings").select("*").limit(1).maybeSingle(),
  ]);

  const school = schoolRes.data;
  const company = companyRes.data as any;
  if (!school) throw new Error("Escola não encontrada.");

  const contratante: ContractParty = {
    name: company?.razao_social || "—",
    cnpj: company?.cnpj || "—",
    address: [company?.address, company?.number, company?.neighborhood].filter(Boolean).join(", ") || undefined,
    city: company?.city,
    state: company?.state,
    representative: company?.representative_name || "—",
    representativeCpf: company?.representative_cpf,
  };

  const contratada: ContractParty = {
    name: school.name,
    inep: school.inep_code || undefined,
    city: school.city,
    state: school.state,
  };

  const input: ContractInput = {
    title: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
    subtitle: "Plataforma Agendamento de Ambiente Escolar",
    contratante,
    contratada,
    clauses: BASE_CONTRACT_CLAUSES,
    cityForSignature: company?.city || "Boa Vista/RR",
  };

  const { buffer, validation, pageCount } = buildContractPdfBufferStrict(input);
  if (!buffer) {
    throw new Error(`Contrato fora do padrão ABNT: ${validation.errors[0] ?? "erro desconhecido"}`);
  }

  const blob = new Blob([buffer], { type: "application/pdf" });
  const safe = (school.name || "escola").replace(/\s+/g, "_").substring(0, 40);
  return { blob, fileName: `contrato_vigente_${safe}.pdf`, pageCount };
}
