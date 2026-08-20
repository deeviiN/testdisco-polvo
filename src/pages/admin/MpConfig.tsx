import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Copy, ExternalLink, AlertTriangle, Settings, ScrollText, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMpConfigStatus, testMpCredentials, setMpForceTestMode, testMpWebhook, type MpConfigStatus, type MpWebhookTestResult } from "@/lib/mercadoPago";
import { validateMpSecretFormat, validateMpWebhookSecret, type MpSecretName } from "@/lib/mpCredentialValidation";

interface WebhookTestHistoryRow {
  id: string;
  created_at: string;
  data: {
    ok?: boolean;
    http_status?: number;
    upstream_request_id?: string | null;
    webhook_url?: string;
    elapsed_ms?: number;
    response?: unknown;
    triggered_by?: string;
  };
}

export default function MpConfig() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<MpConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<"test" | "prod" | null>(null);
  const [lastResult, setLastResult] = useState<
    { mode: string; ok: boolean; reason: string | null; nickname?: string; site_id?: string } | null
  >(null);
  const [togglingTestMode, setTogglingTestMode] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<MpWebhookTestResult | null>(null);
  const [history, setHistory] = useState<WebhookTestHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewRow, setPreviewRow] = useState<WebhookTestHistoryRow | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, new_data")
        .eq("action", "mp_webhook_test")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setHistory(
        (data ?? []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          data: (r.new_data ?? {}) as WebhookTestHistoryRow["data"],
        })),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar histórico");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const runWebhookTest = async () => {
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await testMpWebhook();
      setWebhookResult(res);
      if (res.ok) toast.success("Webhook respondeu com assinatura válida");
      else toast.error(`Webhook falhou: ${res.reason ?? "erro"}`);
      loadHistory();
    } catch (e: any) {
      setWebhookResult({ ok: false, reason: "client_error", detail: e?.message ?? String(e) });
      toast.error(e?.message ?? "Erro ao testar webhook");
    } finally {
      setTestingWebhook(false);
    }
  };

  const onToggleTestMode = async (enabled: boolean) => {
    setTogglingTestMode(true);
    try {
      await setMpForceTestMode(enabled);
      toast.success(enabled ? "Modo TESTE ativado" : "Modo automático ativado");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao alterar modo");
    } finally {
      setTogglingTestMode(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      setStatus(await getMpConfigStatus());
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    loadHistory();
  }, [loadHistory]);

  const runTest = async (mode: "test" | "prod") => {
    setTesting(mode);
    try {
      const res = await testMpCredentials(mode);
      setLastResult({
        mode: res.mode ?? mode,
        ok: res.ok,
        reason: res.reason,
        nickname: res.account?.nickname,
        site_id: res.account?.site_id,
      });
      if (res.ok) {
        toast.success(`Credenciais válidas (${res.mode})`);
      } else {
        toast.error(`Credenciais inválidas: ${res.reason ?? "erro"}`);
      }
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao testar");
    } finally {
      setTesting(null);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/global")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-lg font-bold">Configuração Mercado Pago</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/mp-test-pix">
            <CheckCircle2 className="mr-2 h-4 w-4" /> Testar PIX
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/mp-audit-logs">
            <ScrollText className="mr-2 h-4 w-4" /> Logs
          </Link>
        </Button>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : status ? (
          <>
            {/* Quick connection test */}
            {(() => {
              const hasProd = status.secrets.MERCADOPAGO_ACCESS_TOKEN_PROD.present;
              const hasTest = status.secrets.MERCADOPAGO_ACCESS_TOKEN_TEST.present;
              const autoMode: "test" | "prod" | null = status.force_test_mode
                ? (hasTest ? "test" : null)
                : (hasProd ? "prod" : hasTest ? "test" : null);
              const disabled = testing !== null || autoMode === null;
              return (
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold">Testar conexão Mercado Pago</h2>
                      <p className="text-xs text-muted-foreground">
                        {autoMode
                          ? `Usa as credenciais do modo ${autoMode === "prod" ? "Produção" : "Sandbox/Teste"} (GET /users/me).`
                          : "Configure ao menos um ACCESS_TOKEN (TEST ou PROD) para testar."}
                      </p>
                    </div>
                    <Button
                      className="h-14 shrink-0 font-bold"
                      disabled={disabled}
                      onClick={() => autoMode && runTest(autoMode)}
                    >
                      {testing !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Testar agora
                    </Button>
                  </div>
                  {lastResult && (
                    <div
                      className={`mt-3 rounded-md border p-3 text-sm ${
                        lastResult.ok ? "border-green-500/30 bg-green-500/5" : "border-destructive/40 bg-destructive/5"
                      }`}
                    >
                      {lastResult.ok ? (
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-bold text-green-700 dark:text-green-400">
                              Conexão bem-sucedida ({lastResult.mode})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Conta: {lastResult.nickname ?? "—"} · Site: {lastResult.site_id ?? "—"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
                          <div>
                            <p className="font-bold text-destructive">Falha na conexão ({lastResult.mode})</p>
                            <p className="text-xs text-muted-foreground">Motivo: {lastResult.reason ?? "desconhecido"}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* Gate banner */}
            <Card
              className={`border-2 p-4 ${
                status.payments_enabled ? "border-green-500/30 bg-green-500/5" : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-start gap-3">
                {status.payments_enabled ? (
                  <CheckCircle2 className="mt-0.5 h-6 w-6 text-green-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-6 w-6 text-destructive" />
                )}
                <div className="flex-1">
                  <p className="font-bold">
                    {status.payments_enabled ? "Pagamentos liberados" : "Pagamentos bloqueados"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {status.payments_enabled
                      ? `Modo ativo: ${status.active_mode === "prod" ? "Produção" : "Sandbox/Teste"}.`
                      : "Sistema só libera pagamentos com credenciais válidas. Configure ou teste abaixo."}
                  </p>
                </div>
              </div>
            </Card>

            {/* Force TEST mode toggle */}
            <Card className="border-2 border-amber-500/40 bg-amber-500/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="font-bold">Forçar ambiente de TESTE</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ative para que todos os checkouts (PIX, Cartão, Boleto) usem as credenciais de
                    sandbox do Mercado Pago. Útil enquanto a conta de produção ainda não está
                    homologada. Use cartões de teste do MP para simular pagamentos.
                  </p>
                  <p className="mt-2 text-xs font-bold">
                    Modo atual:{" "}
                    <span className={status.force_test_mode ? "text-amber-600" : "text-green-600"}>
                      {status.force_test_mode ? "TESTE (forçado)" : "Automático (Produção quando válida)"}
                    </span>
                  </p>
                </div>
                <Switch
                  checked={!!status.force_test_mode}
                  disabled={togglingTestMode || !status.secrets.MERCADOPAGO_ACCESS_TOKEN_TEST.present}
                  onCheckedChange={onToggleTestMode}
                />
              </div>
              {!status.secrets.MERCADOPAGO_ACCESS_TOKEN_TEST.present && (
                <p className="mt-2 text-xs text-destructive">
                  Configure MERCADOPAGO_ACCESS_TOKEN_TEST para ativar este modo.
                </p>
              )}
            </Card>

            {/* Credentials status */}
            {(() => {
              const validations = Object.entries(status.secrets).map(([name, info]) => {
                if (name === "MERCADOPAGO_WEBHOOK_SECRET") {
                  const length = (info as { length?: number | null }).length ?? null;
                  return {
                    name,
                    info,
                    issue: validateMpWebhookSecret(info.present, length),
                  };
                }
                const value =
                  (info as { value?: string | null; masked?: string | null }).value ??
                  (info as { masked?: string | null }).masked ??
                  null;
                return {
                  name,
                  info,
                  issue: validateMpSecretFormat(name as MpSecretName, value, info.present),
                };
              });
              const hasError = validations.some((v) => v.issue?.level === "error");
              const prodTokenIssue = validations.find((v) => v.name === "MERCADOPAGO_ACCESS_TOKEN_PROD")?.issue;
              const prodPubIssue = validations.find((v) => v.name === "MERCADOPAGO_PUBLIC_KEY_PROD")?.issue;
              const webhookIssue = validations.find((v) => v.name === "MERCADOPAGO_WEBHOOK_SECRET")?.issue;
              const webhookHasError = webhookIssue?.level === "error";
              const prodHasError =
                prodTokenIssue?.level === "error" ||
                prodPubIssue?.level === "error" ||
                webhookHasError;
              
              return (
                <>
                  <Card className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="font-bold">Credenciais (armazenadas criptografadas)</h2>
                      {hasError ? (
                        <Badge variant="destructive" className="shrink-0">
                          <XCircle className="mr-1 h-3 w-3" /> Há erros de formato
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 bg-green-600 hover:bg-green-600">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Formato OK
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      {validations.map(({ name, info, issue }) => (
                        <div
                          key={name}
                          className={`rounded-md border bg-card px-3 py-2 ${
                            issue?.level === "error" ? "border-destructive/60" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-xs break-all">{name}</p>
                              {(info as { masked?: string | null }).masked && info.present && (
                                <p className="font-mono text-xs text-muted-foreground">
                                  {(info as { masked?: string | null }).masked}
                                </p>
                              )}
                            </div>
                            {info.present ? (
                              issue?.level === "error" ? (
                                <Badge variant="destructive">
                                  <XCircle className="mr-1 h-3 w-3" /> Inválida
                                </Badge>
                              ) : (
                                <Badge className="bg-green-600 hover:bg-green-600">
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Configurado
                                </Badge>
                              )
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="mr-1 h-3 w-3" /> Faltando
                              </Badge>
                            )}
                          </div>
                          {issue && (
                            <p
                              className={`mt-2 text-xs leading-snug ${
                                issue.level === "error" ? "text-destructive font-medium" : "text-amber-600"
                              }`}
                            >
                              {issue.message}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      ACCESS_TOKEN nunca é exposto no frontend (mostrado mascarado). PUBLIC_KEY é segura para uso no checkout.
                      Para alterar valores, edite os Secrets do backend e recarregue esta página.
                    </p>
                  </Card>

                  {/* Test connection */}
                  <Card className="p-4">
                    <h2 className="mb-3 font-bold">Testar conexão</h2>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Faz <code className="rounded bg-muted px-1">GET /users/me</code> usando o ACCESS_TOKEN
                      do modo escolhido. Resultado é registrado em audit_logs.
                    </p>
                    {webhookHasError && (
                      <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                        Webhook secret inválido — testes de pagamento estão bloqueados até você corrigi-lo. {webhookIssue?.message}
                      </p>
                    )}
                    {prodHasError && !webhookHasError && (
                      <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                        Corrija os erros de formato das credenciais de produção acima antes de testar.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="h-14 font-bold"
                        disabled={
                          testing !== null ||
                          !status.secrets.MERCADOPAGO_ACCESS_TOKEN_TEST.present ||
                          webhookHasError
                        }
                        onClick={() => runTest("test")}
                      >
                        {testing === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Testar Sandbox
                      </Button>
                      <Button
                        className="h-14 font-bold"
                        disabled={
                          testing !== null ||
                          !status.secrets.MERCADOPAGO_ACCESS_TOKEN_PROD.present ||
                          prodHasError
                        }
                        onClick={() => runTest("prod")}
                      >
                        {testing === "prod" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Testar Produção
                      </Button>
                    </div>

                    {lastResult && (
                      <div
                        className={`mt-3 rounded-md border p-3 text-sm ${
                          lastResult.ok ? "border-green-500/30 bg-green-500/5" : "border-destructive/40 bg-destructive/5"
                        }`}
                      >
                        {lastResult.ok ? (
                          <>
                            <p className="font-bold text-green-700 dark:text-green-400">Credenciais válidas</p>
                            <p className="text-xs text-muted-foreground">
                              Modo: {lastResult.mode} · Conta: {lastResult.nickname ?? "—"} · Site: {lastResult.site_id ?? "—"}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-bold text-destructive">Credenciais inválidas</p>
                            <p className="text-xs text-muted-foreground">Motivo: {lastResult.reason ?? "desconhecido"}</p>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                </>
              );
            })()}

            {/* Webhook */}
            <Card className="p-4">
              <h2 className="mb-2 font-bold">Webhook</h2>
              <p className="mb-2 text-sm text-muted-foreground">
                Cadastre esta URL no painel do Mercado Pago em Notificações → Webhooks (eventos de
                pagamento):
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <code className="flex-1 break-all text-xs">{status.webhook_url}</code>
                <Button size="icon" variant="ghost" onClick={() => copy(status.webhook_url)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" asChild>
                  <a href={status.webhook_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A assinatura HMAC do webhook é validada usando MERCADOPAGO_WEBHOOK_SECRET.
              </p>

              <div className="mt-3 border-t pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Testar webhook</p>
                    <p className="text-xs text-muted-foreground">
                      Envia um evento sintético assinado para a URL acima e valida a resposta.
                    </p>
                  </div>
                  <Button
                    className="h-12 shrink-0 font-bold"
                    disabled={testingWebhook || !status.secrets.MERCADOPAGO_WEBHOOK_SECRET.present}
                    onClick={runWebhookTest}
                  >
                    {testingWebhook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Disparar teste
                  </Button>
                </div>

                {webhookResult && (
                  <div
                    className={`mt-3 rounded-md border p-3 text-sm ${
                      webhookResult.ok
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-destructive/40 bg-destructive/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {webhookResult.ok ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold ${webhookResult.ok ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
                          {webhookResult.ok
                            ? "Webhook respondeu e assinatura validada"
                            : `Falha no webhook${webhookResult.reason ? ` (${webhookResult.reason})` : ""}`}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {typeof webhookResult.http_status === "number" && (
                            <li>HTTP: <span className="font-mono">{webhookResult.http_status}</span></li>
                          )}
                          {typeof webhookResult.elapsed_ms === "number" && (
                            <li>Latência: <span className="font-mono">{webhookResult.elapsed_ms} ms</span></li>
                          )}
                          {webhookResult.upstream_request_id && (
                            <li>x-request-id: <span className="font-mono break-all">{webhookResult.upstream_request_id}</span></li>
                          )}
                          {webhookResult.signature && (
                            <>
                              <li>ts: <span className="font-mono">{webhookResult.signature.ts}</span></li>
                              <li>v1: <span className="font-mono">{webhookResult.signature.v1_preview}</span></li>
                              <li className="break-all">manifest: <span className="font-mono">{webhookResult.signature.manifest}</span></li>
                            </>
                          )}
                          {webhookResult.detail && <li className="text-destructive">{webhookResult.detail}</li>}
                        </ul>
                        {webhookResult.response !== undefined && (
                          <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-tight">
{JSON.stringify(webhookResult.response, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!status.secrets.MERCADOPAGO_WEBHOOK_SECRET.present && (
                  <p className="mt-2 text-xs text-destructive">
                    Configure MERCADOPAGO_WEBHOOK_SECRET para habilitar o teste.
                  </p>
                )}
              </div>
            </Card>

            {/* Webhook test history */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-bold">Histórico de testes de webhook</h2>
                <Button variant="ghost" size="sm" disabled={historyLoading} onClick={loadHistory}>
                  {historyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar
                </Button>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {historyLoading ? "Carregando…" : "Nenhum teste registrado ainda."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Data/hora</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">HTTP</th>
                        <th className="px-3 py-2 text-left font-semibold">Motivo</th>
                        <th className="px-3 py-2 text-right font-semibold">Resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => {
                        const ok = row.data?.ok === true;
                        const resp = row.data?.response as { reason?: string } | undefined;
                        const reason = ok
                          ? "—"
                          : (resp && typeof resp === "object" && "reason" in resp ? resp.reason : null)
                            ?? `HTTP ${row.data?.http_status ?? "?"}`;
                        return (
                          <tr key={row.id} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                              {new Date(row.created_at).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-3 py-2">
                              {ok ? (
                                <Badge className="bg-green-600 hover:bg-green-600">
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Sucesso
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="mr-1 h-3 w-3" /> Falha
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{row.data?.http_status ?? "—"}</td>
                            <td className="px-3 py-2 text-xs break-all">{reason}</td>
                            <td className="px-3 py-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => setPreviewRow(row)}>
                                <Eye className="mr-1 h-4 w-4" /> Ver JSON
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Últimos {history.length} testes (audit_logs · mp_webhook_test).
              </p>
            </Card>

            <Dialog open={!!previewRow} onOpenChange={(o) => !o && setPreviewRow(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Resposta do teste de webhook</DialogTitle>
                  <DialogDescription>
                    {previewRow && new Date(previewRow.created_at).toLocaleString("pt-BR")}
                    {previewRow?.data?.upstream_request_id ? (
                      <> · request-id: <span className="font-mono">{previewRow.data.upstream_request_id}</span></>
                    ) : null}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!previewRow) return;
                      navigator.clipboard.writeText(JSON.stringify(previewRow.data, null, 2));
                      toast.success("JSON copiado");
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copiar
                  </Button>
                </div>
                <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-snug">
{previewRow ? JSON.stringify(previewRow.data, null, 2) : ""}
                </pre>
              </DialogContent>
            </Dialog>


            <Card className="p-4">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Settings className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Para editar tokens, acesse o painel de backend do projeto (Connectors → Lovable
                  Cloud → Secrets). Toda tentativa de teste fica registrada em audit_logs com
                  ação <code className="rounded bg-muted px-1">mp_credentials_check</code>.
                </p>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
