import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Clock, Filter, ShieldAlert } from "lucide-react";

interface Props {
  schoolId?: string | null;
  userId?: string | null;
  limit?: number;
  compact?: boolean;
}

type Row = {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  performed_by_name: string | null;
  school_name: string | null;
  new_data: any;
  created_at: string;
};

export default function AuditTimeline({ schoolId = null, userId = null, limit = 100, compact }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDenied(false);
    supabase.rpc("admin_list_audit_logs", {
      _school_id: schoolId,
      _user_id: userId,
      _action: null,
      _table_name: null,
      _from: null,
      _to: null,
      _limit: limit,
      _offset: 0,
    }).then(({ data, error }) => {
      if (error && /permission denied/i.test(error.message)) {
        setDenied(true);
        setRows([]);
      } else {
        setRows((data ?? []) as Row[]);
      }
      setLoading(false);
    });
  }, [schoolId, userId, limit]);

  const filtered = filter
    ? rows.filter(r => r.action.includes(filter) || (r.table_name || "").includes(filter))
    : rows;

  if (loading) return <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando...</div>;

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2 text-destructive">
        <ShieldAlert className="h-5 w-5" />
        <span className="text-sm font-medium">Acesso negado.</span>
        <span className="text-xs text-muted-foreground">Você não tem permissão para visualizar os registros de auditoria.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por ação ou tabela..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8"
          />
        </div>
      )}
      {filtered.length === 0 && <div className="text-center text-sm text-muted-foreground py-6">Sem registros.</div>}
      <ul className="space-y-1.5">
        {filtered.map(r => (
          <li key={r.id} className="border rounded-md p-2 bg-card hover:bg-accent/30 transition-colors text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">{r.action}</Badge>
                <span className="text-muted-foreground">{r.table_name}</span>
              </div>
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {r.performed_by_name && <span>por <b className="text-foreground">{r.performed_by_name}</b> · </span>}
              {r.school_name && <span>{r.school_name}</span>}
              {r.new_data?.reason && <span className="block italic mt-0.5">"{r.new_data.reason}"</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
