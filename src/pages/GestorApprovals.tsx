import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, UserCheck, UserX, Check, Loader2, Inbox, Phone, Search,
  Calendar, User as UserIcon, Briefcase, AlertTriangle, MessageCircle,
  Sparkles, Copy, Globe,
} from "lucide-react";
import GestorThemeShell, { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";
import { ALLOWED_ROLE_LABELS } from "@/lib/allowedRoles";

// Fonte única de rótulos: @/lib/allowedRoles (mesmos 11 setores do cadastro).
const ROLE_LABELS: Record<string, string> = { ...ALLOWED_ROLE_LABELS };

const REJECTION_PRESETS = [
  {
    label: "Cargo incorreto",
    text: "Prezado(a), seu cadastro foi rejeitado porque o cargo informado não corresponde à sua função registrada nesta unidade escolar. Conforme nossos registros funcionais e a lotação oficial vigente, você não exerce a função selecionada no ato do cadastro. Solicitamos que refaça o cadastro escolhendo corretamente o cargo que ocupa, ou que procure a Secretaria da escola para regularizar sua situação funcional antes de tentar novamente.",
  },
  {
    label: "Dados inconsistentes",
    text: "Prezado(a), identificamos inconsistências entre as informações fornecidas em seu cadastro (nome completo, telefone de contato e/ou cargo) e os dados oficiais que possuímos sobre os servidores desta unidade escolar. Para garantir a segurança e a integridade da plataforma, não podemos aprovar cadastros com divergências. Por favor, confira atentamente seus dados pessoais, refaça o cadastro com as informações corretas e, persistindo a dúvida, procure a gestão presencialmente para esclarecimentos.",
  },
  {
    label: "Perfil incompleto",
    text: "Prezado(a), seu cadastro foi rejeitado por estar com informações incompletas, abreviadas ou pouco claras, o que impossibilita sua correta identificação como integrante desta unidade escolar. Refaça o cadastro preenchendo todos os campos obrigatórios com atenção, utilizando seu nome completo conforme documento oficial, telefone pessoal ativo e o cargo exato que ocupa. Cadastros bem preenchidos são analisados e aprovados com agilidade.",
  },
  {
    label: "Não pertence à escola",
    text: "Prezado(a), seu cadastro foi rejeitado porque você não consta em nossos registros como servidor(a), professor(a) ou colaborador(a) vinculado(a) a esta unidade escolar. Esta plataforma é de uso restrito à equipe efetivamente lotada na instituição. Caso entenda tratar-se de um equívoco, dirija-se pessoalmente à Secretaria ou à Direção da escola para verificarmos sua situação funcional e providenciarmos a regularização do seu vínculo institucional.",
  },
  {
    label: "Cadastro duplicado",
    text: "Prezado(a), identificamos que já existe um cadastro ativo registrado em seu nome nesta unidade escolar. Para evitar duplicidade e possíveis conflitos de acesso à plataforma, este novo cadastro foi rejeitado. Caso tenha esquecido sua senha, utilize a opção 'Esqueci minha senha' na tela de login para recuperar o acesso à sua conta original. Se acredita que houve algum erro ou não reconhece o cadastro existente, procure imediatamente a gestão da escola para auxílio.",
  },
  {
    label: "Nome incompleto",
    text: "Prezado(a), seu cadastro foi rejeitado porque o nome informado está incompleto, abreviado ou contém apenas o primeiro nome, o que dificulta sua identificação oficial dentro da unidade escolar. Por questões de formalidade, segurança e emissão de documentos pelo sistema (como comunicados e relatórios), exigimos o nome completo conforme consta em seu RG ou CPF. Refaça o cadastro digitando seu nome integral, sem abreviações.",
  },
  {
    label: "Telefone inválido",
    text: "Prezado(a), seu cadastro foi rejeitado porque o número de telefone informado é inválido, está incompleto ou aparenta não ser de uso pessoal. O telefone é essencial para recuperação de senha, notificações de agendamento e contato direto da gestão em situações urgentes. Refaça o cadastro informando um número de celular ativo, com DDD correto, sob sua titularidade e de uso frequente.",
  },
  {
    label: "Vínculo encerrado",
    text: "Prezado(a), seu cadastro foi rejeitado porque, de acordo com nossos registros, seu vínculo funcional com esta unidade escolar foi encerrado (por exoneração, transferência, aposentadoria ou término de contrato). O acesso à plataforma é exclusivo de servidores em atividade na instituição. Caso discorde desta informação ou tenha sido recontratado(a)/relotado(a), procure a Secretaria da escola para apresentar a documentação comprobatória e regularizar seu status.",
  },
  {
    label: "Aguardando documentação",
    text: "Prezado(a), seu cadastro foi temporariamente rejeitado porque, antes da aprovação do acesso, precisamos validar presencialmente sua documentação funcional (portaria de nomeação, contrato, declaração de lotação ou crachá funcional). Esta é uma medida de segurança institucional para proteger os dados de toda a comunidade escolar. Compareça à gestão da escola portando seus documentos e, em seguida, refaça o cadastro para liberação do acesso.",
  },
  {
    label: "Escola incorreta",
    text: "Prezado(a), seu cadastro foi rejeitado porque você selecionou uma unidade escolar à qual não pertence funcionalmente. Cada cadastro deve ser realizado exclusivamente na escola onde o servidor está oficialmente lotado, pois os agendamentos e relatórios são vinculados àquela instituição específica. Refaça o cadastro selecionando, na busca por código INEP ou nome, a escola correta onde você efetivamente atua.",
  },
  {
    label: "Aluno (não permitido)",
    text: "Prezado(a), seu cadastro foi rejeitado porque esta plataforma de Agendamento de Ambiente Escolar é de uso exclusivo de servidores, professores, coordenadores, gestores e equipe pedagógica da unidade. Cadastros de alunos não são permitidos, uma vez que a reserva de espaços (quadras, salas, laboratórios) é uma atribuição funcional dos profissionais da educação. Caso precise utilizar algum ambiente, solicite ao seu professor ou ao Corpo de Alunos (C.A).",
  },
  {
    label: "Sem identificação",
    text: "Prezado(a), seu cadastro foi rejeitado porque, mesmo após análise dos dados informados, não foi possível identificá-lo(a) com segurança como integrante da equipe desta unidade escolar. Para sua proteção e da comunidade escolar, não aprovamos acessos sem prévia identificação. Solicitamos que compareça presencialmente à Secretaria ou à Gestão da escola, portando documento oficial com foto, para que possamos validar seu cadastro pessoalmente.",
  },
];

interface PendingProfile {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  intended_role: string | null;
  phone: string | null;
  gender: string | null;
  created_at: string;
  is_approved: boolean;
  rejection_reason: string | null;
}

type DialogState =
  | { kind: "closed" }
  | { kind: "approve"; profile: PendingProfile; asIntended: boolean }
  | { kind: "approve_choose"; profile: PendingProfile }
  | { kind: "reject"; profile: PendingProfile }
  | { kind: "rejected_done"; profile: PendingProfile; reason: string }
  | { kind: "approved_done"; profile: PendingProfile; approvedRole: string };

export default function GestorApprovals() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [list, setList] = useState<PendingProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [acting, setActing] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [reason, setReason] = useState("");
  const [approvalTemplateId, setApprovalTemplateId] = useState<string>("calorosa");
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [schoolName, setSchoolName] = useState<string>("");

  useEffect(() => {
    if (!profile?.school_id) return;
    supabase.from("schools").select("name").eq("id", profile.school_id).maybeSingle()
      .then(({ data }) => { if (data?.name) setSchoolName(data.name); });
  }, [profile?.school_id]);
  const [aiLanguages, setAiLanguages] = useState<string[]>(["pt"]);
  const [aiResult, setAiResult] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);

  // Guard: only managers
  useEffect(() => {
    if (loading) return;
    if (!profile) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!["gestor_pedagogico", "chef_projeto_vida"].includes(profile.role)) {
      navigate("/sectors", { replace: true });
    }
  }, [profile, loading, navigate]);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoadingData(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,user_id,full_name,role,intended_role,phone,gender,created_at,is_approved,rejection_reason")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar cadastros", { description: error.message });
      setLoadingData(false);
      return;
    }
    // Gestor só aprova não-gestores; cadastros de gestor vão para o admin global
    const filtered = (data ?? []).filter((p: any) => {
      // Cadastros já aprovados não aparecem na lista de pendências
      if (p.is_approved) return false;
      
      const effective = p.intended_role || p.role;
      return effective !== "gestor_pedagogico" && effective !== "admin";
    });
    setList(filtered as PendingProfile[]);
    setLoadingData(false);
  }, [profile?.school_id]);

  useEffect(() => { load(); }, [load]);

  const openApprove = (p: PendingProfile, asIntended: boolean) => {
    setReason("");
    setDialog({ kind: "approve", profile: p, asIntended });
  };

  const openApproveFlow = (p: PendingProfile) => {
    const intended = p.intended_role && p.intended_role !== p.role ? p.intended_role : null;
    setReason("");
    if (intended) {
      setDialog({ kind: "approve_choose", profile: p });
    } else {
      setDialog({ kind: "approve", profile: p, asIntended: false });
    }
  };

  const openReject = (p: PendingProfile) => {
    setReason(p.rejection_reason || "");
    setDialog({ kind: "reject", profile: p });
  };

  const decideLater = () => {
    toast.info("Cadastro mantido como pendente para decidir depois.");
    navigate(-1);
  };

  const closeDialog = () => {
    if (acting) return;
    setDialog({ kind: "closed" });
    setReason("");
  };

  const submitDecision = async () => {
    if (dialog.kind === "closed") return;
    const isReject = dialog.kind === "reject";
    if (isReject && reason.trim().length < 5) {
      toast.error("Descreva o motivo (mínimo 5 caracteres). O usuário verá esta justificativa.");
      return;
    }
    setActing(true);
    const tId = toast.loading(isReject ? "Rejeitando..." : "Aprovando...");
    const { error } = await supabase.rpc("manager_decide_profile", {
      _profile_id: dialog.profile.id,
      _decision: isReject ? "rejected" : "approved",
      _reason: reason.trim() || null,
      _approve_as_intended: dialog.kind === "approve" ? dialog.asIntended : false,
    });
    if (error) {
      toast.error(isReject ? "Erro ao rejeitar" : "Erro ao aprovar", {
        id: tId, description: error.message,
      });
    } else {
      toast.success(
        isReject ? "Cadastro rejeitado." : "Cadastro aprovado!",
        { id: tId },
      );
      if (isReject) {
        setDialog({ kind: "rejected_done", profile: dialog.profile, reason: reason.trim() });
      } else {
        // Determina o cargo final aprovado para personalizar a mensagem
        const finalRole = dialog.kind === "approve" && dialog.asIntended && dialog.profile.intended_role
          ? dialog.profile.intended_role
          : (dialog.profile.role || "professor");
        setApprovalTemplateId("calorosa");
        setDialog({ kind: "approved_done", profile: dialog.profile, approvedRole: finalRole });
        setReason("");
      }
      await load();
    }
    setActing(false);
  };

  // Rótulos vêm de @/lib/allowedRoles (definidos no topo do arquivo).

  const buildRejectionWhatsApp = (p: PendingProfile, reasonText: string) => {
    const greeting = `Olá, ${p.full_name.split(" ")[0]}.`;
    const intro = `Sou ${profile?.full_name || "a gestão"} da escola e estou em contato sobre o seu cadastro no app *Agendamento de Ambiente Escolar*.`;
    const decision = `Infelizmente, *seu cadastro foi rejeitado* pelo seguinte motivo:`;
    const body = `\n\n"${reasonText}"\n\n`;
    const closing = `Se desejar, corrija as informações e refaça o cadastro no app. Estou à disposição para esclarecimentos.`;
    return [greeting, intro, decision, body + closing].join("\n");
  };

  // Variações de mensagem de boas-vindas (gestor escolhe o tom)
  const APPROVAL_TEMPLATES: { id: string; label: string; build: (firstName: string, roleLabel: string, gestorName: string) => string }[] = [
    {
      id: "formal",
      label: "Formal",
      build: (firstName, roleLabel, gestorName) =>
        [
          `Prezado(a) ${firstName},`,
          ``,
          `Informamos que *seu cadastro foi aprovado* no app *Agendamento de Ambiente Escolar* na função de *${roleLabel}*.`,
          ``,
          `Em nome da gestão, damos as boas-vindas e desejamos uma excelente jornada conosco.`,
          ``,
          `Atenciosamente,`,
          `${gestorName}`,
        ].join("\n"),
    },
    {
      id: "calorosa",
      label: "Calorosa",
      build: (firstName, roleLabel, gestorName) =>
        [
          `Olá, ${firstName}! 🎉`,
          `Sou ${gestorName} e tenho uma ótima notícia.`,
          ``,
          `*Seu cadastro foi aprovado* como *${roleLabel}* no app *Agendamento de Ambiente Escolar*.`,
          ``,
          `Seja muito bem-vindo(a) à nossa equipe! Parabéns pela conclusão do cadastro. 👏`,
          ``,
          `Você já pode acessar o app e começar a fazer seus agendamentos. Qualquer dúvida, estou à disposição.`,
        ].join("\n"),
    },
    {
      id: "curta",
      label: "Curta e direta",
      build: (firstName, roleLabel) =>
        [
          `Oi, ${firstName}! ✅`,
          `Cadastro aprovado como *${roleLabel}*. Já pode usar o app *Agendamento de Ambiente Escolar* normalmente.`,
          `Bem-vindo(a)! 👋`,
        ].join("\n"),
    },
    {
      id: "motivacional",
      label: "Motivacional",
      build: (firstName, roleLabel, gestorName) =>
        [
          `${firstName}, é com alegria que te recebemos! 🌟`,
          ``,
          `Seu cadastro como *${roleLabel}* foi *aprovado* no app *Agendamento de Ambiente Escolar*.`,
          ``,
          `Que essa nova etapa seja repleta de boas aulas, parcerias e conquistas. Conte com a gestão sempre que precisar.`,
          ``,
          `— ${gestorName}`,
        ].join("\n"),
    },
    {
      id: "instrucional",
      label: "Com instruções",
      build: (firstName, roleLabel, gestorName) =>
        [
          `Olá, ${firstName}! 👋`,
          ``,
          `Sou ${gestorName}. *Seu cadastro foi aprovado* como *${roleLabel}* no app *Agendamento de Ambiente Escolar*.`,
          ``,
          `*Próximos passos:*`,
          `1️⃣ Abra o app e faça login;`,
          `2️⃣ Escolha o setor (Quadra, Pátio, Informática ou Sala);`,
          `3️⃣ Selecione data, horário e confirme o agendamento.`,
          ``,
          `Bem-vindo(a) à equipe! Qualquer dúvida, é só chamar. 😉`,
        ].join("\n"),
    },
  ];

  const buildApprovalWhatsApp = (p: PendingProfile, approvedRole: string, templateId: string) => {
    const firstName = p.full_name.split(" ")[0];
    const roleLabel = ROLE_LABELS[approvedRole] || "membro da equipe";
    const gestorName = profile?.full_name || "a gestão";
    const tpl = APPROVAL_TEMPLATES.find((t) => t.id === templateId) || APPROVAL_TEMPLATES[1];
    return tpl.build(firstName, roleLabel, gestorName);
  };

  const openWhatsAppRejection = (p: PendingProfile, reasonText: string) => {
    const phoneDigits = (p.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      toast.error("Telefone do usuário inválido ou ausente — não é possível abrir o WhatsApp.");
      return;
    }
    const withCountry = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;
    const text = encodeURIComponent(buildRejectionWhatsApp(p, reasonText));
    window.open(`https://wa.me/${withCountry}?text=${text}`, "_blank");
  };

  const openWhatsAppApproval = (p: PendingProfile, approvedRole: string, templateId: string) => {
    const phoneDigits = (p.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      toast.error("Telefone do usuário inválido ou ausente — não é possível abrir o WhatsApp.");
      return;
    }
    const withCountry = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;
    const text = encodeURIComponent(buildApprovalWhatsApp(p, approvedRole, templateId));
    window.open(`https://wa.me/${withCountry}?text=${text}`, "_blank");
  };

  const generateAICommunique = async () => {
    if (!aiTopic.trim()) {
      toast.error("Informe um assunto ou tópico para o comunicado.");
      return;
    }
    if (aiLanguages.length === 0) {
      toast.error("Selecione pelo menos um idioma.");
      return;
    }

    setGeneratingAI(true);
    setAiResult("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-marketing-communique", {
        body: {
          topic: aiTopic,
          languages: aiLanguages,
          context: `Escola: ${profile?.school_id || "Unidade Escolar"}. Gestor: ${profile?.full_name || "Direção"}.`,
        },
      });

      if (error) throw error;
      setAiResult(data.result);
    } catch (error: any) {
      toast.error("Erro ao gerar comunicado por IA", { description: error.message });
    } finally {
      setGeneratingAI(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const toggleLanguage = (lang: string) => {
    setAiLanguages(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const filtered = list.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q) ||
      (ROLE_LABELS[p.intended_role || p.role] || "").toLowerCase().includes(q)
    );
  });

  return (
    <GestorThemeShell enabled>
    <div className="pb-6 pt-16">
      <div className="max-w-4xl w-full mx-auto px-3 sm:px-6 pb-2">
        <GestorPremiumHeader
          title={schoolName || "—"}
          subtitle="Pessoas para aprovar"
          right={
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500 font-bold">
                {list.length}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAIModalOpen(true)}
                className="h-8 gap-2 bg-amber-500/20 border-amber-400/40 hover:bg-amber-500/30 text-amber-100"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Comunicado IA</span>
              </Button>
            </div>
          }
        />
      </div>

      <div className="px-3 pt-3 max-w-4xl mx-auto space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou cargo..."
            className="pl-9 h-10"
          />
        </div>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-8 flex flex-col items-center text-center gap-2">
              <Inbox className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-medium">
                {list.length === 0 ? "Nenhum cadastro pendente" : "Nada encontrado"}
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {list.length === 0
                  ? "Quando alguém se cadastrar nesta escola, aparecerá aqui para sua aprovação."
                  : "Tente outro termo de busca."}
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((p) => {
            const intended = p.intended_role && p.intended_role !== p.role ? p.intended_role : null;
            const isRejected = !!p.rejection_reason;

            return (
              <Card key={p.id} className={`overflow-hidden border border-white/10 bg-gradient-to-br from-card to-card/80 shadow-xl backdrop-blur-sm ${isRejected ? 'opacity-95 border-destructive/25 bg-gradient-to-br from-destructive/5 to-destructive/10' : ''}`}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${isRejected ? 'bg-destructive/15' : 'bg-primary/15'}`}>
                      {isRejected ? <UserX className="h-7 w-7 text-destructive" /> : <UserIcon className="h-7 w-7 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-lg font-bold break-words leading-tight">{p.full_name}</p>
                        {isRejected && (
                          <Badge variant="destructive" className="text-[10px] px-2 h-5 py-0 font-bold uppercase tracking-wider">
                            Rejeitado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <Briefcase className="h-4 w-4" /> Pretende ser:{" "}
                        <span className="font-bold text-foreground">
                          {ROLE_LABELS[intended || p.role] || intended || p.role}
                        </span>
                      </p>
                      {p.phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Phone className="h-4 w-4" /> {p.phone}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        Enviado em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </p>

                      {isRejected && p.rejection_reason && (
                        <div className="mt-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                          <p className="text-[10px] font-bold text-destructive uppercase tracking-tighter">Motivo da rejeição:</p>
                          <p className="text-sm text-destructive-foreground line-clamp-2 italic">"{p.rejection_reason}"</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 grid-cols-3">
                    <Button
                      onClick={decideLater}
                      className="h-12 rounded-xl px-1 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 border-0 shadow-lg shadow-amber-500/20"
                      title="Fechar sem aprovar nem rejeitar agora"
                    >
                      Decidir depois
                    </Button>
                    <Button
                      onClick={() => openReject(p)}
                      className="h-12 rounded-xl gap-1 px-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 border-0 shadow-lg shadow-red-600/20"
                    >
                      <UserX className="h-4 w-4" />
                      {isRejected ? "Alterar Motivo" : "Rejeitar"}
                    </Button>
                    <Button
                      onClick={() => openApproveFlow(p)}
                      className={`h-12 rounded-xl gap-1 px-1 text-xs font-bold text-white border-0 shadow-lg ${isRejected ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-green-600 hover:bg-green-700 shadow-green-600/20'}`}
                    >
                      <Check className="h-4 w-4" />
                      {isRejected ? "Revogar & Aprovar" : "Aprovar"}
                    </Button>
                  </div>

                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog de decisão (escolher cargo, aprovar ou rejeitar) */}
      <Dialog open={dialog.kind !== "closed"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-lg max-w-[95vw] p-0 overflow-hidden border border-white/15 bg-gradient-to-b from-[hsl(220,45%,18%)] to-[hsl(220,50%,12%)] shadow-2xl">
          <div className="p-6 space-y-5">
          {dialog.kind === "approve_choose" && (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-primary" />
                  </div>
                  Aprovar como qual cargo?
                </DialogTitle>
                <DialogDescription className="text-base leading-relaxed break-words">
                  <span className="font-bold text-foreground text-lg">{dialog.profile.full_name}</span> solicitou cadastro como{" "}
                  <span className="font-bold text-foreground">
                    {ROLE_LABELS[dialog.profile.intended_role!] || dialog.profile.intended_role}
                  </span>. Escolha em qual cargo deseja aprovar:
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <Button
                  onClick={() => setDialog({ kind: "approve", profile: dialog.profile, asIntended: true })}
                  className="w-full h-16 rounded-2xl gap-3 bg-gradient-to-r from-primary to-primary/80 font-bold justify-start px-5 shadow-lg shadow-primary/20"
                >
                  <Check className="h-5 w-5 shrink-0" />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-xs opacity-90">Aprovar como solicitado</span>
                    <span className="text-base break-words text-left">
                      {ROLE_LABELS[dialog.profile.intended_role!] || dialog.profile.intended_role}
                    </span>
                  </div>
                </Button>
                <Button
                  onClick={() => setDialog({ kind: "approve", profile: dialog.profile, asIntended: false })}
                  variant="outline"
                  className="w-full h-16 rounded-2xl gap-3 justify-start px-5 border-white/20 hover:bg-white/5"
                >
                  <Check className="h-5 w-5 shrink-0" />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-xs text-muted-foreground">Aprovar somente como</span>
                    <span className="text-base font-semibold">Professor(a)</span>
                  </div>
                </Button>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={closeDialog} className="w-full h-12 text-base" title="Fechar sem decidir agora — fica pendente">
                  Fechar (decidir depois)
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog.kind === "rejected_done" && (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
                    <UserX className="h-5 w-5 text-destructive" />
                  </div>
                  Cadastro rejeitado
                </DialogTitle>
                <DialogDescription className="text-base leading-relaxed break-words">
                  <span className="font-bold text-foreground text-lg">{dialog.profile.full_name}</span> foi rejeitado(a) com sucesso.
                  Para garantir que a pessoa receba a justificativa imediatamente, envie a mensagem pelo WhatsApp.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                  Justificativa registrada
                </p>
                <p className="text-base whitespace-pre-wrap break-words leading-relaxed">{dialog.reason}</p>
              </div>

              {dialog.profile.phone ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone do usuário: <span className="font-bold text-foreground">{dialog.profile.phone}</span>
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>Este usuário não cadastrou telefone. A mensagem ficará disponível apenas no app, ao tentar entrar.</span>
                </div>
              )}

              <DialogFooter className="gap-3 sm:gap-3">
                <Button variant="outline" onClick={closeDialog} className="flex-1 h-12 text-base">
                  Fechar
                </Button>
                <Button
                  onClick={() => openWhatsAppRejection(dialog.profile, dialog.reason)}
                  disabled={!dialog.profile.phone}
                  style={{ backgroundColor: "hsl(142, 70%, 40%)", color: "white" }}
                  className="flex-1 h-12 hover:opacity-90 font-bold gap-2 text-base shadow-lg"
                >
                  <MessageCircle className="h-5 w-5" />
                  Enviar WhatsApp
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog.kind === "approved_done" && (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-emerald-400" />
                  </div>
                  Cadastro aprovado!
                </DialogTitle>
                <DialogDescription className="text-base leading-relaxed break-words">
                  <span className="font-bold text-foreground text-lg">{dialog.profile.full_name}</span> foi aprovado(a) com sucesso como{" "}
                  <span className="font-bold text-foreground">
                    {ROLE_LABELS[dialog.approvedRole] || dialog.approvedRole}
                  </span>
                  . Envie uma mensagem automática de boas-vindas pelo WhatsApp.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Escolha o tom da mensagem
                </p>
                <div className="flex flex-wrap gap-2">
                  {APPROVAL_TEMPLATES.map((tpl) => {
                    const active = approvalTemplateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setApprovalTemplateId(tpl.id)}
                        className={`text-sm font-bold px-4 py-2 rounded-full border transition-all ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]"
                            : "bg-white/5 text-foreground border-white/15 hover:bg-white/10"
                        }`}
                      >
                        {tpl.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2 max-h-56 overflow-y-auto">
                <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground sticky top-0 bg-[hsl(220,50%,12%)]/90 backdrop-blur-sm -mx-4 -mt-4 px-4 py-3">
                  Prévia da mensagem
                </p>
                <p className="text-base whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                  {buildApprovalWhatsApp(dialog.profile, dialog.approvedRole, approvalTemplateId)}
                </p>
              </div>

              {dialog.profile.phone ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone do usuário: <span className="font-bold text-foreground">{dialog.profile.phone}</span>
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>Este usuário não cadastrou telefone — não é possível enviar a mensagem por WhatsApp.</span>
                </div>
              )}

              <DialogFooter className="gap-3 sm:gap-3">
                <Button variant="outline" onClick={closeDialog} className="flex-1 h-12 text-base">
                  Fechar
                </Button>
                <Button
                  onClick={() => openWhatsAppApproval(dialog.profile, dialog.approvedRole, approvalTemplateId)}
                  disabled={!dialog.profile.phone}
                  style={{ backgroundColor: "hsl(142, 70%, 40%)", color: "white" }}
                  className="flex-1 h-12 hover:opacity-90 font-bold gap-2 text-base shadow-lg"
                >
                  <MessageCircle className="h-5 w-5" />
                  Enviar boas-vindas
                </Button>
              </DialogFooter>
            </>
          )}

          {(dialog.kind === "approve" || dialog.kind === "reject") && (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  {dialog.kind === "reject" ? (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                      Rejeitar cadastro
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                        <UserCheck className="h-5 w-5 text-primary" />
                      </div>
                      Aprovar cadastro
                    </>
                  )}
                </DialogTitle>
                <DialogDescription className="text-base leading-relaxed break-words">
                  {dialog.kind === "reject" ? (
                    <>
                      Tem certeza que deseja rejeitar o cadastro de <span className="font-bold text-foreground text-lg">{dialog.profile.full_name}</span>?
                      Informe o motivo abaixo. O usuário verá esta justificativa ao tentar entrar.
                    </>
                  ) : (
                    <>
                      Está certo que é essa pessoa mesmo? Confirma aprovar <span className="font-bold text-foreground text-lg">{dialog.profile.full_name}</span> como{" "}
                      <span className="font-bold text-foreground">
                        {dialog.asIntended && dialog.profile.intended_role
                          ? ROLE_LABELS[dialog.profile.intended_role] || dialog.profile.intended_role
                          : ROLE_LABELS["teacher"]}
                      </span>?
                      Você ainda pode fechar e decidir depois.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {dialog.kind === "reject" ? "Motivo (obrigatório)" : "Mensagem (opcional)"}
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    dialog.kind === "reject"
                      ? "Explique por que este cadastro foi rejeitado. Esta mensagem será exibida ao usuário."
                      : "Mensagem de boas-vindas (opcional)"
                  }
                  maxLength={500}
                  className="min-h-[120px] text-base rounded-xl border-white/15 bg-white/5"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{reason.length}/500</span>
                  {dialog.kind === "reject" && reason.trim().length > 0 && reason.trim().length < 5 && (
                    <span className="text-destructive font-semibold">Mínimo 5 caracteres</span>
                  )}
                </div>

                {dialog.kind === "reject" && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                      Sugestões rápidas
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {REJECTION_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setReason(preset.text)}
                          className="text-xs rounded-full bg-white/5 hover:bg-white/10 px-3 py-1.5 text-foreground/90 border border-white/15 font-semibold transition-colors"
                          title={preset.text}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-3 sm:gap-3">
                <Button variant="outline" onClick={closeDialog} disabled={acting} className="flex-1 h-12 text-base" title="Fechar sem decidir agora — fica pendente">
                  Fechar (decidir depois)
                </Button>
                <Button
                  onClick={submitDecision}
                  disabled={acting || (dialog.kind === "reject" && reason.trim().length < 5)}
                  className={
                    dialog.kind === "reject"
                      ? "flex-1 h-12 text-base bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20"
                      : "flex-1 h-12 text-base bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                  }
                >
                  {acting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : dialog.kind === "reject" ? (
                    <>
                      <UserX className="h-5 w-5" /> Sim, rejeitar
                    </>
                  ) : (
                    <>
                      <Check className="h-5 w-5" /> Sim, aprovar
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAIModalOpen} onOpenChange={setIsAIModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl bg-[hsl(222,65%,10%)] border-amber-400/20 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              Gerador de Comunicado por IA
            </DialogTitle>
            <DialogDescription>
              Crie comunicados profissionais e traduza-os automaticamente para outros idiomas para divulgação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assunto ou Tópico Principal
              </label>
              <Input 
                placeholder="Ex: Novos professores aprovados, Reunião pedagógica, Divulgação do app..."
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                className="bg-muted/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Idiomas (selecione um ou mais)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: "pt", label: "Gerar em Português", icon: "🇧🇷" },
                  { id: "en", label: "Gerar em Inglês", icon: "🇺🇸" },
                  { id: "es", label: "Gerar em Espanhol", icon: "🇪🇸" }
                ].map(lang => (
                  <Button
                    key={lang.id}
                    variant={aiLanguages.includes(lang.id) ? "default" : "outline"}
                    onClick={() => {
                      setAiLanguages([lang.id]);
                      // Se já houver um tópico, gera automaticamente para facilitar
                      if (aiTopic.trim()) {
                        setTimeout(() => generateAICommunique(), 100);
                      }
                    }}
                    className="gap-2 h-12 rounded-xl font-bold border-primary/20"
                  >
                    <span>{lang.icon}</span>
                    {lang.label}
                  </Button>
                ))}
              </div>
              <div className="pt-2">
                <Button
                  variant={aiLanguages.length === 3 ? "default" : "outline"}
                  onClick={() => {
                    setAiLanguages(["pt", "en", "es"]);
                    if (aiTopic.trim()) {
                      setTimeout(() => generateAICommunique(), 100);
                    }
                  }}
                  className="w-full gap-2 h-12 rounded-xl font-bold border-amber-400/30"
                >
                  <Globe className="h-4 w-4" />
                  Gerar nos 3 idiomas juntos
                </Button>
              </div>
            </div>

            {aiResult && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Resultado Gerado
                  </label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => copyToClipboard(aiResult)}
                    className="h-7 gap-1 text-[10px]"
                  >
                    <Copy className="h-3 w-3" /> Copiar Texto
                  </Button>
                </div>
                <div className="p-4 rounded-lg bg-black/40 border border-white/5 text-sm whitespace-pre-wrap font-mono leading-relaxed max-h-[600px] overflow-y-auto custom-scrollbar">
                  {aiResult}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsAIModalOpen(false)} className="flex-1 sm:flex-none">
              Fechar
            </Button>
            <Button 
              onClick={generateAICommunique} 
              disabled={generatingAI || !aiTopic.trim() || aiLanguages.length === 0}
              className="flex-1 sm:flex-none gap-2"
            >
              {generatingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {aiResult ? "Gerar Novamente" : "Gerar Comunicado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </GestorThemeShell>
  );
}
