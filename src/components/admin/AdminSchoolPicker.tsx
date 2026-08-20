import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Search, Loader2, MapPin, X, AlertCircle, RefreshCw, LogOut } from "lucide-react";

type Row = {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
  network: string;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  total_count?: number;
};

function getPlanBadge(status?: string | null, endDate?: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate + "T00:00:00") : null;
  const isActive =
    (status === "active" || status === "paid" || status === "trialing" || status === "trial") &&
    (!end || end >= today);
  const isGrace = status === "grace_period";
  const isExpired = !!end && end < today;

  const fmt = end
    ? end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

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
  if (isExpired || status === "blocked" || status === "inactive") {
    return {
      label: fmt ? `Vencido em ${fmt}` : "Vencido",
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    };
  }
  return {
    label: "Sem plano",
    cls: "bg-muted text-muted-foreground border-border",
  };
}

interface Props {
  onPick: (schoolId: string, schoolName: string) => void;
}

const PAGE_SIZE = 25;

export function AdminSchoolPicker({ onPick }: Props) {
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string>("__all__");
  const [cityFilter, setCityFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [results, setResults] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [moreAttempts, setMoreAttempts] = useState(0);
  const MAX_MORE_ATTEMPTS = 3;
  const reqIdRef = useRef(0);
  const [hideNames, setHideNames] = useState(true);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreLockRef = useRef(false);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load states once
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("list_school_states_admin");
      setStates((data ?? []).map((r: { state: string }) => r.state));
    })();
  }, []);

  // Load cities when state changes
  useEffect(() => {
    setCityFilter("__all__");
    if (stateFilter === "__all__") {
      setCities([]);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("list_school_cities_admin", { _state: stateFilter });
      setCities((data ?? []).map((r: { city: string }) => r.city));
    })();
  }, [stateFilter]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const hasActiveFilter =
    stateFilter !== "__all__" || cityFilter !== "__all__" || debounced.length >= 2;

  // Reset + first page on filter change
  const runFirstPage = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setMoreError(null);
    setMoreAttempts(0);
    try {
      const { data, error: rpcErr } = await supabase.rpc("list_schools_admin_paginated", {
        _state: stateFilter === "__all__" ? null : stateFilter,
        _city: cityFilter === "__all__" ? null : cityFilter,
        _network: null,
        _search: debounced || null,
        _limit: PAGE_SIZE,
        _offset: 0,
      });
      if (reqIdRef.current !== myReq) return;
      if (rpcErr) throw rpcErr;
      const rows = (data ?? []) as Row[];
      setResults(rows);
      setTotal(rows[0]?.total_count ?? 0);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } catch (e) {
      if (reqIdRef.current !== myReq) return;
      setResults([]);
      setTotal(0);
      setError((e as Error)?.message || "Falha ao buscar escolas. Verifique sua conexão.");
    } finally {
      if (reqIdRef.current === myReq) setLoading(false);
    }
  };

  useEffect(() => {
    runFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter, cityFilter, debounced]);

  const LOAD_MORE_TIMEOUT_MS = 8000;

  const loadMore = async () => {
    if (loadMoreLockRef.current) return;
    if (loadingMore || loading) return;
    if (results.length >= total) return;
    if (moreAttempts >= MAX_MORE_ATTEMPTS) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const myReq = reqIdRef.current;
    try {
      const rpcPromise = supabase.rpc("list_schools_admin_paginated", {
        _state: stateFilter === "__all__" ? null : stateFilter,
        _city: cityFilter === "__all__" ? null : cityFilter,
        _network: null,
        _search: debounced || null,
        _limit: PAGE_SIZE,
        _offset: results.length,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tempo esgotado após ${LOAD_MORE_TIMEOUT_MS / 1000}s. Verifique sua conexão.`)),
          LOAD_MORE_TIMEOUT_MS,
        ),
      );
      const { data, error: rpcErr } = (await Promise.race([rpcPromise, timeoutPromise])) as Awaited<typeof rpcPromise>;
      if (reqIdRef.current !== myReq) return;
      if (rpcErr) throw rpcErr;
      const rows = (data ?? []) as Row[];
      setResults((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setMoreAttempts(0);
    } catch (e) {
      if (reqIdRef.current !== myReq) return;
      setMoreAttempts((n) => n + 1);
      setMoreError((e as Error)?.message || "Falha ao carregar mais resultados.");
    } finally {
      if (reqIdRef.current === myReq) setLoadingMore(false);
      // Small cooldown to prevent rapid re-fires from observer/scroll bounce
      setTimeout(() => {
        loadMoreLockRef.current = false;
      }, 250);
    }
  };

  // Debounced trigger to coalesce rapid sentinel intersections
  const triggerLoadMore = () => {
    if (loadMoreTimerRef.current) return;
    loadMoreTimerRef.current = setTimeout(() => {
      loadMoreTimerRef.current = null;
      loadMore();
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    };
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) triggerLoadMore();
      },
      { root, rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length, total, loading, loadingMore, debounced, stateFilter, cityFilter]);

  const clearAll = () => {
    setStateFilter("__all__");
    setCityFilter("__all__");
    setSearch("");
  };

  const hasMore = results.length < total;

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-4 space-y-3">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Eye className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-lg leading-tight text-emerald-500">Entrar como Servidor Local</p>
              <p className="text-sm text-muted-foreground mt-1.5">
                Refine por estado, cidade ou nome para acessar a visão completa da escola.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHideNames((v) => !v)}
              className="h-8 rounded-lg gap-1 text-xs px-2"
              title={hideNames ? "Mostrar nomes" : "Ocultar nomes"}
            >
              {hideNames ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {hideNames ? "Mostrar" : "Ocultar"}
            </Button>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="h-8 rounded-lg gap-1 text-xs px-2"
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm("Deseja realmente sair da sua conta?")) return;
                try {
                  await supabase.auth.signOut();
                } finally {
                  window.location.replace("/auth");
                }
              }}
              className="h-8 rounded-lg gap-1 text-xs px-2 ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={stateFilter}
            onValueChange={(v) => setStateFilter(v)}
          >
            <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">Nenhuma (ocultar lista)</SelectItem>
              <SelectItem value="__all__">Todos os estados</SelectItem>
              {states.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={cityFilter}
            onValueChange={setCityFilter}
            disabled={stateFilter === "__all__"}
          >
            <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
              <SelectValue placeholder={stateFilter === "__all__" ? "Selecione um estado" : "Cidade"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todas as cidades</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pelo nome ou INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value.replace("@", ""))}
            className="pl-10 h-10 rounded-xl bg-secondary/50 border-0 focus-visible:ring-primary/30 focus-visible:ring-offset-0"
          />
        </div>

        {/* Results — só aparecem quando há filtro ativo, para despoluir a tela */}
        {stateFilter === "__none__" || !hasActiveFilter ? (
          <p className="text-[11px] text-muted-foreground px-1 py-3 text-center">
            Escolha um estado, município ou digite no campo de busca para listar as escolas.
          </p>
        ) : (
          <>
            {(total > 0 || debounced.length > 0) && !loading && (
              <p className="text-[11px] text-muted-foreground px-1">
                Mostrando {results.length} de {total} escolas
              </p>
            )}
            <div
              ref={scrollRef}
              className="rounded-xl border border-border/50 max-h-72 overflow-y-auto divide-y divide-border/50"
            >
              {loading && (
                <div className="p-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Buscando…
                </div>
              )}
              {!loading && error && (
                <div className="p-4 flex flex-col items-center gap-2 text-center">
                  <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="font-medium">Não foi possível carregar as escolas</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground break-words max-w-xs">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runFirstPage}
                    className="h-8 rounded-lg text-xs gap-1.5 mt-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                </div>
              )}
              {!loading && !error && results.length === 0 && (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  Nenhuma escola encontrada com esses filtros
                </p>
              )}
              {!loading && results.map((s) => {
                const plan = getPlanBadge(s.subscription_status, s.subscription_end_date);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onPick(s.id, s.name)}
                    className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors flex items-start gap-2"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-wrap break-words">{s.name}</p>
                      <p className="text-xs mt-0.5 text-muted-foreground">
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

              {/* Inline skeletons while loading more */}
              {!loading && !error && loadingMore && (
                <div className="divide-y divide-border/50" aria-hidden="true">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`sk-${i}`} className="px-3 py-2.5 flex items-start gap-2 animate-pulse">
                      <div className="h-3.5 w-3.5 rounded-sm bg-muted mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3.5 w-3/4 rounded bg-muted" />
                        <div className="h-3 w-1/2 rounded bg-muted/70" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline error block (replaces skeletons area) */}
              {!loading && !error && moreError && (() => {
                const exhausted = moreAttempts >= MAX_MORE_ATTEMPTS;
                return (
                  <div className="m-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 flex flex-col items-center text-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {exhausted
                        ? "Não foi possível carregar mais escolas"
                        : "Falha ao carregar mais escolas"}
                    </div>
                    <p className="text-[11px] text-muted-foreground break-words max-w-xs">
                      {exhausted
                        ? `Tentamos ${MAX_MORE_ATTEMPTS} vezes sem sucesso. Ajuste os filtros ou tente novamente mais tarde.`
                        : moreError}
                    </p>
                    {!exhausted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMore}
                        className="h-8 rounded-lg text-xs gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Tentar novamente ({moreAttempts}/{MAX_MORE_ATTEMPTS})
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMoreAttempts(0);
                          setMoreError(null);
                          loadMore();
                        }}
                        className="h-8 rounded-lg text-xs gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reiniciar tentativas
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* Sentinel + load more */}
              {!loading && !error && !moreError && hasMore && (
                <div ref={sentinelRef} className="p-3 flex flex-col items-center justify-center gap-2">
                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Carregando mais escolas…
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadMore}
                      className="h-8 rounded-lg text-xs"
                    >
                      Carregar mais
                    </Button>
                  )}
                </div>
              )}
              {!loading && !error && !hasMore && results.length > 0 && results.length >= PAGE_SIZE && (
                <p className="p-2 text-center text-[11px] text-muted-foreground">Fim dos resultados</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}