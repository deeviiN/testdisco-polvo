import { z } from "zod";

/**
 * Fonte única de verdade dos 11 setores/funções permitidos no cadastro.
 * Qualquer valor fora desta lista deve ser rejeitado tanto no cliente
 * quanto no banco (CHECK constraint em profiles.intended_role).
 *
 * A ordem abaixo é a mesma do grid da tela de cadastro (Auth.tsx):
 * 10 papéis no grid 2x5 (ROLES_OUTER) + 1 no botão central (ROLE_CENTER).
 */
export const ALLOWED_ROLE_VALUES = [
  "teacher",
  "coord_pedagogico",
  "supervisor",
  "coord_informatica",
  "chef_projeto_vida",
  "coord_lab_ciencias",
  "coord_biblioteca",
  "secretario_escolar",
  "gestor_pedagogico",
  "presidente_apm",
  "usuario_comunidade",
] as const;

export type AllowedRole = (typeof ALLOWED_ROLE_VALUES)[number];

/** Rótulo canônico usado em listagens, filtros, painéis e PDFs. */
export const ALLOWED_ROLE_LABELS: Record<AllowedRole, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coord. Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  coord_informatica: "Coord. Sala de Informática",
  chef_projeto_vida: "Coord. da Sala de Vídeo",
  coord_lab_ciencias: "Coord. do Lab. de Ciências",
  coord_biblioteca: "Coord. da Biblioteca",
  secretario_escolar: "Assistente de Aluno",
  gestor_pedagogico: "Gestão Pedagógica / Administrativo",
  presidente_apm: "Presidente da APM",
  usuario_comunidade: "Usuário da Comunidade",
};

/** Rótulo curto (chips/filtros com pouco espaço). */
export const ALLOWED_ROLE_SHORT_LABELS: Record<AllowedRole, string> = {
  teacher: "Prof.",
  coord_pedagogico: "Coord. Ped.",
  supervisor: "C.A",
  coord_informatica: "Informática",
  chef_projeto_vida: "Sala Vídeo",
  coord_lab_ciencias: "Lab. Ciências",
  coord_biblioteca: "Biblioteca",
  secretario_escolar: "Assist. Aluno",
  gestor_pedagogico: "Gestão",
  presidente_apm: "APM",
  usuario_comunidade: "Comunidade",
};

/** Botões externos do grid do cadastro (10 primeiros valores). */
export const SIGNUP_OUTER_ROLES: Array<{ value: AllowedRole; label: string }> =
  ALLOWED_ROLE_VALUES.slice(0, 10).map((value) => ({
    value,
    label: ALLOWED_ROLE_LABELS[value],
  }));

/** Botão central do grid do cadastro (Comunidade), com rótulo específico da tela. */
export const SIGNUP_CENTER_ROLE: { value: AllowedRole; label: string } = {
  value: "usuario_comunidade",
  label: "Sou usuário da comunidade",
};

/** Lista completa (11) — mesma ordem do grid. */
export const SIGNUP_ROLES: Array<{ value: AllowedRole; label: string }> = [
  ...SIGNUP_OUTER_ROLES,
  SIGNUP_CENTER_ROLE,
];

export const allowedRoleSchema = z.enum(ALLOWED_ROLE_VALUES, {
  errorMap: () => ({ message: "Selecione uma função válida da lista" }),
});

export function isAllowedRole(value: unknown): value is AllowedRole {
  return typeof value === "string" && (ALLOWED_ROLE_VALUES as readonly string[]).includes(value);
}

/** Rótulo canônico com fallback seguro para valores desconhecidos. */
export function roleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return isAllowedRole(value) ? ALLOWED_ROLE_LABELS[value] : value;
}

export function roleShortLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return isAllowedRole(value) ? ALLOWED_ROLE_SHORT_LABELS[value] : value;
}
