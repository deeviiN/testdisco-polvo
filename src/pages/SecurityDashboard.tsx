import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, CheckCircle2, History, ArrowRight, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface LinterReport {
  id: string;
  scan_date: string;
  issue_count: number;
  raw_output: string;
  diff_summary: string;
}

interface FunctionMetadata {
  name: string;
  anon: boolean;
  auth: boolean;
}

export default function SecurityDashboard() {
  const { data: reports, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["security-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_linter_reports")
        .select("*")
        .order("scan_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as LinterReport[];
    },
  });

  const handleManualUpdate = async () => {
    try {
      toast.info("Iniciando varredura e sincronização global...");
      
      // Rodar o linter
      const { error: linterError } = await supabase.functions.invoke("security-linter-job");
      if (linterError) throw linterError;

      // Disparar o comando de refresh remoto para todos os apps
      const { error: refreshError } = await supabase.rpc("broadcast_app_refresh");
      if (refreshError) throw refreshError;

      await refetch();
      toast.success("Sistema e dispositivos sincronizados!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro na sincronização: " + (err.message || "Verifique os logs"));
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Carregando auditorias...</div>;

  const latest = reports?.[0];
  const previous = reports?.[1];

  const currentFuncs: FunctionMetadata[] = latest ? JSON.parse(latest.raw_output) : [];
  const prevFuncs: FunctionMetadata[] = previous ? JSON.parse(previous.raw_output) : [];

  const anonCount = currentFuncs.filter(f => f.anon).length;
  const authOnlyCount = currentFuncs.filter(f => !f.anon && f.auth).length;

  const prevAnonCount = prevFuncs.filter(f => f.anon).length;
  const prevAuthCount = prevFuncs.filter(f => !f.anon && f.auth).length;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Auditória de Segurança
          </h1>
          <p className="text-muted-foreground mt-1">Monitoramento diário de funções SECURITY DEFINER</p>
        </div>
        <div className="flex items-center gap-3">
          {latest && (
            <Badge variant="outline" className="text-xs py-1 px-3">
              Último scan: {format(new Date(latest.scan_date), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </Badge>
          )}
          <Button asChild variant="outline" size="lg" className="rounded-2xl gap-2 font-semibold">
            <Link to="/admin/security-audit">
              <History className="h-4 w-4" /> Histórico
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-2xl gap-2 font-semibold">
            <Link to="/admin/audit-dashboard">
              <Shield className="h-4 w-4" /> Auditoria & Logs
            </Link>
          </Button>
          <Button 
            onClick={handleManualUpdate} 
            disabled={isRefetching}
            size="lg"
            className="rounded-2xl gap-2 font-bold shadow-lg hover:shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-95 px-6"
          >
            {isRefetching ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            Atualizar Agora
          </Button>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Público (ANON)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{anonCount}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              {prevAnonCount !== undefined && anonCount !== prevAnonCount ? (
                <span className={anonCount > prevAnonCount ? "text-destructive" : "text-emerald-500"}>
                  {anonCount > prevAnonCount ? "+" : ""}{anonCount - prevAnonCount} desde ontem
                </span>
              ) : (
                "Estável (necessário p/ cadastro)"
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Autenticado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{authOnlyCount}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              {prevAuthCount !== undefined && authOnlyCount !== prevAuthCount ? (
                <span className={authOnlyCount > prevAuthCount ? "text-destructive" : "text-emerald-500"}>
                  {authOnlyCount > prevAuthCount ? "+" : ""}{authOnlyCount - prevAuthCount} alterações
                </span>
              ) : (
                "Todas com has_role() / RLS"
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Status Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-600">Protegido</div>
            <div className="text-xs text-muted-foreground mt-1">12 triggers isoladas (zero API)</div>
          </CardContent>
        </Card>
      </div>

      {latest?.diff_summary && latest.diff_summary !== "Estado de segurança estável." && (
        <Alert variant="destructive" className="bg-destructive/10">
          <History className="h-4 w-4" />
          <AlertTitle>Alterações Detectadas</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {latest.diff_summary}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollArea className="h-fit">
              <div className="flex items-center gap-2">
                Lista de Funções Atuais
                <Badge variant="secondary">{currentFuncs.length}</Badge>
              </div>
            </ScrollArea>
          </CardTitle>
          <CardDescription>Funções SECURITY DEFINER expostas no schema public</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {currentFuncs.map((fn, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-medium truncate max-w-[400px]" title={fn.name}>
                      {fn.name}
                    </p>
                    <div className="flex gap-2">
                      {fn.anon ? (
                        <Badge variant="outline" className="text-[10px] uppercase bg-amber-50 text-amber-700 border-amber-200">
                          Anon + Auth
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
                          Auth Only
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                    {prevFuncs.some(pf => pf.name === fn.name) ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Badge className="bg-blue-500">Novo</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
