import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Loader2, Copy, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 50;

interface DuplicateRow {
  id: string;
  created_at: string;
  mp_payment_id: string;
  status_after: string | null;
  payload: any;
  pagamento_id: string | null;
  norm_mp_payment_id?: string | null;
  norm_status?: string | null;
  first_processed_at?: string | null;
}

const startOfDayISO = (d: string) => (d ? new Date(d + "T00:00:00").toISOString() : "");
const endOfDayISO = (d: string) => (d ? new Date(d + "T23:59:59.999").toISOString() : "");

export default function MpDuplicateEvents() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DuplicateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusNorm, setStatusNorm] = useState("");
  const [requestId, setRequestId] = useState("");
  const [dupFrom, setDupFrom] = useState("");
  const [dupTo, setDupTo] = useState("");
  const [firstFrom, setFirstFrom] = useState("");
  const [firstTo, setFirstTo] = useState("");

  const clearFilters = () => {
    setSearch("");
    setStatusNorm("");
    setRequestId("");
    setDupFrom("");
    setDupTo("");
    setFirstFrom("");
    setFirstTo("");
    setPage(0);
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      // If status_norm or first_processed_at filters are active, pre-fetch matching mp_payment_ids
      let restrictIds: string[] | null = null;
      const needsProcessedFilter =
        !!statusNorm.trim() || !!firstFrom || !!firstTo;

      if (needsProcessedFilter) {
        let pq = supabase
          .from("processed_webhook_events")
          .select("mp_payment_id, status_norm, processed_at")
          .limit(5000);
        if (statusNorm.trim()) pq = pq.ilike("status_norm", `%${statusNorm.trim()}%`);
        if (firstFrom) pq = pq.gte("processed_at", startOfDayISO(firstFrom));
        if (firstTo) pq = pq.lte("processed_at", endOfDayISO(firstTo));
        const { data: pwe, error: pweErr } = await pq;
        if (pweErr) throw pweErr;
        restrictIds = Array.from(
          new Set((pwe ?? []).map((r) => r.mp_payment_id).filter(Boolean) as string[])
        );
        if (restrictIds.length === 0) {
          setRows([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      }

      let q = supabase
        .from("payment_integration_logs")
        .select("id, created_at, mp_payment_id, status_after, payload, pagamento_id", {
          count: "exact",
        })
        .eq("event_type", "webhook_duplicate")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (search.trim()) q = q.ilike("mp_payment_id", `%${search.trim()}%`);
      if (requestId.trim()) q = q.ilike("payload->>request_id", `%${requestId.trim()}%`);
      if (dupFrom) q = q.gte("created_at", startOfDayISO(dupFrom));
      if (dupTo) q = q.lte("created_at", endOfDayISO(dupTo));
      if (restrictIds) q = q.in("mp_payment_id", restrictIds);

      const { data, count, error } = await q;
      if (error) throw error;

      const ids = (data ?? []).map((r) => r.mp_payment_id).filter(Boolean) as string[];
      const normMap = new Map<string, { norm_mp: string; norm_status: string; first: string }>();
      if (ids.length > 0) {
        const { data: norm } = await supabase
          .from("processed_webhook_events")
          .select("mp_payment_id, mp_payment_id_norm, status_norm, processed_at")
          .in("mp_payment_id", ids);
        for (const n of norm ?? []) {
          normMap.set(n.mp_payment_id, {
            norm_mp: n.mp_payment_id_norm ?? n.mp_payment_id,
            norm_status: n.status_norm ?? "",
            first: n.processed_at,
          });
        }
      }

      setRows(
        (data ?? []).map((r) => {
          const n = normMap.get(r.mp_payment_id);
          return {
            ...r,
            norm_mp_payment_id: n?.norm_mp ?? r.mp_payment_id,
            norm_status: n?.norm_status ?? r.status_after,
            first_processed_at: n?.first ?? null,
          };
        })
      );
      setTotal(count ?? 0);
    } catch (e: any) {
      toast.error("Erro ao carregar duplicatas", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusNorm, requestId, dupFrom, dupTo, firstFrom, firstTo]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copiado");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount =
    [search, statusNorm, requestId, dupFrom, dupTo, firstFrom, firstTo].filter(Boolean).length;

  return (
    <main className="min-h-[100dvh] bg-[hsl(220,50%,28%)] text-white p-4 pb-24">
      <header className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin")}
          className="text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold flex-1 break-words">
          Webhooks Duplicados (MP)
        </h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowFilters((v) => !v)}
          className="text-white hover:bg-white/10 relative"
        >
          <Filter className="h-5 w-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-amber-400 text-[hsl(220,70%,10%)] text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchRows}
          className="text-white hover:bg-white/10"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <div className="mb-3">
        <Input
          placeholder="Buscar por mp_payment_id…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>

      {showFilters && (
        <Card className="p-3 mb-3 bg-white/5 border-white/10 text-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Filtros</span>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-white/80 hover:bg-white/10 h-7 px-2"
              >
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/70">status_norm</Label>
            <Input
              placeholder="ex.: approved, pending…"
              value={statusNorm}
              onChange={(e) => {
                setStatusNorm(e.target.value);
                setPage(0);
              }}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/70">request_id</Label>
            <Input
              placeholder="ex.: req-abc123"
              value={requestId}
              onChange={(e) => {
                setRequestId(e.target.value);
                setPage(0);
              }}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/70">Duplicata (registro do log)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dupFrom}
                onChange={(e) => {
                  setDupFrom(e.target.value);
                  setPage(0);
                }}
                className="bg-white/10 border-white/20 text-white h-9"
              />
              <Input
                type="date"
                value={dupTo}
                onChange={(e) => {
                  setDupTo(e.target.value);
                  setPage(0);
                }}
                className="bg-white/10 border-white/20 text-white h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/70">1ª aceitação (processed_at)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={firstFrom}
                onChange={(e) => {
                  setFirstFrom(e.target.value);
                  setPage(0);
                }}
                className="bg-white/10 border-white/20 text-white h-9"
              />
              <Input
                type="date"
                value={firstTo}
                onChange={(e) => {
                  setFirstTo(e.target.value);
                  setPage(0);
                }}
                className="bg-white/10 border-white/20 text-white h-9"
              />
            </div>
          </div>
        </Card>
      )}

      <div className="text-xs text-white/70 mb-2">
        {loading ? "Carregando…" : `${total} evento(s) duplicado(s)`}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center bg-white/5 border-white/10 text-white/80">
          Nenhum evento duplicado encontrado.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const reqId = r.payload?.request_id ?? "—";
            return (
              <Card
                key={r.id}
                className="p-3 bg-white/5 border-white/10 text-white space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-amber-400 text-[hsl(220,70%,10%)] hover:brightness-110">
                    duplicate
                  </Badge>
                  <span className="text-[11px] text-white/60">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>

                <div className="text-sm">
                  <div className="flex items-center gap-1.5 break-words">
                    <span className="text-white/60 text-xs">mp_payment_id:</span>
                    <span className="font-mono text-xs break-all">
                      {r.norm_mp_payment_id}
                    </span>
                    <button
                      onClick={() => copy(r.norm_mp_payment_id ?? "")}
                      className="text-white/50 hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-xs text-white/80">
                    status: <span className="font-mono">{r.norm_status ?? "—"}</span>
                  </div>
                  <div className="text-xs text-white/80 break-all">
                    request_id: <span className="font-mono">{reqId}</span>
                  </div>
                  {r.first_processed_at && (
                    <div className="text-[11px] text-white/60">
                      1ª aceitação: {new Date(r.first_processed_at).toLocaleString("pt-BR")}
                    </div>
                  )}
                  {r.pagamento_id && (
                    <div className="text-[11px] text-white/60 break-all">
                      pagamento_id: {r.pagamento_id}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="text-white hover:bg-white/10"
          >
            Anterior
          </Button>
          <span className="text-xs text-white/70">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-white hover:bg-white/10"
          >
            Próxima
          </Button>
        </div>
      )}
    </main>
  );
}
