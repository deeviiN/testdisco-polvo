import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, KeyRound, Mail, ShieldCheck, ShieldOff, UserCheck, UserX, Eye, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import { ReasonConfirmDialog } from "./ReasonConfirmDialog";
import AuditTimeline from "./AuditTimeline";

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  "teacher", "coord_pedagogico", "supervisor", "gestor_pedagogico",
  "secretario_escolar", "chef_projeto_vida", "usuario_comunidade",
];

export default function UserDetailDrawer({ userId, open, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<null | { type: string; title: string; destructive?: boolean; run: (reason: string) => Promise<void> }>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_user_console", { _user_id: userId });
    if (error) toast.error(error.message);
    setData(data);
    setLoading(false);
  };

  useEffect(() => { if (open && userId) { setTempPwd(null); load(); } }, [open, userId]);

  if (!userId) return null;

  const profile = data?.profile;
  const auth = data?.auth;
  const school = data?.school;

  const callEdge = async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-user-details", {
      body: { user_id: userId, action, ...extra },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const runApproval = (approved: boolean) => setAction({
    type: approved ? "approve" : "reject",
    title: approved ? "Aprovar usuário" : "Reprovar usuário",
    destructive: !approved,
    run: async (reason) => {
      const { error } = await supabase.rpc("admin_set_user_approval", { _user_id: userId, _approved: approved, _reason: reason });
      if (error) throw new Error(error.message);
      toast.success("Atualizado");
      setAction(null); load();
    },
  });

  const runBlock = (blocked: boolean) => setAction({
    type: blocked ? "block" : "unblock",
    title: blocked ? "Bloquear acesso" : "Desbloquear acesso",
    destructive: blocked,
    run: async (reason) => {
      const { error } = await supabase.rpc("admin_set_user_blocked", { _user_id: userId, _blocked: blocked, _reason: reason });
      if (error) throw new Error(error.message);
      toast.success("Atualizado");
      setAction(null); load();
    },
  });

  const runRole = (role: string) => setAction({
    type: "role",
    title: `Alterar função para "${role}"`,
    run: async (reason) => {
      const { error } = await supabase.rpc("admin_set_user_role", { _user_id: userId, _role: role, _reason: reason });
      if (error) throw new Error(error.message);
      toast.success("Função alterada");
      setAction(null); load();
    },
  });

  const runResetPwd = () => setAction({
    type: "reset",
    title: "Enviar email de redefinição de senha",
    run: async (_reason) => {
      try {
        await callEdge("send_password_reset", { redirect_to: `${window.location.origin}/reset-password` });
        toast.success("Email de redefinição enviado");
        setAction(null);
      } catch (e: any) { toast.error(e.message); }
    },
  });

  const runTempPwd = () => setAction({
    type: "temp",
    title: "Gerar senha temporária",
    description: "Uma senha forte será gerada e exibida UMA ÚNICA VEZ. Ela não é guardada em banco.",
    destructive: true,
    run: async (_reason) => {
      try {
        const r = await callEdge("set_temp_password");
        setTempPwd(r.temp_password);
        toast.success("Senha temporária gerada");
        setAction(null);
      } catch (e: any) { toast.error(e.message); }
    },
  } as any);

  const openAsGestor = () => {
    if (!school?.id) return toast.error("Sem escola associada");
    try { sessionStorage.setItem("lovable:as_school", school.id); } catch {}
    window.location.href = "/sectors";
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="break-words">{profile?.full_name ?? "Usuário"}</SheetTitle>
            <SheetDescription className="break-words">
              {auth?.email} {profile?.role && <Badge variant="outline" className="ml-2">{profile.role}</Badge>}
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="mt-4 space-y-4">
              {tempPwd && (
                <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertCircle className="h-4 w-4" /> Senha temporária (exibida 1 única vez)
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 font-mono text-base flex-1 break-all">{tempPwd}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(tempPwd); toast.success("Copiado"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-amber-900 mt-2">Entregue ao usuário por canal seguro. Não é armazenada no sistema.</p>
                </div>
              )}

              <Tabs defaultValue="resumo">
                <TabsList className="w-full grid grid-cols-4">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="acoes">Ações</TabsTrigger>
                  <TabsTrigger value="agend">Agend.</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                </TabsList>

                <TabsContent value="resumo" className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <Info label="Status" value={profile?.is_approved ? "Aprovado" : "Pendente"} />
                    <Info label="Disciplina" value={profile?.discipline_status ?? "-"} />
                    <Info label="Escola" value={school?.name ?? "-"} />
                    <Info label="Telefone" value={profile?.phone ?? "-"} />
                    <Info label="Provider" value={(auth?.providers ?? []).join(", ") || "email"} />
                    <Info label="Email confirmado" value={auth?.email_confirmed_at ? "Sim" : "Não"} />
                    <Info label="Criado em" value={auth?.created_at ? new Date(auth.created_at).toLocaleString("pt-BR") : "-"} />
                    <Info label="Último login" value={auth?.last_sign_in_at ? new Date(auth.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"} />
                  </div>
                </TabsContent>

                <TabsContent value="acoes" className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {profile?.is_approved ? (
                      <Button variant="outline" onClick={() => runApproval(false)}><UserX className="h-4 w-4 mr-2" />Reprovar</Button>
                    ) : (
                      <Button onClick={() => runApproval(true)}><UserCheck className="h-4 w-4 mr-2" />Aprovar</Button>
                    )}
                    {profile?.discipline_status === "blocked_manager" ? (
                      <Button variant="outline" onClick={() => runBlock(false)}><ShieldCheck className="h-4 w-4 mr-2" />Desbloquear</Button>
                    ) : (
                      <Button variant="destructive" onClick={() => runBlock(true)}><ShieldOff className="h-4 w-4 mr-2" />Bloquear</Button>
                    )}
                    <Button variant="outline" onClick={runResetPwd}><Mail className="h-4 w-4 mr-2" />Reset por email</Button>
                    <Button variant="outline" onClick={runTempPwd}><KeyRound className="h-4 w-4 mr-2" />Senha temporária</Button>
                    {school?.id && (
                      <Button variant="outline" className="col-span-2" onClick={openAsGestor}>
                        <Eye className="h-4 w-4 mr-2" />Abrir escola como gestor
                      </Button>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <div className="text-xs font-semibold mb-1.5">Alterar função</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ROLE_OPTIONS.map(r => (
                        <Button key={r} size="sm" variant={profile?.role === r ? "default" : "outline"}
                          className="h-7 text-xs"
                          disabled={profile?.role === r}
                          onClick={() => runRole(r)}>{r}</Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="agend">
                  <ul className="space-y-1.5 text-xs">
                    {(data?.recent_bookings ?? []).map((b: any) => (
                      <li key={b.id} className="border rounded p-2">
                        <b>{b.booking_date}</b> · {b.start_time}-{b.end_time} · {b.sector} · <Badge variant="outline">{b.status}</Badge>
                        <div className="text-muted-foreground">{b.topic}</div>
                      </li>
                    ))}
                    {(data?.recent_bookings ?? []).length === 0 && <div className="text-center text-muted-foreground py-4">Sem agendamentos</div>}
                  </ul>
                </TabsContent>

                <TabsContent value="logs">
                  <AuditTimeline userId={userId} limit={50} compact />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ReasonConfirmDialog
        open={!!action}
        title={action?.title ?? ""}
        description={(action as any)?.description}
        destructive={action?.destructive}
        onCancel={() => setAction(null)}
        onConfirm={async (reason) => { await action?.run(reason); }}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded-md p-2 bg-card">
      <div className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm break-words">{value ?? "-"}</div>
    </div>
  );
}
