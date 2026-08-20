import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  Clock,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Status = "fixed" | "ignored" | "pending";

interface ActionRow {
  id: string;
  scanner_name: string;
  finding_id: string;
  finding_name: string | null;
  level: string | null;
  status: Status;
  explanation: string | null;
  acted_at: string;
  scan_timestamp: string | null;
}

const STATUS_META: Record<
  Status,
  { label: string; icon: any; cls: string; badge: string }
> = {
  fixed: {
    label: "Corrigido",
    icon: CheckCircle2,
    cls: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  ignored: {
    label: "Ignorado",
    icon: EyeOff,
    cls: "text-slate-500",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
  },
  pending: {
    label: "Pendente",
    icon: Clock,
    cls: "text-amber-600",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
};

export default function SecurityAudit() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | Status>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["security-finding-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_finding_actions")
        .select("*")
        .order("acted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as ActionRow[];
    },
  });

  const rows = useMemo(
    () => (data ?? []).filter((r) => filter === "all" || r.status === filter),
    [data, filter],
  );

  const counts = useMemo(() => {
    const c = { fixed: 0, ignored: 0, pending: 0 };
    (data ?? []).forEach((r) => (c[r.status] += 1));
    return c;
  }, [data]);

  // Group by scan_timestamp (or acted_at date if missing)
  const groups = useMemo(() => {
    const map = new Map<string, ActionRow[]>();
    rows.forEach((r) => {
      const key = r.scan_timestamp
        ? format(new Date(r.scan_timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })
        : format(new Date(r.acted_at), "dd/MM/yyyy", { locale: ptBR });
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [rows]);

  return (
    <main className="min-h-dvh bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <History className="h-7 w-7 text-primary" />
                Auditoria de Segurança
              </h1>
              <p className="text-sm text-muted-foreground">
                Histórico de achados dos scans: corrigidos, ignorados e pendentes
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/admin/security")}
            className="gap-2"
          >
            <ShieldCheck className="h-4 w-4" /> Painel de scans
          </Button>
        </div>

        {/* KPIs / filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-2xl border bg-card p-4 text-left transition ${filter === "all" ? "ring-2 ring-primary" : ""}`}
          >
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{data?.length ?? 0}</div>
          </button>
          {(["fixed", "ignored", "pending"] as Status[]).map((s) => {
            const meta = STATUS_META[s];
            const Icon = meta.icon;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-2xl border bg-card p-4 text-left transition ${filter === s ? "ring-2 ring-primary" : ""}`}
              >
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon className={`h-3.5 w-3.5 ${meta.cls}`} /> {meta.label}
                </div>
                <div className={`text-2xl font-bold ${meta.cls}`}>
                  {counts[s]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Lista agrupada */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12 animate-pulse">
            Carregando histórico...
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShieldQuestion className="h-10 w-10 mx-auto mb-3 opacity-40" />
              Nenhum registro encontrado para este filtro.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {groups.map(([scanLabel, items]) => (
              <Card key={scanLabel}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <History className="h-4 w-4" /> Scan de {scanLabel}
                    <Badge variant="outline" className="ml-auto">
                      {items.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[480px] pr-2">
                    <div className="space-y-2">
                      {items.map((r) => {
                        const meta = STATUS_META[r.status];
                        const Icon = meta.icon;
                        return (
                          <div
                            key={r.id}
                            className="rounded-xl border bg-card/50 p-3 hover:bg-accent/5 transition"
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <Icon
                                  className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`}
                                />
                                <div className="min-w-0">
                                  <div className="font-medium text-sm break-words">
                                    {r.finding_name || r.finding_id}
                                  </div>
                                  <div className="text-[11px] font-mono text-muted-foreground break-all">
                                    {r.scanner_name} · {r.finding_id}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {r.level && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] uppercase ${r.level === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
                                  >
                                    {r.level}
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] uppercase ${meta.badge}`}
                                >
                                  {meta.label}
                                </Badge>
                              </div>
                            </div>
                            {r.explanation && (
                              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                {r.explanation}
                              </p>
                            )}
                            <div className="text-[10px] text-muted-foreground mt-1.5">
                              Ação em{" "}
                              {format(new Date(r.acted_at), "dd/MM/yyyy HH:mm", {
                                locale: ptBR,
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
