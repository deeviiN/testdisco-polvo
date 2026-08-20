/**
 * Monta o cabeçalho oficial a ser exibido em documentos PDF
 * (comunicados, solicitações, visão geral) a partir dos dados da escola.
 *
 * Regras:
 *  - Rede ESTADUAL → "Governo do Estado de <UF>" + Secretaria Estadual oficial.
 *  - Rede MUNICIPAL → "Prefeitura Municipal de <Cidade>" + "Secretaria Municipal de Educação — SEMED".
 *  - Rede FEDERAL → "Ministério da Educação" + "Governo Federal".
 *  - Rede PRIVADA → sem cabeçalho institucional (apenas nome da escola).
 */

type Network = "estadual" | "municipal" | "federal" | "privada" | string | null | undefined;

interface SecretariaEstadual {
  governo: string;
  secretaria: string;
}

// Nomes oficiais correntes (2024/2025) das secretarias estaduais de educação
// + sigla mais usada. Mantido como tabela estática (mais confiável que IA).
const SECRETARIAS_ESTADUAIS: Record<string, SecretariaEstadual> = {
  AC: { governo: "Governo do Estado do Acre", secretaria: "Secretaria de Estado de Educação, Cultura e Esportes — SEE/AC" },
  AL: { governo: "Governo do Estado de Alagoas", secretaria: "Secretaria de Estado da Educação — SEDUC/AL" },
  AP: { governo: "Governo do Estado do Amapá", secretaria: "Secretaria de Estado da Educação — SEED/AP" },
  AM: { governo: "Governo do Estado do Amazonas", secretaria: "Secretaria de Estado de Educação e Desporto Escolar — SEDUC/AM" },
  BA: { governo: "Governo do Estado da Bahia", secretaria: "Secretaria da Educação do Estado da Bahia — SEC/BA" },
  CE: { governo: "Governo do Estado do Ceará", secretaria: "Secretaria da Educação do Estado do Ceará — SEDUC/CE" },
  DF: { governo: "Governo do Distrito Federal", secretaria: "Secretaria de Estado de Educação do Distrito Federal — SEEDF" },
  ES: { governo: "Governo do Estado do Espírito Santo", secretaria: "Secretaria de Estado da Educação — SEDU/ES" },
  GO: { governo: "Governo do Estado de Goiás", secretaria: "Secretaria de Estado da Educação — SEDUC/GO" },
  MA: { governo: "Governo do Estado do Maranhão", secretaria: "Secretaria de Estado da Educação — SEDUC/MA" },
  MT: { governo: "Governo do Estado de Mato Grosso", secretaria: "Secretaria de Estado de Educação — SEDUC/MT" },
  MS: { governo: "Governo do Estado de Mato Grosso do Sul", secretaria: "Secretaria de Estado de Educação — SED/MS" },
  MG: { governo: "Governo do Estado de Minas Gerais", secretaria: "Secretaria de Estado de Educação — SEE/MG" },
  PA: { governo: "Governo do Estado do Pará", secretaria: "Secretaria de Estado de Educação — SEDUC/PA" },
  PB: { governo: "Governo do Estado da Paraíba", secretaria: "Secretaria de Estado da Educação e da Ciência e Tecnologia — SEECT/PB" },
  PR: { governo: "Governo do Estado do Paraná", secretaria: "Secretaria de Estado da Educação — SEED/PR" },
  PE: { governo: "Governo do Estado de Pernambuco", secretaria: "Secretaria de Educação e Esportes — SEE/PE" },
  PI: { governo: "Governo do Estado do Piauí", secretaria: "Secretaria de Estado da Educação — SEDUC/PI" },
  RJ: { governo: "Governo do Estado do Rio de Janeiro", secretaria: "Secretaria de Estado de Educação — SEEDUC/RJ" },
  RN: { governo: "Governo do Estado do Rio Grande do Norte", secretaria: "Secretaria de Estado da Educação, da Cultura, do Esporte e do Lazer — SEEC/RN" },
  RS: { governo: "Governo do Estado do Rio Grande do Sul", secretaria: "Secretaria da Educação do Estado — SEDUC/RS" },
  RO: { governo: "Governo do Estado de Rondônia", secretaria: "Secretaria de Estado da Educação — SEDUC/RO" },
  RR: { governo: "Governo do Estado de Roraima", secretaria: "Secretaria de Estado da Educação e Desporto — SEED/RR" },
  SC: { governo: "Governo do Estado de Santa Catarina", secretaria: "Secretaria de Estado da Educação — SED/SC" },
  SP: { governo: "Governo do Estado de São Paulo", secretaria: "Secretaria da Educação do Estado de São Paulo — SEDUC/SP" },
  SE: { governo: "Governo do Estado de Sergipe", secretaria: "Secretaria de Estado da Educação, do Esporte e da Cultura — SEDUC/SE" },
  TO: { governo: "Governo do Estado do Tocantins", secretaria: "Secretaria de Estado da Educação — SEDUC/TO" },
};

export interface OfficialHeaderInput {
  network?: Network;
  state?: string | null;
  city?: string | null;
  schoolName?: string | null;
}

export interface OfficialHeaderLines {
  /** Linha 1 — esfera de governo (vazio para rede privada). */
  governo: string;
  /** Linha 2 — secretaria/órgão (vazio para rede privada). */
  secretaria: string;
  /** Linha 3 — nome da escola. */
  escola: string;
  /** Lista compacta (filtra strings vazias) pronta para iterar no PDF. */
  lines: string[];
}

export function buildOfficialHeader(input: OfficialHeaderInput): OfficialHeaderLines {
  const network = String(input.network || "estadual").toLowerCase();
  const uf = (input.state || "").trim().toUpperCase();
  const city = (input.city || "").trim();
  const escola = (input.schoolName || "").trim();

  let governo = "";
  let secretaria = "";

  if (network === "estadual") {
    const sec = SECRETARIAS_ESTADUAIS[uf];
    if (sec) {
      governo = sec.governo;
      secretaria = sec.secretaria;
    } else if (uf) {
      governo = `Governo do Estado de ${uf}`;
      secretaria = "Secretaria de Estado da Educação";
    }
  } else if (network === "municipal") {
    if (city) governo = `Prefeitura Municipal de ${city}`;
    secretaria = "Secretaria Municipal de Educação — SEMED";
  } else if (network === "federal") {
    governo = "Governo Federal";
    secretaria = "Ministério da Educação — MEC";
  }
  // 'privada' e demais → sem cabeçalho institucional

  const lines = [governo, secretaria, escola].filter((s) => !!s);
  return { governo, secretaria, escola, lines };
}
