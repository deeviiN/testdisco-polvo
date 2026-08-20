import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, RefreshCw, LinkIcon, Unlink, ShieldCheck, ShieldOff } from "lucide-react";

interface Props {
  userId: string;
}

type LogRow = {
  id: string;
  action: string;
  created_at: string;
  school_id: string | null;
  new_data: any;
  old_data: any;
};

const RELEVANT_ACTIONS = [
  "manager_approve_profile",
  "manager_reject_profile",
  "admin_unlink_self_profile",
  "admin_revoke_access",
  "admin_delete_user",
  "profile_approved",
  "profile_rejected",
  "profile_deleted",
  "role_granted",
  "role_revoked",
];

const ACTION_META: Record<string, { label: string; tone: string; Icon: typeof LinkIcon }> = {
  manager_approve_profile: { label: "Perfil aprovado", tone: "bg-accent/10 text-accent border-accent/20", Icon: ShieldCheck },
  manager_reject_profile: { label: "Perfil rejeitado", tone: "bg-destructive/10 text-destructive border-destructive/20", Icon: ShieldOff },
  admin_unlink_self_profile: { label: "Vínculo removido (auto)", tone: "bg-warning/10 text-warning border-warning/20", Icon: Unlink },
  admin_revoke_access: { label: "Acesso revogado", tone: "bg-destructive/10 text-destructive border-destructive/20", Icon: ShieldOff },
  admin_delete_user: { label: "Perfil excluído (admin)", tone: "bg-destructive/10 text-destructive border-destructive/20", Icon: Unlink },
  profile_approved: { label: "Perfil aprovado", tone: "bg-accent/10 text-accent border-accent/20", Icon: ShieldCheck },
  profile_rejected: { label: "Perfil rejeitado", tone: "bg-destructive/10 text-destructive border-destructive/20", Icon: ShieldOff },
  profile_deleted: { label: "Perfil removido", tone: "bg-warning/10 text-warning border-warning/20", Icon: Unlink },
  role_granted: { label: "Cargo concedido", tone: "bg-accent/10 text-accent border-accent/20", Icon: LinkIcon },
  role_revoked: { label: "Cargo revogado", tone: "bg-warning/10 text-warning border-warning/20", Icon: Unlink },
};

export function AdminLinkAuditCard({ userId }: Props) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    // Busca logs onde o admin é o ator OU o registro afeta o user_id do admin
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, created_at, school_id, new_data, old_data")
      .in("action", RELEVANT_ACTIONS)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data) {
      setLogs([]);
      setLoading(false);
      return;
    }

    const filtered = data.filter((row) => {
      const nd = (row.new_data as any) ?? {};
      const od = (row.old_data as any) ?? {};
      return nd.user_id === userId || od.user_id === userId;
    });

    setLogs(filtered);

    // Carrega nomes das escolas
    const schoolIds = Array.from(new Set(filtered.map((l) => l.school_id).filter(Boolean) as string[]));
    if (schoolIds.length) {
      const { data: schools } = await supabase
        .from("schools")
        .select("id, name")
        .in("id", schoolIds);
      const map: Record<string, string> = {};
      schools?.forEach((s) => { map[s.id] = s.name; });
      setSchoolNames(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <History className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Histórico de vínculos da sua conta</p>
              <p className="text-xs text-muted-foreground">Aprovações, remoções e mudanças de cargo</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={load} disabled={loading} aria-label="Recarregar">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum registro de vínculo encontrado para sua conta.
          </p>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {logs.map((log) => {
              const meta = ACTION_META[log.action] ?? { label: log.action, tone: "bg-muted text-muted-foreground border-border", Icon: History };
              const Icon = meta.Icon;
              const data = log.new_data ?? log.old_data ?? {};
              const role = data.role as string | undefined;
              const schoolName = log.school_id ? schoolNames[log.school_id] ?? "—" : null;
              return (
                <li key={log.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/30">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 border ${meta.tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                      {role && <span className="text-[11px] text-muted-foreground">{role}</span>}
                    </div>
                    {schoolName && (
                      <p className="text-xs text-foreground mt-0.5 break-words">{schoolName}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
