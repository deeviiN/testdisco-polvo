import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Loader2, Search, Wrench, Crown } from "lucide-react";
import { toast } from "sonner";
import AuditTimeline from "@/components/admin/AuditTimeline";
import UserDetailDrawer from "@/components/admin/UserDetailDrawer";
import { ReasonConfirmDialog } from "@/components/admin/ReasonConfirmDialog";

export default function AdminConsoleSchool() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const [school, setSchool] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [roleF, setRoleF] = useState("");
  const [approvedF, setApprovedF] = useState<string>("all");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixStatus, setFixStatus] = useState("active");
  const [fixDate, setFixDate] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    supabase.from("schools").select("*").eq("id", schoolId).maybeSingle()
      .then(({ data }) => setSchool(data));
  }, [schoolId]);

  const loadUsers = async () => {
    if (!schoolId) return;
    setLoadingUsers(true);
    const { data } = await supabase.rpc("admin_list_users_with_auth", {
      _school_id: schoolId,
      _search: search || null,
      _role: roleF || null,
      _approved: approvedF === "all" ? null : approvedF === "yes",
      _limit: 200,
      _offset: 0,
    });
    setUsers((data ?? []) as any[]);
    setLoadingUsers(false);
  };

  useEffect(() => { const t = setTimeout(loadUsers, 200); return () => clearTimeout(t); }, [schoolId, search, roleF, approvedF]);

  const accessAsGestor = () => {
    if (!schoolId) return;
    try { sessionStorage.setItem("lovable:as_school", schoolId); } catch {}
    window.location.href = "/sectors";
  };

  if (!school) return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const gestores = users.filter(u => ["gestor_pedagogico","chef_projeto_vida"].includes(u.role));
  const others = users.filter(u => !["gestor_pedagogico","chef_projeto_vida"].includes(u.role));

  return (
    <div className="min-h-dvh bg-background p-3 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/console")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
          </Button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold break-words">{school.name}</h1>
            <div className="text-xs text-muted-foreground">{school.inep_code ?? "—"} · {school.state}/{school.city} · {school.network}</div>
          </div>
        </div>
        <Button variant="outline" onClick={accessAsGestor}>
          <Eye className="h-4 w-4 mr-2" /> Acessar como gestor
        </Button>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="gestores">Gestores ({gestores.length})</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários ({others.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="reparo">Reparo</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <Card><CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info label="Status" value={school.subscription_status} />
            <Info label="Plano" value={school.payment_plan ?? "—"} />
            <Info label="Fim assinatura" value={school.subscription_end_date ?? "—"} />
            <Info label="Carência" value={`${school.grace_period_days}d`} />
            <Info label="Total usuários" value={users.length} />
            <Info label="Gestores" value={gestores.length} />
            <Info label="Ativa" value={school.is_active ? "Sim" : "Não"} />
            <Info label="Criada" value={new Date(school.created_at).toLocaleDateString("pt-BR")} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="gestores">
          <UsersTable users={gestores} loading={loadingUsers} onOpen={setOpenUserId} highlight />
        </TabsContent>

        <TabsContent value="usuarios">
          <Card><CardContent className="p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9" placeholder="Nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Input className="h-9 w-[160px]" placeholder="Função" value={roleF} onChange={(e) => setRoleF(e.target.value)} />
              <select className="h-9 border rounded px-2 text-sm bg-background" value={approvedF} onChange={(e) => setApprovedF(e.target.value)}>
                <option value="all">Todos</option><option value="yes">Aprovados</option><option value="no">Pendentes</option>
              </select>
            </div>
            <UsersTable users={others} loading={loadingUsers} onOpen={setOpenUserId} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card><CardContent className="p-3"><AuditTimeline schoolId={schoolId} limit={200} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="reparo">
          <Card><CardContent className="p-4 space-y-3">
            <h3 className="font-bold flex items-center gap-2"><Wrench className="h-4 w-4" /> Ações de reparo</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setFixStatus(school.subscription_status); setFixDate(school.subscription_end_date ?? ""); setFixOpen(true); }}>
                Corrigir status/data da assinatura
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <UserDetailDrawer userId={openUserId} open={!!openUserId} onClose={() => { setOpenUserId(null); loadUsers(); }} />

      <ReasonConfirmDialog
        open={fixOpen}
        title="Corrigir assinatura"
        description={`Status: ${fixStatus} · Fim: ${fixDate || "(sem alteração)"}`}
        onCancel={() => setFixOpen(false)}
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc("admin_fix_school_subscription", {
            _school_id: schoolId, _status: fixStatus, _end_date: fixDate || null, _reason: reason,
          });
          if (error) { toast.error(error.message); return; }
          toast.success("Assinatura atualizada");
          setFixOpen(false);
          const { data } = await supabase.from("schools").select("*").eq("id", schoolId!).maybeSingle();
          setSchool(data);
        }}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded p-2 bg-card">
      <div className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</div>
      <div className="font-medium break-words">{value ?? "—"}</div>
    </div>
  );
}

function UsersTable({ users, loading, onOpen, highlight }: { users: any[]; loading: boolean; onOpen: (id: string) => void; highlight?: boolean }) {
  if (loading) return <div className="py-8 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>;
  if (users.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground border-b">
          <tr>
            <th className="text-left py-1.5">Nome</th>
            <th className="text-left">Função</th>
            <th className="text-left">Email</th>
            <th className="text-center">Status</th>
            <th className="text-left">Último login</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.user_id} className={`border-b hover:bg-accent/40 cursor-pointer ${highlight ? "bg-amber-50/30" : ""}`} onClick={() => onOpen(u.user_id)}>
              <td className="py-1.5 font-medium break-words flex items-center gap-1">
                {highlight && <Crown className="h-3 w-3 text-amber-500" />}{u.full_name}
              </td>
              <td className="text-xs">{u.role}</td>
              <td className="text-xs break-all">{u.email ?? "—"}</td>
              <td className="text-center">
                {u.is_approved ? <Badge variant="outline" className="text-green-700 border-green-300">Aprovado</Badge> : <Badge variant="destructive">Pendente</Badge>}
                {u.discipline_status === "blocked_manager" && <Badge variant="destructive" className="ml-1">Bloq.</Badge>}
              </td>
              <td className="text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("pt-BR") : "Nunca"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
