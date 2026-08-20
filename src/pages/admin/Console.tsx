import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Loader2, ChevronRight, Users, Crown, AlertTriangle, CheckCircle, Activity, CreditCard, ShieldAlert, Eye } from "lucide-react";
import AuditTimeline from "@/components/admin/AuditTimeline";

type Kpis = {
  schools_total: number; schools_active: number; schools_blocked: number; schools_grace: number;
  users_total: number; users_pending: number; gestores_total: number;
  errors_24h: number; payments_pending: number;
};

type Row = {
  id: string; name: string; inep_code: string | null; city: string; state: string; network: string;
  is_active: boolean; subscription_status: string; subscription_end_date: string | null;
  days_left: number | null; users_count: number; gestores_count: number; pending_count: number;
  total_count: number;
};

export default function AdminConsole() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    const read = () => {
      try { setImpersonating(!!sessionStorage.getItem("lovable:as_school")); } catch {}
    };
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, []);

  const loadKpis = async () => {
    const { ensureSessionOrRedirect, redirectOnAuthError } = await import("@/lib/authGuard");
    if (!(await ensureSessionOrRedirect())) return;
    const { data, error } = await supabase.rpc("admin_global_kpis");
    if (error) {
      await redirectOnAuthError(error);
      return;
    }
    setKpis(data as any);
  };

  const loadRows = async () => {
    setLoading(true);
    const { ensureSessionOrRedirect, redirectOnAuthError } = await import("@/lib/authGuard");
    if (!(await ensureSessionOrRedirect())) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("admin_list_schools_console", {
      _state: state || null,
      _city: null,
      _network: null,
      _status: status || null,
      _search: search || null,
      _limit: 100,
      _offset: 0,
    });
    if (error) {
      await redirectOnAuthError(error);
      console.error(error);
    }
    setRows((data ?? []) as Row[]);
    setTotal((data?.[0] as any)?.total_count ?? 0);
    setLoading(false);
  };

  useEffect(() => { loadKpis(); }, []);
  useEffect(() => { const t = setTimeout(loadRows, 200); return () => clearTimeout(t); }, [search, state, status]);

  return (
    <div className="min-h-dvh bg-background p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-lg sm:text-2xl font-bold break-words">Console do Administrador Global</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <Kpi icon={CheckCircle} label="Escolas ativas" value={kpis?.schools_active} color="text-green-600" />
        <Kpi icon={ShieldAlert} label="Bloqueadas" value={kpis?.schools_blocked} color="text-red-600" />
        <Kpi icon={AlertTriangle} label="Em carência" value={kpis?.schools_grace} color="text-amber-600" />
        <Kpi icon={Users} label="Usuários" value={kpis?.users_total} />
        <Kpi icon={Users} label="Pendentes" value={kpis?.users_pending} color="text-amber-600" />
        <Kpi icon={Crown} label="Gestores" value={kpis?.gestores_total} />
        <Kpi icon={Activity} label="Erros 24h" value={kpis?.errors_24h} color="text-red-600" />
        <Kpi icon={CreditCard} label="Assinaturas pendentes" value={kpis?.payments_pending} color="text-amber-600" title="Pagamentos de assinatura de escolas aguardando confirmação (PIX/boleto/cartão). Apenas escolas pagam — usuários nunca pagam." />
      </div>


      <div className="grid lg:grid-cols-3 gap-4">
        {/* Lista de escolas */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="flex flex-col max-h-[calc(100dvh-220px)]">
            <CardContent className="p-3 space-y-2 sticky top-0 bg-card z-10 border-b">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative basis-full sm:basis-auto sm:flex-1 sm:min-w-[200px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9 w-full" placeholder="Buscar escola ou INEP..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={state || "all"} onValueChange={(v) => setState(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 flex-1 min-w-0 sm:flex-none sm:w-[110px]"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos UF</SelectItem>
                    {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 flex-1 min-w-0 sm:flex-none sm:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="grace">Carência</SelectItem>
                    <SelectItem value="blocked">Bloqueada</SelectItem>
                    <SelectItem value="inactive">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">{loading ? "Carregando..." : `${rows.length} de ${total} escolas`}</div>
            </CardContent>

            <div className="overflow-y-auto flex-1 divide-y">
              {loading && <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
              {!loading && rows.map(r => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/admin/console/school/${r.id}`)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate" title={r.name}>{r.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.inep_code ?? "—"} · {r.state}/{r.city} · {r.users_count}u · {r.gestores_count}g
                      {r.pending_count > 0 && <span className="text-destructive font-semibold"> · {r.pending_count} pend.</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={r.subscription_status} />
                    {r.days_left !== null && <span className="text-[10px] text-muted-foreground">{r.days_left}d</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Auditoria global */}
        <div>
          <Card>
            <CardContent className="p-3">
              <h2 className="text-sm font-bold mb-2">Auditoria recente</h2>
              <AuditTimeline limit={30} compact />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color, title }: any) {
  return (
    <Card title={title}>
      <CardContent className="p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground font-semibold leading-tight">
          <Icon className={`h-3 w-3 shrink-0 ${color ?? ""}`} /><span className="break-words">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${color ?? ""}`}>{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    active: { c: "bg-green-100 text-green-800", t: "Ativa" },
    grace: { c: "bg-amber-100 text-amber-800", t: "Carência" },
    blocked: { c: "bg-red-100 text-red-800", t: "Bloqueada" },
    inactive: { c: "bg-gray-100 text-gray-700", t: "Inativa" },
  };
  const m = map[status] ?? { c: "bg-gray-100 text-gray-700", t: status };
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.c}`}>{m.t}</span>;
}
