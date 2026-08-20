// Dicionário i18n-ready para a tela "Perfil não encontrado".
// Estrutura: dict[lang][role][key]. Para adicionar EN/ES, basta replicar a chave "pt".

import type { Language } from "@/lib/translations";

export type RoleKey =
  | "admin"
  | "gestor_pedagogico"
  | "chef_projeto_vida"
  | "coord_pedagogico"
  | "supervisor"
  | "secretario_escolar"
  | "teacher"
  | "default";

export interface RoleStrings {
  title: string;
  intro: string;
  steps: string[];
  redirectLabel: string;
  supportPrefix: string; // mensagem inicial do WhatsApp
}

export interface RoleConfig extends RoleStrings {
  redirectPath: string; // não traduzível
}

const ptRoles: Record<RoleKey, RoleStrings> = {
  admin: {
    title: "Perfil de administrador não vinculado",
    intro: "Sua conta tem permissão de administrador, mas o perfil ainda não foi criado no banco.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao suporte solicitando a criação do perfil de admin.",
      "Aguarde a confirmação do vínculo.",
      "Toque em “Aguardar e redirecionar” para entrar no painel admin.",
    ],
    redirectLabel: "Aguardar e ir para o Painel Admin",
    supportPrefix: "Olá! Sou administrador e preciso vincular meu perfil.",
  },
  gestor_pedagogico: {
    title: "Perfil de Gestor não vinculado",
    intro: "Seu cadastro de Gestor Pedagógico ainda não está ativo na escola.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao suporte informando o nome da sua escola e o código INEP.",
      "Aguarde a vinculação como Gestor.",
      "Toque em “Aguardar e entrar” para acessar o painel da escola.",
    ],
    redirectLabel: "Aguardar e ir para o painel do Gestor",
    supportPrefix: "Olá! Sou Gestor Pedagógico e preciso vincular meu perfil.",
  },
  chef_projeto_vida: {
    title: "Perfil de Chef da Sala de Vídeo não vinculado",
    intro: "Seu cadastro de Chef da Sala de Vídeo ainda não foi aprovado pelo administrador.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao administrador para aprovação do seu cargo.",
      "Aguarde a aprovação.",
      "Toque em “Aguardar e entrar” para acessar a escola.",
    ],
    redirectLabel: "Aguardar e entrar na escola",
    supportPrefix: "Olá! Sou Chef da Sala de Vídeo e preciso de aprovação.",
  },
  coord_pedagogico: {
    title: "Perfil de Coord. Pedagógico não vinculado",
    intro: "Sua conta como Coord. Pedagógico precisa ser aprovada pelo Gestor da escola.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao Gestor da sua escola junto com o nome da instituição.",
      "Aguarde a aprovação.",
      "Toque em “Aguardar e entrar” para acessar o sistema.",
    ],
    redirectLabel: "Aguardar e entrar",
    supportPrefix: "Olá! Sou Coord. Pedagógico e preciso vincular meu perfil.",
  },
  supervisor: {
    title: "Perfil de Corpo de Alunos não vinculado",
    intro: "Sua conta como Corpo de Alunos (C.A.) precisa ser aprovada pelo Gestor.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao Gestor da sua escola.",
      "Aguarde a aprovação.",
      "Toque em “Aguardar e entrar” para acessar.",
    ],
    redirectLabel: "Aguardar e entrar",
    supportPrefix: "Olá! Sou do Corpo de Alunos e preciso vincular meu perfil.",
  },
  secretario_escolar: {
    title: "Perfil de Assistente de Aluno não vinculado",
    intro: "Sua conta como Assistente de Aluno precisa ser aprovada pelo Gestor.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao Gestor da sua escola junto com o nome da instituição.",
      "Aguarde a aprovação.",
      "Toque em “Aguardar e entrar” para acessar.",
    ],
    redirectLabel: "Aguardar e entrar",
    supportPrefix: "Olá! Sou Assistente de Aluno e preciso vincular meu perfil.",
  },
  teacher: {
    title: "Perfil de Professor não vinculado",
    intro: "Seu cadastro como Professor(a) ainda não foi aprovado pelo Gestor da escola.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie ao Gestor da sua escola informando seu nome completo.",
      "Aguarde a aprovação do cadastro.",
      "Toque em “Aguardar e entrar” para acessar.",
    ],
    redirectLabel: "Aguardar e entrar",
    supportPrefix: "Olá! Sou Professor(a) e preciso vincular meu perfil.",
  },
  default: {
    title: "Perfil não encontrado",
    intro: "Sua conta de acesso existe, mas ainda não está vinculada a um perfil de escola.",
    steps: [
      "Copie o ID do usuário acima.",
      "Envie esse ID e seu e-mail ao suporte via WhatsApp.",
      "Aguarde o vínculo do perfil à sua escola.",
      "Toque em “Aguardar e entrar” para acessar automaticamente.",
    ],
    redirectLabel: "Aguardar e entrar",
    supportPrefix: "Olá! Preciso vincular meu perfil no app.",
  },
};

const REDIRECT_PATHS: Record<RoleKey, string> = {
  admin: "/admin",
  gestor_pedagogico: "/gestor",
  chef_projeto_vida: "/sectors",
  coord_pedagogico: "/sectors",
  supervisor: "/sectors",
  secretario_escolar: "/sectors",
  teacher: "/sectors",
  default: "/sectors",
};

// Strings comuns à tela (não dependem de role)
const ptCommon = {
  email: "E-mail",
  userId: "ID do usuário",
  copy: "Copiar",
  howToFix: "Como corrigir",
  waitingTitle: "Aguardando vínculo do perfil…",
  attempt: "Tentativa",
  checking: "(verificando…)",
  nextIn: "— próxima em 5s",
  stop: "Parar",
  contactSupport: "Falar com suporte (WhatsApp)",
  retry: "Tentar novamente",
  linkedToast: "Perfil vinculado! Redirecionando…",
  whatsappUserIdLabel: "ID do usuário",
  whatsappEmailLabel: "E-mail",
  // Status do profile
  statusTitle: "Status do seu perfil",
  statusIdle: "Ainda não verificamos. Toque em “Aguardar e entrar” para iniciar a verificação automática.",
  statusChecking: "Verificando no banco de dados…",
  statusPending: "Perfil ainda não criado. Aguardando o suporte vincular.",
  statusCreated: "Perfil criado! Redirecionando…",
  statusFailed: "Não foi possível verificar agora. Tentaremos de novo em 5s.",
  nextStepLabel: "Próximo passo",
  nextStepIdle: "Inicie a verificação automática.",
  nextStepPending: "Fale com o suporte pelo WhatsApp e mantenha esta tela aberta.",
  nextStepFailed: "Verifique sua conexão; vamos tentar de novo automaticamente.",
};

const dict: Record<Language, { roles: Record<RoleKey, RoleStrings>; common: typeof ptCommon }> = {
  pt: { roles: ptRoles, common: ptCommon },
  // Fallback até EN/ES serem traduzidos
  en: { roles: ptRoles, common: ptCommon },
  es: { roles: ptRoles, common: ptCommon },
};

export function getRoleConfig(role: RoleKey, language: Language = "pt"): RoleConfig {
  const lang = dict[language] ?? dict.pt;
  const strings = lang.roles[role] ?? lang.roles.default;
  return { ...strings, redirectPath: REDIRECT_PATHS[role] ?? REDIRECT_PATHS.default };
}

export function getCommonStrings(language: Language = "pt") {
  return (dict[language] ?? dict.pt).common;
}

export function buildSupportMessage(
  role: RoleKey,
  userId: string,
  email: string,
  language: Language = "pt",
): string {
  const { supportPrefix } = getRoleConfig(role, language);
  const c = getCommonStrings(language);
  return `${supportPrefix}\n${c.whatsappUserIdLabel}: ${userId}\n${c.whatsappEmailLabel}: ${email}`;
}
