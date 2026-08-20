import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Copy, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PixTestResponse {
  mode?: "test" | "prod";
  token?: string;
  http_status?: number;
  ok?: boolean;
  payment?: {
    id: number | string;
    status: string;
    status_detail: string;
    qr_code: string | null;
    qr_code_base64_present: boolean;
    ticket_url: string | null;
    date_of_expiration: string | null;
  } | null;
  error_raw?: any;
  error?: string;
  reason?: string;
}

interface CheckResponse {
  ok?: boolean;
  http_status?: number;
  mode?: string;
  payment?: {
    id: number | string;
    status: string;
    status_detail: string;
    transaction_amount?: number;
    date_approved?: string | null;
    date_created?: string | null;
    date_of_expiration?: string | null;
    payment_method_id?: string;
    ticket_url?: string | null;
  } | null;
  error_raw?: any;
}

export default function MpTestPix() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PixTestResponse | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);
  const pollRef = useRef<number | null>(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    setQrBase64(null);
    setCheckResult(null);
    
    // Diagnostic info
    const diag = {
      timestamp: new Date().toISOString(),
      endpoint: "mp-test-pix",
      url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-test-pix`
    };
    console.log("[MP-DIAG] Starting test...", diag);

    try {
      const { data, error } = await supabase.functions.invoke<PixTestResponse>("mp-test-pix", { body: { include_base64: true } });
      
      if (error) {
        console.error("[MP-DIAG] invoke error:", error);
        // Special mapping for 404/NotFound from Supabase
        if (error.message?.includes("404") || (error as any).status === 404) {
          throw new Error(`Erro 404: A função 'mp-test-pix' não foi encontrada no endpoint ${diag.url}. Verifique se o deploy foi concluído.`);
        }
        throw new Error(error.message);
      }
      
      setResult(data ?? null);
      const b64 = (data as any)?.qr_code_base64 ?? null;
      if (b64) setQrBase64(b64);
      if (data?.ok) toast.success(`PIX criado: ${data.payment?.status}`);
      else toast.error(`Falha: ${data?.reason ?? data?.payment?.status_detail ?? data?.error ?? "erro"}`);
    } catch (e: any) {
      console.error("[MP-DIAG] caught exception:", e);
      toast.error(e.message ?? "Erro ao chamar mp-test-pix");
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (silent = false) => {
    const pid = result?.payment?.id;
    if (!pid) return;
    if (!silent) setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke<CheckResponse>("mp-check-payment", {
        body: { payment_id: pid },
      });
      if (error) throw new Error(error.message);
      setCheckResult(data ?? null);
      if (!silent) {
        if (data?.payment?.status === "approved") toast.success("Pagamento APROVADO ✅");
        else toast.message(`Status: ${data?.payment?.status ?? "—"}`);
      }
    } catch (e: any) {
      if (!silent) toast.error(e.message ?? "Erro ao consultar status");
    } finally {
      if (!silent) setChecking(false);
    }
  };

  // Auto-polling every 5s while enabled and not yet approved/rejected
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!autoPoll || !result?.payment?.id) return;
    const finalStatuses = ["approved", "rejected", "cancelled", "refunded"];
    pollRef.current = window.setInterval(() => {
      const cur = checkResult?.payment?.status ?? result?.payment?.status;
      if (cur && finalStatuses.includes(cur)) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      checkStatus(true);
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, result?.payment?.id, checkResult?.payment?.status]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  const p = result?.payment;
  const cur = checkResult?.payment ?? null;
  const liveStatus = cur?.status ?? p?.status;
  const isApproved = liveStatus === "approved";
  const isPending = p?.status === "pending";

  return (
    <div className="min-h-dvh bg-background p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/mp-config")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Teste PIX (sandbox)</h1>
        </div>

        <Card className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Cria um pagamento PIX de <strong>R$ 0,01</strong> direto na API do Mercado Pago usando as credenciais
            ativas (respeita a flag <code>force_test_mode</code>). Não persiste nada no banco.
          </p>
          <Button onClick={runTest} disabled={loading} className="w-full h-14 font-bold">
            {loading ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Criando PIX…</>
            ) : (
              <><RefreshCw className="h-5 w-5 mr-2" /> Criar PIX de teste</>
            )}
          </Button>
        </Card>

        {result && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Resultado</h2>
              <div className="flex items-center gap-2">
                {result.mode && <Badge variant="outline">{result.mode.toUpperCase()}</Badge>}
                {result.ok ? (
                  <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> HTTP {result.http_status}</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> HTTP {result.http_status ?? "—"}</Badge>
                )}
              </div>
            </div>

            {result.token && (
              <div className="text-xs text-muted-foreground">
                Token: <code>{result.token}</code>
              </div>
            )}

            {p && (
              <div className="space-y-2 text-sm border-t pt-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Payment ID</span><span className="font-mono">{p.id}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status (inicial)</span>
                  <Badge className={p.status === "approved" ? "bg-green-600" : p.status === "pending" ? "bg-amber-500" : "bg-destructive"}>
                    {p.status}
                  </Badge>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Detail</span><span className="text-right">{p.status_detail}</span></div>
                {p.date_of_expiration && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Expira</span><span>{new Date(p.date_of_expiration).toLocaleString("pt-BR")}</span></div>
                )}
              </div>
            )}

            {qrBase64 && (
              <div className="border-t pt-3 flex flex-col items-center gap-2">
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt="QR Code PIX"
                  className="w-56 h-56 border rounded"
                />
                <span className="text-xs text-muted-foreground">Escaneie com o app do banco para pagar R$ 0,01</span>
              </div>
            )}

            {p?.qr_code && (
              <div className="border-t pt-3 space-y-2">
                <span className="text-xs text-muted-foreground">PIX Copia e Cola</span>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted p-2 rounded break-all max-h-24 overflow-y-auto">
                    {p.qr_code}
                  </code>
                  <Button size="icon" variant="outline" onClick={() => copy(p.qr_code!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {p?.ticket_url && (
              <Button variant="outline" className="w-full" asChild>
                <a href={p.ticket_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Abrir página do pagamento
                </a>
              </Button>
            )}

            {!result.ok && result.error_raw && (
              <div className="border-t pt-3">
                <span className="text-xs text-destructive font-bold">Erro retornado pelo Mercado Pago</span>
                <pre className="text-xs bg-destructive/10 text-destructive p-2 rounded overflow-x-auto mt-1 max-h-64">
                  {typeof result.error_raw === "string" ? result.error_raw : JSON.stringify(result.error_raw, null, 2)}
                </pre>
              </div>
            )}
          </Card>
        )}

        {p?.id && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <Clock className="h-4 w-4" /> Status do pagamento
              </h2>
              <Badge className={isApproved ? "bg-green-600" : liveStatus === "pending" ? "bg-amber-500" : "bg-destructive"}>
                {liveStatus ?? "—"}
              </Badge>
            </div>

            {cur && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">status_detail</span><span className="text-right break-words">{cur.status_detail}</span></div>
                {cur.transaction_amount != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span>R$ {cur.transaction_amount.toFixed(2)}</span></div>
                )}
                {cur.date_created && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Criado</span><span>{new Date(cur.date_created).toLocaleString("pt-BR")}</span></div>
                )}
                {cur.date_approved && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Aprovado</span><span>{new Date(cur.date_approved).toLocaleString("pt-BR")}</span></div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={autoPoll} onCheckedChange={setAutoPoll} />
                Atualizar a cada 5s
              </label>
              <Button onClick={() => checkStatus(false)} disabled={checking} variant="outline">
                {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Atualizar status
              </Button>
            </div>

            {checkResult?.error_raw && (
              <pre className="text-xs bg-destructive/10 text-destructive p-2 rounded overflow-x-auto max-h-48">
                {typeof checkResult.error_raw === "string" ? checkResult.error_raw : JSON.stringify(checkResult.error_raw, null, 2)}
              </pre>
            )}

            {(cur?.ticket_url || p.ticket_url) && (
              <Button variant="outline" className="w-full" asChild>
                <a href={(cur?.ticket_url || p.ticket_url)!} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Abrir página do pagamento
                </a>
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
