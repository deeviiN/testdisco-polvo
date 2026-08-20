import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Search, RefreshCw, X, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Row = {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
  network: string;
  is_active: boolean;
  subscription_status: string | null;
  subscription_end_date: string | null;
  grace_period_days: number | null;
};

function planBadge(status?: string | null, endDate?: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : null;
  const isActive =
    (status === "active" || status === "paid" || status === "trialing") &&
    (!end || end >= today);
  const isGrace = status === "grace_period";
  const fmt = end ? end.toLocaleDateString("pt-BR") : null;
  if (isActive) {
    return {
      label: fmt ? `Ativo até ${fmt}` : "Ativo",
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    };
  }
  if (isGrace) {
    return {
      label: fmt ? `Carência até ${fmt}` : "Carência",
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    };
  }
  return {
    label: fmt ? `Vencido em ${fmt}` : "Sem plano",
    cls: "bg-muted text-muted-foreground border-border",
  };
}

const BATCH_SIZE = 500;
const PAGE_SIZE = 25;

export default function SubscribedSchoolsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState("__all__");
  const [cityFilter, setCityFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState<"__all__" | "active" | "grace" | "expired">("__all__");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const reqIdRef = useRef(0);

  const fetchBatch = async (offset: number) => {
    const { data, error: rpcErr } = await supabase.rpc("list_subscribed_schools_admin", {
      _limit: BATCH_SIZE,
      _offset: offset,
    });
    if (rpcErr) throw rpcErr;
    return (data ?? []) as unknown as Row[];
  };

  const loadInitial = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setAllLoaded(false);
    setRows([]);
    try {
      const batch = await fetchBatch(0);
      if (reqIdRef.current !== myReq) return;
      setRows(batch);
      if (batch.length < BATCH_SIZE) setAllLoaded(true);
    } catch (e) {
      if (reqIdRef.current !== myReq) return;
      setError((e as Error)?.message || "Falha ao carregar escolas com plano.");
    } finally {
      if (reqIdRef.current === myReq) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || allLoaded) return;
    const myReq = reqIdRef.current;
    setLoadingMore(true);
    try {
      const batch = await fetchBatch(rows.length);
      if (reqIdRef.current !== myReq) return;
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...batch.filter((r) => !seen.has(r.id))];
      });
      if (batch.length < BATCH_SIZE) setAllLoaded(true);
    } catch (e) {
      if (reqIdRef.current !== myReq) return;
      setError((e as Error)?.message || "Falha ao carregar mais escolas.");
    } finally {
      if (reqIdRef.current === myReq) setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [stateFilter, cityFilter, statusFilter, search]);

  // Status derivado do retorno autoritativo da RPC list_subscribed_schools_admin,
  // que já calcula 'active' | 'grace_period' | 'inactive' a partir de assinaturas + validade.
  const computePlanStatus = (r: Row): "active" | "grace" | "expired" => {
    const s = (r.subscription_status || "").toLowerCase();
    if (s === "grace_period") return "grace";
    if (s === "active" || s === "paid" || s === "trialing") return "active";
    return "expired";
  };

  const states = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.state, (map.get(r.state) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const cities = useMemo(() => {
    if (stateFilter === "__all__") return [];
    const map = new Map<string, number>();
    rows
      .filter((r) => r.state === stateFilter)
      .forEach((r) => map.set(r.city, (map.get(r.city) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, stateFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== "__all__" && r.state !== stateFilter) return false;
      if (cityFilter !== "__all__" && r.city !== cityFilter) return false;
      if (statusFilter !== "__all__" && computePlanStatus(r) !== statusFilter) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !(r.inep_code || "").toLowerCase().includes(q) &&
        !r.city.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, stateFilter, cityFilter, statusFilter, search]);

  const counts = useMemo(() => {
    let active = 0;
    let grace = 0;
    let expired = 0;
    filtered.forEach((r) => {
      const s = computePlanStatus(r);
      if (s === "active") active++;
      else if (s === "grace") grace++;
      else expired++;
    });
    return { active, grace, expired, total: filtered.length };
  }, [filtered]);

  const hasFilter =
    stateFilter !== "__all__" ||
    cityFilter !== "__all__" ||
    statusFilter !== "__all__" ||
    search.trim().length > 0;

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-tight">Escolas com planos assinados</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Listagem geral com filtragem por estado e município.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadInitial} className="h-8 rounded-lg gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {/* Counters (clicáveis para filtrar por status) */}
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("__all__")}
            className={`rounded-xl border p-2 text-center transition-all ${
              statusFilter === "__all__"
                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                : "border-border/50 bg-secondary/40 hover:bg-secondary/60"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
            <p className="text-xl font-bold">{counts.total.toLocaleString("pt-BR")}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`rounded-xl border p-2 text-center transition-all ${
              statusFilter === "active"
                ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30"
                : "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">Ativas</p>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{counts.active.toLocaleString("pt-BR")}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("grace")}
            className={`rounded-xl border p-2 text-center transition-all ${
              statusFilter === "grace"
                ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30"
                : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">Carência</p>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{counts.grace.toLocaleString("pt-BR")}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("expired")}
            className={`rounded-xl border p-2 text-center transition-all ${
              statusFilter === "expired"
                ? "border-destructive bg-destructive/15 ring-2 ring-destructive/30"
                : "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold">Expiradas</p>
            <p className="text-xl font-bold text-destructive">{counts.expired.toLocaleString("pt-BR")}</p>
          </button>
        </div>

        {/* Filtro de status (select alternativo) */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
            <SelectValue placeholder="Status do plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="active">Apenas ativas</SelectItem>
            <SelectItem value="grace">Apenas em carência</SelectItem>
            <SelectItem value="expired">Apenas expiradas</SelectItem>
          </SelectContent>
        </Select>


        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={stateFilter}
            onValueChange={(v) => {
              setStateFilter(v);
              setCityFilter("__all__");
            }}
          >
            <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todos os estados ({rows.length})</SelectItem>
              {states.map(([s, c]) => (
                <SelectItem key={s} value={s}>
                  {s} ({c})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={setCityFilter} disabled={stateFilter === "__all__"}>
            <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
              <SelectValue placeholder={stateFilter === "__all__" ? "Selecione um estado" : "Cidade"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todas as cidades</SelectItem>
              {cities.map(([c, n]) => (
                <SelectItem key={c} value={c}>
                  {c} ({n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pelo nome, cidade ou INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value.replace("@", ""))}
            className="pl-10 h-10 rounded-xl bg-secondary/50 border-0"
          />
        </div>

        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStateFilter("__all__");
              setCityFilter("__all__");
              setStatusFilter("__all__");
              setSearch("");
            }}
            className="h-7 rounded-lg gap-1 text-xs self-start"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        )}

        {(() => {
          const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
          const safePage = Math.min(page, totalPages - 1);
          const start = safePage * PAGE_SIZE;
          const pageRows = filtered.slice(start, start + PAGE_SIZE);
          return (
            <>
              {!loading && !error && filtered.length > 0 && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>
                    Mostrando {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} de {filtered.length.toLocaleString("pt-BR")}
                    {!allLoaded && ` · ${rows.length.toLocaleString("pt-BR")} carregadas`}
                  </span>
                  <span>Pág. {safePage + 1}/{totalPages}</span>
                </div>
              )}

              {/* List */}
              <div className="rounded-xl border border-border/50 max-h-[420px] overflow-y-auto divide-y divide-border/50">
                {loading && (
                  <div className="p-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carregando escolas com plano…
                  </div>
                )}
                {!loading && error && (
                  <div className="p-4 text-center text-xs text-destructive">{error}</div>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Nenhuma escola com plano encontrada com esses filtros.
                  </p>
                )}
                {!loading &&
                  !error &&
                  pageRows.map((s) => {
                    const plan = planBadge(s.subscription_status, s.subscription_end_date);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/admin/school/${s.id}`)}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors flex items-start gap-2"
                      >
                        <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-wrap break-words">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.city} — {s.state}
                            {s.inep_code ? ` · INEP ${s.inep_code}` : ""}
                          </p>
                          <span
                            className={`mt-1 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${plan.cls}`}
                          >
                            {plan.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>

              {/* Pagination */}
              {!loading && !error && filtered.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl h-8 text-xs"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {safePage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl h-8 text-xs"
                    disabled={safePage + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              )}

              {/* Progressive load more */}
              {!loading && !error && !allLoaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full h-9 rounded-xl text-xs gap-2 bg-secondary/40 hover:bg-secondary"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Carregando mais…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Carregar mais escolas (+{BATCH_SIZE})
                    </>
                  )}
                </Button>
              )}
              {!loading && !error && allLoaded && rows.length > BATCH_SIZE && (
                <p className="text-center text-[11px] text-muted-foreground">Todas as escolas carregadas</p>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
