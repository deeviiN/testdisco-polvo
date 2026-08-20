import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, ChevronLeft, ChevronRight, Filter, RefreshCw, Download, X, FileSpreadsheet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 25;

const MP_ACTIONS = [
  { value: "all", label: "Todas as ações" },
  { value: "mp_credentials_check", label: "Teste de credenciais" },
  { value: "mp_payment_create", label: "Criação de pagamento" },
  { value: "mp_payment_webhook", label: "Webhook recebido" },
  { value: "mp_payment_approved_notification", label: "Notificação de aprovação" },
  { value: "status_update", label: "Mudança de status (Trigger)" },
  { value: "manual_check", label: "Verificação manual" },
];

interface MpAuditRow {
  id: string;
  action: string;
  table_name: string;
  created_at: string;
  performed_by: string | null;
  new_data: any;
}

export default function MpAuditLogs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MpAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [action, setAction] = useState<string>("mp_credentials_check");
  const [mode, setMode] = useState<string>("all"); // all | test | prod
  const [okFilter, setOkFilter] = useState<string>("all"); // all | ok | fail
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [searchQuery, setSearchSearchQuery] = useState<string>("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Busca logs da tabela audit_logs (logs genéricos)
      let qAudit = supabase
        .from("audit_logs")
        .select("id,action,table_name,created_at,performed_by,new_data", { count: "exact" })
        .order("created_at", { ascending: false });

      // 2. Busca logs da tabela payment_integration_logs (logs específicos de integração)
      let qIntegration = supabase
        .from("payment_integration_logs")
        .select("id,event_type,pagamento_id,mp_payment_id,status_before,status_after,payload,created_at", { count: "exact" })
        .order("created_at", { ascending: false });

      // Search Filter (ID do pagamento no banco ou no MP)
      if (searchQuery.trim()) {
        const term = searchQuery.trim();
        qAudit = qAudit.or(`performed_by.eq.${term},new_data->>mp_payment_id.eq.${term},new_data->>pagamento_id.eq.${term}`);
        qIntegration = qIntegration.or(`mp_payment_id.eq.${term},pagamento_id.eq.${term}`);
      }

      // Action filter
      if (action !== "all") {
        if (["status_update", "manual_check"].includes(action)) {
          // Essas ações não existem em audit_logs (são da payment_integration_logs)
          qAudit = qAudit.eq("id", "00000000-0000-0000-0000-000000000000"); // hack para não trazer nada
        } else {
          qAudit = qAudit.eq("action", action);
        }
      } else {
        qAudit = qAudit.in("action", ["mp_credentials_check", "mp_payment_create", "mp_payment_webhook", "mp_payment_approved_notification"]);
      }

      // Filtros para payment_integration_logs
      if (action !== "all") {
        if (["status_update", "manual_check"].includes(action)) {
          qIntegration = qIntegration.eq("event_type", action);
        } else if (action === "mp_payment_webhook") {
          qIntegration = qIntegration.eq("event_type", "webhook");
        } else {
          qIntegration = qIntegration.eq("id", "00000000-0000-0000-0000-000000000000");
        }
      }

      // Aplica filtros de data em ambos
      if (from) {
        const fromIso = new Date(from).toISOString();
        qAudit = qAudit.gte("created_at", fromIso);
        qIntegration = qIntegration.gte("created_at", fromIso);
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        const toIso = end.toISOString();
        qAudit = qAudit.lte("created_at", toIso);
        qIntegration = qIntegration.lte("created_at", toIso);
      }

      // Executa ambas as queries para pegar o total e os dados
      const [resAudit, resIntegration] = await Promise.all([
        qAudit.limit(PAGE_SIZE * (page + 1)),
        qIntegration.limit(PAGE_SIZE * (page + 1))
      ]);

      // Normaliza os dados da tabela específica para o formato da lista
      const integrationRows: MpAuditRow[] = (resIntegration.data ?? []).map(r => ({
        id: r.id,
        action: r.event_type === "webhook" ? "mp_payment_webhook" : r.event_type,
        table_name: "payment_integration_logs",
        created_at: r.created_at,
        performed_by: null,
        new_data: {
          ...((r.payload as any) || {}),
          status_before: r.status_before,
          status_after: r.status_after,
          mp_payment_id: r.mp_payment_id,
          pagamento_id: r.pagamento_id
        }
      }));

      const auditRows: MpAuditRow[] = (resAudit.data ?? []) as MpAuditRow[];

      // Combina, ordena e pagina
      const combined = [...auditRows, ...integrationRows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      const start = page * PAGE_SIZE;
      const paginated = combined.slice(start, start + PAGE_SIZE);

      setRows(paginated);
      setTotal((resAudit.count ?? 0) + (resIntegration.count ?? 0));
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar logs");
    } finally {
      setLoading(false);
    }
  }, [action, from, to, page, searchQuery]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [action, mode, okFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

  const [exporting, setExporting] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportEtaMs, setExportEtaMs] = useState<number | null>(null);
  const [exportRate, setExportRate] = useState<number>(0); // rows/sec
  const cancelExportRef = useRef(false);
  const [cancelingExport, setCancelingExport] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const requestCancelExport = () => {
    if (!exporting || cancelingExport) return;
    setConfirmCancelOpen(true);
  };

  const confirmCancelExport = () => {
    cancelExportRef.current = true;
    setCancelingExport(true);
    setConfirmCancelOpen(false);
  };

  const formatEta = (ms: number | null): string => {
    if (ms === null || !isFinite(ms) || ms <= 0) return "calculando…";
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
  };

  const csvEscape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCsv = async (asXls = false) => {
    setExporting(true);
    setExportedCount(0);
    setExportTotal(total);
    setExportEtaMs(null);
    setExportRate(0);
    cancelExportRef.current = false;
    setCancelingExport(false);
    const startedAt = performance.now();
    // Exponential moving average smoothing factor for rate (0..1, higher = more reactive).
    const ALPHA = 0.4;
    let smoothedRate = 0; // rows per ms
    try {
      // Refetch with the same filters, no pagination, in chunks of 1000 (Supabase limit).
      const all: MpAuditRow[] = [];
      const CHUNK = 1000;
      let offset = 0;
      // Cap to avoid runaway: 50k rows max.
      const MAX = 50_000;
      let knownTotal = total;
      while (offset < MAX) {
        if (cancelExportRef.current) break;
        let q = supabase
          .from("audit_logs")
          .select("id,action,table_name,created_at,performed_by,new_data", { count: "exact" })
          .order("created_at", { ascending: false });

        if (action === "all") q = q.in("action", ["mp_credentials_check"]);
        else q = q.eq("action", action);
        if (mode !== "all") q = q.eq("new_data->>mode", mode);
        if (okFilter === "ok") q = q.eq("new_data->>ok", "true");
        else if (okFilter === "fail") q = q.eq("new_data->>ok", "false");
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          q = q.lte("created_at", end.toISOString());
        }

        const chunkStart = performance.now();
        const { data, error, count } = await q.range(offset, offset + CHUNK - 1);
        if (error) throw error;
        const chunkElapsed = Math.max(1, performance.now() - chunkStart);
        if (typeof count === "number" && count !== knownTotal) {
          knownTotal = count;
          setExportTotal(count);
        }
        const batch = (data ?? []) as MpAuditRow[];
        all.push(...batch);
        setExportedCount(all.length);

        // Update rate (rows per ms) using EMA, then derive ETA from remaining rows.
        const instantRate = batch.length / chunkElapsed;
        smoothedRate = smoothedRate === 0 ? instantRate : ALPHA * instantRate + (1 - ALPHA) * smoothedRate;
        setExportRate(smoothedRate * 1000); // rows/sec for display
        const remaining = Math.max(0, knownTotal - all.length);
        if (smoothedRate > 0 && remaining > 0) {
          setExportEtaMs(remaining / smoothedRate);
        } else {
          setExportEtaMs(0);
        }

        if (batch.length < CHUNK) break;
        offset += CHUNK;
        // Yield to the event loop so the progress UI updates between chunks.
        await new Promise((r) => setTimeout(r, 0));
      }
      void startedAt;

      if (cancelExportRef.current) {
        toast.info(`Exportação cancelada (${all.length} registro(s) baixado(s))`);
        return;
      }

      if (all.length === 0) {
        toast.info("Nada a exportar para os filtros selecionados.");
        return;
      }

      const headers = [
        "id",
        "created_at",
        "action",
        "mode",
        "ok",
        "reason",
        "account_nickname",
        "account_site",
        "token_masked",
        "mp_payment_id",
        "payment_status",
        "plano",
        "metodo",
        "event_type",
        "request_id",
        "performed_by",
      ];
      const lines = [headers.join(",")];
      for (const r of all) {
        const d = (r.new_data ?? {}) as any;
        lines.push(
          [
            r.id,
            r.created_at,
            r.action,
            d.mode ?? "",
            d.ok === true ? "true" : d.ok === false ? "false" : "",
            d.reason ?? d.error?.message ?? "",
            d.account_nickname ?? "",
            d.account_site ?? "",
            d.token_masked ?? "",
            d.mp_payment_id ?? "",
            d.status ?? "",
            d.plano ?? "",
            d.metodo ?? "",
            d.event_type ?? "",
            d.request_id ?? "",
            r.performed_by ?? "",
          ].map(csvEscape).join(",")
        );
      }

      const mimeType = asXls ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8";
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `mp-audit-logs-${stamp}.${asXls ? 'xls' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exportados ${all.length} registro(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao exportar");
    } finally {
      setExporting(false);
      setExportEtaMs(null);
      setExportRate(0);
      setCancelingExport(false);
      cancelExportRef.current = false;
    }
  };


  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/mp-config")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-lg font-bold">Logs de Auditoria — Mercado Pago</h1>
        <Button variant="ghost" size="icon" onClick={fetchRows} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {/* Filters */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-bold">Filtros</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">Ação</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MP_ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Modo</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="test">Sandbox (test)</SelectItem>
                  <SelectItem value="prod">Produção</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Resultado</Label>
              <Select value={okFilter} onValueChange={setOkFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ok">Sucesso</SelectItem>
                  <SelectItem value="fail">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAction("mp_credentials_check");
                  setMode("all");
                  setOkFilter("all");
                  setFrom("");
                  setTo("");
                  setSearchSearchQuery("");
                }}
              >
                Limpar
              </Button>
            </div>
          </div>
        </Card>

        {/* Results */}
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {loading ? "Carregando…" : `${total} registro(s)`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || exporting || total === 0}
                onClick={() => exportCsv(false)}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {exporting
                  ? exportTotal > 0
                    ? `Exportando ${exportedCount}/${exportTotal}…`
                    : `Exportando ${exportedCount}…`
                  : "Exportar CSV"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || exporting || total === 0}
                onClick={() => exportCsv(true)}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                {exporting
                  ? exportTotal > 0
                    ? `Exportando ${exportedCount}/${exportTotal}…`
                    : `Exportando ${exportedCount}…`
                  : "Exportar Excel (XLS)"}
              </Button>
              {exporting && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cancelingExport}
                  onClick={requestCancelExport}
                  title="Cancelar exportação"
                >
                  {cancelingExport ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  {cancelingExport ? "Cancelando…" : "Cancelar"}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {exporting && (
            <div className="mb-3 space-y-1" role="status" aria-live="polite">
              <Progress
                value={exportTotal > 0 ? Math.min(100, (exportedCount / exportTotal) * 100) : undefined}
                className="h-2"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>
                  {exportTotal > 0
                    ? `Exportando ${exportedCount} de ${exportTotal} registro(s)…`
                    : `Exportando ${exportedCount} registro(s)…`}
                </p>
                <p className="tabular-nums">
                  {exportRate > 0 && <span>{Math.round(exportRate)} reg/s · </span>}
                  <span>ETA: {formatEta(exportEtaMs)}</span>
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado para os filtros selecionados.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const d = (r.new_data ?? {}) as any;
                const ok = d.ok !== false; // Consider ok by default if not explicit false
                const reason = d.reason ?? d.error?.message ?? null;
                const rowMode = d.mode ?? "—";
                const tokenMasked = d.token_masked ?? null;
                const account = d.account_nickname ?? null;
                const mpPaymentId = d.mp_payment_id ?? null;
                const status = d.status ?? d.status_after ?? null;
                const statusBefore = d.status_before ?? null;
                const plano = d.plano ?? null;
                const metodo = d.metodo ?? null;

                return (
                  <li
                    key={r.id}
                    className="rounded-md border bg-card p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {ok ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            {r.action.replace("mp_", "")}
                          </Badge>
                          <Badge variant={rowMode === "prod" ? "default" : "secondary"} className="text-[10px] uppercase">
                            {rowMode}
                          </Badge>
                          {d.ok === true && (
                            <Badge className="bg-green-600 hover:bg-green-600 text-[10px]">SUCESSO</Badge>
                          )}
                          {d.ok === false && (
                            <Badge variant="destructive" className="text-[10px]">
                              FALHA
                            </Badge>
                          )}
                          {status && (
                            <Badge variant="outline" className="text-[10px] uppercase border-amber-500/50 text-amber-600">
                              {status}
                            </Badge>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                            {formatDate(r.created_at)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                          {mpPaymentId && (
                            <div>
                              MP ID: <span className="font-mono font-medium text-foreground">{mpPaymentId}</span>
                            </div>
                          )}
                          {plano && (
                            <div>
                              Plano/Método: <span className="font-medium text-foreground capitalize">{plano} / {metodo}</span>
                            </div>
                          )}
                          {tokenMasked && (
                            <div>
                              Token: <code className="font-mono">{tokenMasked}</code>
                            </div>
                          )}
                          {account && <div>Conta MP: <span className="font-medium text-foreground">{account}</span></div>}
                          {reason && (
                            <div className="col-span-full text-destructive line-clamp-1" title={reason}>
                              Erro: <span className="font-medium">{reason}</span>
                            </div>
                          )}
                          {r.performed_by && (
                            <div className="break-all opacity-70">
                              Usuário: <code className="font-mono">{r.performed_by.slice(0, 8)}…</code>
                            </div>
                          )}
                          <div className="break-all opacity-50">Log ID: <code className="font-mono">{r.id.slice(0, 8)}…</code></div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar exportação?</AlertDialogTitle>
            <AlertDialogDescription>
              {exportTotal > 0
                ? `Já foram baixados ${exportedCount} de ${exportTotal} registro(s). O arquivo CSV não será gerado se você cancelar agora.`
                : `Já foram baixados ${exportedCount} registro(s). O arquivo CSV não será gerado se você cancelar agora.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar exportando</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelExport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
