import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Phone, Mail, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = {
  school_id: string;
  school_name: string;
  city: string;
  state: string;
  network: string;
  gestor_name: string | null;
  gestor_phone: string | null;
  gestor_email: string | null;
  subscription_deadline: string | null;
  days_remaining: number | null;
  status:
    | "active"
    | "expiring_soon"
    | "grace_period"
    | "expired"
    | "blocked"
    | "no_subscription";
};

const STATUS_LABEL: Record<Row["status"], string> = {
  active: "Ativa",
  expiring_soon: "Expira em breve",
  grace_period: "Em carência",
  expired: "Expirada",
  blocked: "Bloqueada",
  no_subscription: "Sem assinatura",
};

const STATUS_TONE: Record<Row["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  expiring_soon: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  grace_period: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  blocked: "bg-destructive/25 text-destructive border-destructive/40",
  no_subscription: "bg-muted text-muted-foreground border-border",
};

export default function SchoolDeadlines() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Row["status"] | "all">("all");
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "list_schools_deadlines_admin" as any,
    );
    if (error) {
      toast.error("Falha ao carregar prazos: " + error.message);
    } else {
      setRows((data as Row[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runSync = async () => {
    setSyncing(true);
    const { error } = await supabase.rpc(
      "sync_gestor_subscription_deadlines" as any,
    );
    if (error) {
      toast.error("Falha ao sincronizar: " + error.message);
    } else {
      toast.success("Prazos sincronizados");
      await load();
    }
    setSyncing(false);
  };

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.school_name?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.gestor_name?.toLowerCase().includes(q) ||
        r.gestor_email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-2 shadow-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin")}
          className="text-primary-foreground hover:bg-white/15 h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80 leading-none">
            Painel Admin
          </p>
          <h1 className="text-lg font-extrabold leading-tight truncate mt-0.5">
            Escolas — Prazos
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={runSync}
          disabled={syncing}
          className="text-primary-foreground hover:bg-white/15 h-9 w-9"
          title="Forçar sincronização agora"
        >
          <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <div className="p-4 space-y-3 max-w-5xl mx-auto">
        {/* Filtros de status */}
        <div className="flex flex-wrap gap-1.5">
          {(["all", "blocked", "expired", "grace_period", "expiring_soon", "active", "no_subscription"] as const).map(
            (s) => {
              const active = statusFilter === s;
              const label = s === "all" ? "Todas" : STATUS_LABEL[s as Row["status"]];
              const count = s === "all" ? rows.length : counts[s] ?? 0;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {label} <span className="opacity-70">({count})</span>
                </button>
              );
            },
          )}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar escola, cidade, gestor ou e-mail…"
            className="pl-9 h-11"
          />
        </div>

        {loading && (
          <div className="text-center py-12 text-muted-foreground">Carregando…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma escola encontrada para esse filtro.
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.school_id}
              className="rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm break-words">{r.school_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.city} · {r.state} · {r.network}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${STATUS_TONE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Gestor
                  </p>
                  <p className="font-semibold break-words">
                    {r.gestor_name ?? "—"}
                  </p>
                  {r.gestor_phone && (
                    <a
                      href={`https://wa.me/55${r.gestor_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-emerald-600 hover:underline break-all"
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      {r.gestor_phone}
                    </a>
                  )}
                  {r.gestor_email && (
                    <a
                      href={`mailto:${r.gestor_email}`}
                      className="flex items-center gap-1 text-primary hover:underline break-all"
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      {r.gestor_email}
                    </a>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Prazo
                  </p>
                  <p className="font-semibold flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(r.subscription_deadline)}
                  </p>
                  {r.days_remaining !== null && (
                    <p
                      className={`text-base font-extrabold ${
                        r.days_remaining < 0
                          ? "text-destructive"
                          : r.days_remaining <= 14
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {r.days_remaining >= 0
                        ? `${r.days_remaining} dias restantes`
                        : `${Math.abs(r.days_remaining)} dias vencido`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
