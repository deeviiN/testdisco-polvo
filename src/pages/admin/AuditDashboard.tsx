import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ShieldCheck,
  UserCog,
  KeyRound,
  FileWarning,
  Search,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditRow {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  performed_by: string | null;
  school_id: string | null;
  created_at: string;
}

/**
 * Ações consideradas sensíveis (papéis, políticas, aprovações, exclusões).
 * O painel usa este conjunto para categorizar e destacar eventos críticos.
 */
const ROLE_ACTIONS = new Set([
  "role_granted",
  "role_changed",
  "role_revoked",
  "profile_role_changed",
  "admin_approve_gestor_trial",
  "profile_approved",
  "profile_rejected",
  "manager_approve_profile",
  "manager_reject_profile",
  "admin_delete_user",
  "profile_deleted",
]);

const POLICY_ACTIONS = new Set([
  "policy_change",
  "rls_change",
  "function_change",
  "trigger_change",
  "grant_change",
  "schema_migration",
]);

const SENSITIVE_TABLES = new Set([
  "user_roles",
  "profiles",
  "audit_logs",
  "settings",
  "support_settings",
  "panel_settings",
  "roster_call_settings",
  "responsibility_transfers",
  "reassignment_invites",
  "schools",
  "assinaturas",
  "mp_settings",
]);

function categorize(row: AuditRow): "role" | "policy" | "sensitive" | "other" {
  if (ROLE_ACTIONS.has(row.action)) return "role";
  if (POLICY_ACTIONS.has(row.action)) return "policy";
  if (SENSITIVE_TABLES.has(row.table_name)) return "sensitive";
  return "other";
}

const CAT_META: Record<string, { label: string; badge: string; icon: any }> = {
  role: {
    label: "Papel",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
    icon: UserCog,
  },
  policy: {
    label: "Política",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    icon: KeyRound,
  },
  sensitive: {
    label: "Tabela sensível",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    icon: FileWarning,
  },
  other: {
    label: "Outro",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    icon: ShieldCheck,
  },
};

export default function AuditDashboard() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<
    "all" | "role" | "policy" | "sensitive"
  >("all");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState<"7" | "30" | "90" | "all">("30");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-dashboard", days],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (days !== "all") {
        const since = new Date();
        since.setDate(since.getDate() - Number(days));
        q = q.gte("created_at", since.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = useMemo(() => {
    const base = data ?? [];
    return base.filter((r) => {
      const cat = categorize(r);
      if (category !== "all" && cat !== category) return false;
      if (category === "all" && cat === "other") return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${r.action} ${r.table_name} ${r.record_id ?? ""} ${JSON.stringify(r.old_data ?? {})} ${JSON.stringify(r.new_data ?? {})}`;
        if (!hay.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [data, category, search]);

  const stats = useMemo(() => {
    const base = data ?? [];
    return {
      role: base.filter((r) => categorize(r) === "role").length,
      policy: base.filter((r) => categorize(r) === "policy").length,
      sensitive: base.filter((r) => categorize(r) === "sensitive").length,
      total: base.length,
    };
  }, [data]);

  const exportCsv = () => {
    // CSV com separador ';' (padrão pt-BR/Excel) e BOM UTF-8.
    const SEP = ";";
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "string" ? v : JSON.stringify(v);
      // escapa aspas e envolve sempre — evita quebra por ';', '\n' ou aspas.
      return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    };
    const fmtDate = (iso: string) =>
      format(new Date(iso), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });

    const catLabel = category === "all" ? "Todas sensíveis" : CAT_META[category].label;
    const periodLabel =
      days === "all" ? "Todo o histórico" : `Últimos ${days} dias`;
    const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });

    // Cabeçalho de metadados (linhas de contexto antes da tabela)
    const meta = [
      `# Auditoria & Logs`,
      `# Gerado em${SEP}${generatedAt}`,
      `# Categoria${SEP}${catLabel}`,
      `# Período${SEP}${periodLabel}`,
      `# Busca${SEP}${search || "(nenhuma)"}`,
      `# Total exportado${SEP}${rows.length}`,
      ``,
    ].join("\n");

    // Agrupa por categoria para leitura mais fácil
    const order: Array<"role" | "policy" | "sensitive" | "other"> = [
      "role",
      "policy",
      "sensitive",
      "other",
    ];
    const grouped = order
      .map((k) => ({ key: k, rows: rows.filter((r) => categorize(r) === k) }))
      .filter((g) => g.rows.length > 0);

    const columns = [
      "Data/hora",
      "Categoria",
      "Ação",
      "Tabela",
      "Registro",
      "Escola",
      "Executado por",
      "Antes",
      "Depois",
    ];
    const headerLine = columns.join(SEP);

    const sections = grouped
      .map((g) => {
        const title = `# ${CAT_META[g.key].label} (${g.rows.length})`;
        const body = g.rows
          .map((r) =>
            [
              esc(fmtDate(r.created_at)),
              esc(CAT_META[categorize(r)].label),
              esc(r.action),
              esc(r.table_name),
              esc(r.record_id ?? ""),
              esc(r.school_id ?? ""),
              esc(r.performed_by ?? ""),
              esc(r.old_data ?? ""),
              esc(r.new_data ?? ""),
            ].join(SEP),
          )
          .join("\n");
        return `${title}\n${headerLine}\n${body}`;
      })
      .join("\n\n");

    const csv = "\uFEFF" + meta + (sections || headerLine) + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin")}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Auditoria & Logs</h1>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["role", "policy", "sensitive"] as const).map((k) => {
            const meta = CAT_META[k];
            const Icon = meta.icon;
            return (
              <Card key={k}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`rounded-lg p-2 ${meta.badge} border`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {meta.label}
                    </div>
                    <div className="text-2xl font-bold">{stats[k]}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg border bg-slate-100 p-2 text-slate-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={category} onValueChange={(v: any) => setCategory(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias sensíveis</SelectItem>
                <SelectItem value="role">Mudanças de papel</SelectItem>
                <SelectItem value="policy">
                  Políticas / RLS / funções
                </SelectItem>
                <SelectItem value="sensitive">
                  Tabelas sensíveis (outras)
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={(v: any) => setDays(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o histórico</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ação, tabela, user_id…"
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Eventos ({rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[60vh]">
              <div className="divide-y">
                {isLoading && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Carregando…
                  </div>
                )}
                {!isLoading && rows.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum evento encontrado com os filtros atuais.
                  </div>
                )}
                {rows.map((r) => {
                  const cat = categorize(r);
                  const meta = CAT_META[cat];
                  return (
                    <div key={r.id} className="p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`${meta.badge} font-medium`}
                        >
                          {meta.label}
                        </Badge>
                        <span className="font-mono font-semibold">
                          {r.action}
                        </span>
                        <span className="text-muted-foreground">
                          · {r.table_name}
                          {r.record_id ? ` · ${r.record_id.slice(0, 8)}…` : ""}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {format(
                            new Date(r.created_at),
                            "dd/MM/yyyy HH:mm:ss",
                            { locale: ptBR },
                          )}
                        </span>
                      </div>
                      {r.performed_by && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          por{" "}
                          <span className="font-mono">
                            {r.performed_by.slice(0, 8)}…
                          </span>
                        </div>
                      )}
                      {(r.old_data || r.new_data) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                            ver dados
                          </summary>
                          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {r.old_data && (
                              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">
                                antes: {JSON.stringify(r.old_data, null, 2)}
                              </pre>
                            )}
                            {r.new_data && (
                              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">
                                depois: {JSON.stringify(r.new_data, null, 2)}
                              </pre>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
