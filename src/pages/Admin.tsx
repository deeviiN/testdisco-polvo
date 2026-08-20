import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { Navigate, useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import {
  Shield, Users, School, CalendarDays, CheckCircle, XCircle,
  Plus, Search, LogOut, BarChart3, UserCheck, UserX, Trash2,
  Upload, Image as ImageIcon, AlertTriangle, Ban, CreditCard,
  Building2, Save, ArrowLeft, RefreshCw, Sparkles, Download, FileJson, FileText, Loader2,
} from "lucide-react";
import AppVersionGateCard from "@/components/admin/AppVersionGateCard";
import LastUpdateLocationCard from "@/components/admin/LastUpdateLocationCard";
import { Tables } from "@/integrations/supabase/types";
import { useLanguage } from "@/hooks/useLanguage";
import { useAdminPendingContracts } from "@/hooks/useAdminPendingContracts";
import { Pencil, Check, UserCog, KeyRound, FlaskConical, Crown, Headphones, Clock, Bell, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchoolSearch } from "@/components/SchoolSearch";
import { AdminSchoolPicker } from "@/components/admin/AdminSchoolPicker";
import { ServidorPickerModal } from "@/components/admin/ServidorPickerModal";
import SubscribedSchoolsList from "@/components/admin/SubscribedSchoolsList";
import { AdminAIAssistant } from "@/components/admin/AdminAIAssistant";
import { AdminAIAssistantPanel } from "@/components/admin/AdminAIAssistantPanel";
import { Eye, MapPin } from "lucide-react";

type Profile = Tables<"profiles">;
type SchoolRow = Tables<"schools">;

const ROLE_LABELS: Record<string, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coord. Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  gestor_pedagogico: "Gestor(a) Pedagógico(a)",
  secretario_escolar: "Assistente de Aluno",
  chef_projeto_vida: "Chef da Sala de Vídeo",
};
const roleLabel = (r?: string | null) => (r ? ROLE_LABELS[r] || r.replace(/_/g, " ") : "—");

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  pending: "Pendente",
};
const EVENT_TYPE_LABELS: Record<string, string> = {
  aula: "Aula",
  evento_escolar: "Evento escolar",
  evento_externo: "Evento externo",
  reuniao: "Reunião",
};
const SECTOR_LABELS: Record<string, string> = {
  projeto_vida: "Sala de Vídeo",
  informatica: "Informática",
  quadra: "Quadra",
  patio: "Pátio",
  auditorio: "Auditório",
};
const labelize = (dict: Record<string, string>, key: string) =>
  dict[key] || key.replace(/_/g, " ");

type ResetReport = {
  deleted_bookings: number;
  deleted_users: number;
  kept_admins: number;
  bookings_breakdown: {
    by_status: Record<string, number>;
    by_event_type: Record<string, number>;
    by_sector: Record<string, number>;
  };
  users_breakdown: {
    by_role: Record<string, number>;
    approved: number;
    pending_approval: number;
  };
};

const buildReportPayload = (r: ResetReport) => ({
  generated_at: new Date().toISOString(),
  app: "Agendamento de Ambiente Escolar",
  report: "reset_dados_teste",
  totals: {
    deleted_bookings: r.deleted_bookings,
    deleted_users: r.deleted_users,
    kept_admins: r.kept_admins,
  },
  bookings: r.bookings_breakdown,
  users: r.users_breakdown,
});

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const tsForFile = () =>
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function downloadResetReportJson(r: ResetReport) {
  const payload = buildReportPayload(r);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `reset-relatorio-${tsForFile()}.json`);
}

async function downloadResetReportPdf(r: ResetReport) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Reset de Dados", margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
  y += 14;
  doc.text("Agendamento de Ambiente Escolar", margin, y);
  y += 18;

  // Totals box
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, pageW - margin * 2, 60, "F");
  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Totais", margin + 10, y + 18);
  doc.setFont("helvetica", "normal");
  doc.text(`Agendamentos removidos: ${r.deleted_bookings}`, margin + 10, y + 34);
  doc.text(`Usuários removidos: ${r.deleted_users}`, margin + 10, y + 48);
  doc.text(
    `Admins preservados: ${r.kept_admins}`,
    pageW / 2,
    y + 34,
  );
  doc.text(
    `Aprovados: ${r.users_breakdown.approved} · Pendentes: ${r.users_breakdown.pending_approval}`,
    pageW / 2,
    y + 48,
  );
  y += 80;

  const renderTable = (
    title: string,
    dict: Record<string, number>,
    labels: Record<string, string>,
  ) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += 6;

    const rows = Object.entries(dict)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [labelize(labels, k), String(v)]);
    if (rows.length === 0) rows.push(["—", "0"]);

    autoTable(doc, {
      startY: y + 4,
      head: [["Categoria", "Quantidade"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [40, 60, 100], textColor: 255 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  };

  renderTable("Agendamentos por status", r.bookings_breakdown.by_status, STATUS_LABELS);
  renderTable("Agendamentos por tipo de evento", r.bookings_breakdown.by_event_type, EVENT_TYPE_LABELS);
  renderTable("Agendamentos por setor", r.bookings_breakdown.by_sector, SECTOR_LABELS);
  renderTable("Usuários por função", r.users_breakdown.by_role, ROLE_LABELS);

  doc.save(`reset-relatorio-${tsForFile()}.pdf`);
}

type ResetStep = "idle" | "deleting" | "json" | "pdf" | "done" | "cancelled";

function ResetResultSummary({
  result, onClose, onGoBookings, onGoUsers, onRetryReports, autoReportStep, autoReportError,
}: {
  result: {
    deleted_bookings: number;
    deleted_users: number;
    kept_admins: number;
    bookings_breakdown: {
      by_status: Record<string, number>;
      by_event_type: Record<string, number>;
      by_sector: Record<string, number>;
    };
    users_breakdown: {
      by_role: Record<string, number>;
      approved: number;
      pending_approval: number;
    };
  };
  onClose: () => void;
  onGoBookings: () => void;
  onGoUsers: () => void;
  onRetryReports: () => void;
  autoReportStep: ResetStep;
  autoReportError: { stage: "json" | "pdf"; message: string; stack?: string; name?: string } | null;
}) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const maskUA = "*** REDACTED — privacy mode ***";
  const maskStack = "*** STACK REDACTED — privacy mode ***";
  const safeUA = () =>
    privacyMode ? maskUA : (typeof navigator !== "undefined" ? navigator.userAgent : "n/a");
  const safeStack = (s?: string) => (privacyMode ? maskStack : (s || "(stack trace não disponível)"));
  const renderBreakdown = (
    dict: Record<string, number>,
    labels: Record<string, string>,
  ) => {
    const entries = Object.entries(dict).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      return <p className="text-xs text-muted-foreground italic">Nenhum registro</p>;
    }
    return (
      <ul className="space-y-1">
        {entries.map(([key, count]) => (
          <li key={key} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground break-words pr-2">
              {labelize(labels, key)}
            </span>
            <Badge variant="secondary" className="font-mono font-bold">
              {count}
            </Badge>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-accent/10 border border-accent/20 p-3 flex items-center gap-3">
        <CheckCircle className="h-5 w-5 text-accent shrink-0" />
        <p className="text-sm">
          <strong>{result.deleted_bookings}</strong> agendamento(s) e{" "}
          <strong>{result.deleted_users}</strong> usuário(s) removidos.
          <br />
          <span className="text-xs text-muted-foreground">
            {result.kept_admins} conta(s) de admin preservada(s).
          </span>
        </p>
      </div>

      {/* Agendamentos */}
      <div className="rounded-xl border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <p className="font-bold text-sm">Agendamentos removidos</p>
          <Badge className="ml-auto">{result.deleted_bookings}</Badge>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Por status
          </p>
          {renderBreakdown(result.bookings_breakdown.by_status, STATUS_LABELS)}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Por tipo de evento
          </p>
          {renderBreakdown(result.bookings_breakdown.by_event_type, EVENT_TYPE_LABELS)}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Por setor
          </p>
          {renderBreakdown(result.bookings_breakdown.by_sector, SECTOR_LABELS)}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-lg gap-2"
          onClick={onGoBookings}
        >
          <CalendarDays className="h-4 w-4" />
          Conferir agendamentos no Dashboard
        </Button>
      </div>

      {/* Usuários */}
      <div className="rounded-xl border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <p className="font-bold text-sm">Usuários removidos</p>
          <Badge className="ml-auto">{result.deleted_users}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-accent/10 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Aprovados</p>
            <p className="text-lg font-extrabold text-accent">{result.users_breakdown.approved}</p>
          </div>
          <div className="rounded-lg bg-warning/10 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Pendentes</p>
            <p className="text-lg font-extrabold text-warning">{result.users_breakdown.pending_approval}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Por função
          </p>
          {renderBreakdown(result.users_breakdown.by_role, ROLE_LABELS)}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-lg gap-2"
          onClick={onGoUsers}
        >
          <Users className="h-4 w-4" />
          Conferir aba Usuários
        </Button>
      </div>

      {/* Download report */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <p className="font-bold text-sm">Baixar relatório</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Salve uma cópia do resumo para auditoria.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg gap-2 font-semibold"
            onClick={() => downloadResetReportJson(result)}
          >
            <FileJson className="h-4 w-4" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg gap-2 font-semibold"
            onClick={() => downloadResetReportPdf(result)}
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
        {autoReportError && (
          <Collapsible className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs font-bold text-destructive">
                Falha ao gerar relatório {autoReportError.stage === "json" ? "JSON" : "PDF"}
              </p>
              <Badge variant="outline" className="ml-auto text-[10px] uppercase">
                etapa: {autoReportError.stage}
              </Badge>
            </div>
            <p className="text-[11px] text-destructive/80 break-words font-mono leading-snug line-clamp-2">
              {autoReportError.message}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {autoReportError.stage === "json"
                ? "O JSON não foi salvo. Tente novamente ou use o botão 'JSON' acima para baixar manualmente."
                : "O PDF falhou (o JSON pode já ter sido baixado). Tente novamente ou use o botão 'PDF' acima."}
            </p>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full h-8 rounded-md gap-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10 [&[data-state=open]>svg]:rotate-180"
              >
                Ver detalhes do erro
                <ChevronDown className="h-3.5 w-3.5 transition-transform" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
              <div className="rounded-md bg-background border border-destructive/20 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    {autoReportError.name || "Error"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 gap-1 text-[10px]"
                    onClick={() => {
                      const txt = `[${autoReportError.stage.toUpperCase()}] ${autoReportError.name || "Error"}: ${autoReportError.message}\n\n${safeStack(autoReportError.stack)}`;
                      navigator.clipboard.writeText(txt);
                      toast.success(privacyMode ? "Detalhes copiados (mascarados)" : "Detalhes copiados");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px]"
                    onClick={async () => {
                      const now = new Date();
                      const rawPayload: Record<string, unknown> = {
                        schema: "lovable.reset.error/v1",
                        context: "admin-reset-test-data:auto-report",
                        stage: autoReportError.stage,
                        timestamp: now.toISOString(),
                        timestamp_unix_ms: now.getTime(),
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
                        privacy_mode: privacyMode,
                        user_agent: privacyMode
                          ? null
                          : (typeof navigator !== "undefined" ? navigator.userAgent : null),
                        url: typeof window !== "undefined" ? window.location.href : null,
                        error: {
                          message: autoReportError.message,
                          name: autoReportError.name || "Error",
                          stack: privacyMode ? null : (autoReportError.stack || null),
                          stage: autoReportError.stage,
                        },
                      };
                      // Ordena chaves alfabeticamente em todos os níveis para padronização
                      const sortKeys = (v: unknown): unknown => {
                        if (Array.isArray(v)) return v.map(sortKeys);
                        if (v && typeof v === "object") {
                          return Object.keys(v as Record<string, unknown>)
                            .sort()
                            .reduce<Record<string, unknown>>((acc, k) => {
                              acc[k] = sortKeys((v as Record<string, unknown>)[k]);
                              return acc;
                            }, {});
                        }
                        return v;
                      };
                      const payload = sortKeys(rawPayload);
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                        toast.success(privacyMode ? "JSON copiado (padronizado, sem dados sensíveis)" : "JSON do erro copiado (padronizado)");
                      } catch {
                        toast.error("Não foi possível copiar o JSON");
                      }
                    }}
                  >
                    <FileJson className="h-3 w-3" />
                    Copiar JSON
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px]"
                    onClick={() => {
                      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                      const content =
                        `Relatório de erro — Reset de dados de teste\n` +
                        `Gerado em: ${new Date().toISOString()}\n` +
                        `Modo privacidade: ${privacyMode ? "ATIVADO" : "desativado"}\n` +
                        `User-Agent: ${safeUA()}\n` +
                        `\n========================================\n` +
                        `Etapa: ${autoReportError.stage.toUpperCase()}\n` +
                        `Tipo: ${autoReportError.name || "Error"}\n` +
                        `Mensagem: ${autoReportError.message}\n` +
                        `========================================\n\n` +
                        `Stack trace:\n${safeStack(autoReportError.stack)}\n`;
                      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `reset-erro-${autoReportError.stage}${privacyMode ? "-privado" : ""}-${ts}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success(privacyMode ? "Relatório baixado (.txt mascarado)" : "Relatório de erro baixado (.txt)");
                    }}
                  >
                    <Download className="h-3 w-3" />
                    Baixar .txt
                  </Button>
                </div>
                <label
                  htmlFor="reset-error-privacy"
                  className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-2 py-1.5 cursor-pointer"
                >
                  <Switch
                    id="reset-error-privacy"
                    checked={privacyMode}
                    onCheckedChange={setPrivacyMode}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold leading-tight">
                      Modo privacidade
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight break-words">
                      Mascara <strong>user-agent</strong> e <strong>stack trace</strong> ao copiar/baixar.
                    </p>
                  </div>
                </label>
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-words leading-snug text-foreground/90 max-h-48 overflow-auto">
{autoReportError.message}
                </pre>
                {autoReportError.stack ? (
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-words leading-snug text-muted-foreground border-t border-destructive/10 pt-1.5 max-h-64 overflow-auto">
{autoReportError.stack}
                  </pre>
                ) : (
                  <p className="text-[10px] italic text-muted-foreground border-t border-destructive/10 pt-1.5">
                    Stack trace não disponível para este erro.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        {(autoReportStep === "cancelled") && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="w-full rounded-lg gap-2 font-bold mt-1"
            onClick={onRetryReports}
          >
            <RefreshCw className="h-4 w-4" />
            {autoReportError ? "Tentar novamente após erro" : "Tentar novamente geração automática"}
          </Button>
        )}
        {autoReportStep === "done" && (
          <p className="text-[11px] text-accent font-semibold flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            JSON e PDF baixados automaticamente.
          </p>
        )}
      </div>

      <Button
        className="w-full h-11 rounded-xl font-bold"
        onClick={onClose}
      >
        Fechar
      </Button>
    </div>
  );
}


function ResetProgressIndicator({
  step,
  onCancel,
}: {
  step: ResetStep;
  onCancel?: () => void;
}) {
  const steps: { key: Exclude<ResetStep, "idle" | "cancelled">; label: string }[] = [
    { key: "deleting", label: "Removendo dados de teste" },
    { key: "json", label: "Gerando relatório JSON" },
    { key: "pdf", label: "Gerando relatório PDF" },
    { key: "done", label: "Concluído" },
  ];
  const isCancelled = step === "cancelled";
  const currentIdx = isCancelled
    ? steps.length
    : Math.max(0, steps.findIndex((s) => s.key === step));
  const progress = isCancelled
    ? 100
    : step === "idle"
    ? 0
    : ((currentIdx + (step === "done" ? 1 : 0.5)) / steps.length) * 100;

  // Cancel só é possível durante geração de relatório (json/pdf), não durante deleção.
  const canCancel = step === "json" || step === "pdf";

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          {step === "done" ? (
            <CheckCircle className="h-5 w-5 text-accent" />
          ) : isCancelled ? (
            <XCircle className="h-5 w-5 text-warning" />
          ) : (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          )}
          <p className="text-sm font-bold">
            {step === "done"
              ? "Tudo pronto!"
              : isCancelled
              ? "Geração de relatórios cancelada"
              : "Processando reset..."}
          </p>
        </div>
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              isCancelled ? "bg-warning" : "bg-primary"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-right font-mono">
          {Math.round(progress)}%
        </p>
      </div>

      <ul className="space-y-2">
        {steps.map((s, idx) => {
          const isDone = idx < currentIdx || step === "done";
          const isActive = !isCancelled && idx === currentIdx && step !== "done";
          return (
            <li
              key={s.key}
              className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                isActive
                  ? "border-primary bg-primary/5"
                  : isDone
                  ? "border-accent/40 bg-accent/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle className="h-5 w-5 text-accent" />
                ) : isActive ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                )}
              </div>
              <span
                className={`text-sm font-semibold ${
                  isActive ? "text-foreground" : isDone ? "text-accent" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      {!isCancelled && step !== "done" && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-lg gap-2 font-semibold"
            disabled={!canCancel}
            onClick={onCancel}
          >
            <Ban className="h-4 w-4" />
            Cancelar geração de relatórios
          </Button>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {step === "deleting" ? (
              <>
                ⚠️ A remoção dos dados está em andamento no servidor e <strong>não pode ser cancelada</strong> aqui.
                O cancelamento será liberado quando começar a geração dos relatórios JSON e PDF.
              </>
            ) : (
              <>
                Cancelar agora <strong>não desfaz a remoção</strong> dos dados — apenas pula o
                download automático dos relatórios. Você ainda poderá baixá-los manualmente no resumo.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function SchoolCard({ school, payment, onUploadLogo, onDelete, onUpdate, onOpen, onCancelPlan }: {
  school: SchoolRow;
  payment?: { status: "paid" | "expired" | "none"; validade: string | null; tipo: string | null };
  onUploadLogo: (s: SchoolRow) => void;
  onDelete: (id: string) => void;
  onUpdate: () => void;
  onOpen: (id: string) => void;
  onCancelPlan: (s: SchoolRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(school.name);
  const [saving, setSaving] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim() || name === school.name) {
      setEditing(false);
      setName(school.name);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("schools").update({ name: name.trim() }).eq("id", school.id);
    if (error) {
      toast.error("Erro ao salvar nome: " + error.message);
      setName(school.name);
    } else {
      toast.success("Nome atualizado!");
      onUpdate();
    }
    setSaving(false);
    setEditing(false);
  };

  const handleStatusChange = async (status: string) => {
    const updateData: { subscription_status: string; subscription_end_date?: string | null } = { subscription_status: status };
    if (status === "grace_period") {
      updateData.subscription_end_date = new Date().toISOString().split("T")[0];
    }
    if (status === "active") {
      updateData.subscription_end_date = null;
    }
    const { error } = await supabase.from("schools").update(updateData).eq("id", school.id);
    if (error) {
      toast.error("Erro: " + error.message);
    } else {
      toast.success(
        status === "active" ? "Escola liberada! ✅" :
        status === "grace_period" ? "Escola em período de carência ⚠️" :
        "Escola bloqueada 🚫"
      );
      onUpdate();
    }
  };

  const statusConfig = {
    active: { label: "Ativa", color: "bg-accent/10 text-accent border-accent/20", icon: CheckCircle },
    grace_period: { label: "Carência", color: "bg-warning/10 text-warning border-warning/20", icon: AlertTriangle },
    blocked: { label: "Bloqueada", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Ban },
  };

  const current = statusConfig[(school as any).subscription_status as keyof typeof statusConfig] || statusConfig.active;
  const StatusIcon = current.icon;

  return (
    <Card className="border-0 shadow-card hover:shadow-card-hover transition-all">
      <CardContent className="p-4 space-y-3">
        {/* Top row: logo + name + actions */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 cursor-pointer"
            onClick={() => onOpen(school.id)}
          >
            {school.logo_url ? (
              <img src={school.logo_url} alt={school.name} className="w-full h-full object-cover" />
            ) : (
              <School className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(school.id)}>
            {editing ? (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 rounded-lg bg-secondary/50 border-0 text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 rounded-lg text-accent hover:text-accent hover:bg-accent/10"
                  onClick={handleSaveName}
                  disabled={saving}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm leading-tight break-words whitespace-normal">{school.name}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {school.city} — {school.state}
              {school.inep_code && ` • INEP: ${school.inep_code}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8"
              onClick={(e) => { e.stopPropagation(); onUploadLogo(school); }}
              title="Enviar logo"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
              onClick={(e) => { e.stopPropagation(); onDelete(school.id); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Enter school button */}
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl gap-2 text-xs font-semibold border-primary/20 text-primary hover:bg-primary/10 hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onOpen(school.id); }}
          >
            <CalendarDays className="h-4 w-4" />
            Ver agendamentos e usuários
          </Button>
        </div>

        {/* Subscription control */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Acesso:</span>
            <Badge variant="outline" className={`text-[10px] rounded-lg ${current.color}`} title="Liberação operacional definida pelo administrador">
              <StatusIcon className="h-3 w-3 mr-1" />
              {current.label}
            </Badge>
          </div>
          <div className="ml-auto">
            <Select
              value={(school as any).subscription_status || "active"}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="h-7 text-xs rounded-lg bg-secondary/50 border-0 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">✅ Ativa</SelectItem>
                <SelectItem value="grace_period">⚠️ Carência</SelectItem>
                <SelectItem value="blocked">🚫 Bloqueada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Real payment status (independent of operational access) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Pagamento:</span>
          {(() => {
            const ps = payment?.status ?? "none";
            const cfg =
              ps === "paid"
                ? { label: "Pago", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", Icon: CheckCircle }
                : ps === "expired"
                ? { label: "Vencido", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", Icon: AlertTriangle }
                : { label: "Sem assinatura", color: "bg-muted text-muted-foreground border-border", Icon: Ban };
            const Icon = cfg.Icon;
            return (
              <Badge
                variant="outline"
                className={`text-[10px] rounded-lg ${cfg.color}`}
                title={
                  payment?.validade
                    ? `Validade: ${new Date(payment.validade).toLocaleDateString("pt-BR")}${payment.tipo ? ` • Plano: ${payment.tipo}` : ""}`
                    : "Sem registro de pagamento aprovado"
                }
              >
                <Icon className="h-3 w-3 mr-1" />
                {cfg.label}
              </Badge>
            );
          })()}
          {payment?.validade && (
            <span className="text-[10px] text-muted-foreground">
              até {new Date(payment.validade).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>

        {/* Cancel plan + wipe everything linked to this school */}
        <div className="pt-2 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl gap-2 text-xs font-semibold border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onCancelPlan(school); }}
            title="Cancela o plano da escola e exclui todos os cadastros (usuários, agendamentos, pagamentos) ligados a ela. Admins são preservados."
          >
            <Ban className="h-4 w-4" />
            Cancelar plano e excluir cadastros
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { count: pendingContractsCount, pending: pendingContractsList, isRefreshing: pendingContractsRefreshing, lastUpdatedAt: pendingContractsUpdatedAt } = useAdminPendingContracts(true);
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [servidorModalOpen, setServidorModalOpen] = useState(false);
  const [pickedSchool, setPickedSchool] = useState<{ id: string; name: string } | null>(null);
  const [profiles, setProfiles] = useState<(Profile & { school_name?: string; school_city?: string; school_state?: string })[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsTotalCount, setSchoolsTotalCount] = useState(0);
  const [schoolsPage, setSchoolsPage] = useState(0);
  const [schoolsPageSize, setSchoolsPageSize] = useState<number>(50);
  const [availableStates, setAvailableStates] = useState<{ state: string; school_count: number }[]>([]);
  const [availableCities, setAvailableCities] = useState<{ city: string; school_count: number }[]>([]);
  const [searchUsers, setSearchUsers] = useState("");
  const [searchSchools, setSearchSchools] = useState("");
  const [debouncedSearchSchools, setDebouncedSearchSchools] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [networkFilter, setNetworkFilter] = useState<"all" | "estadual" | "municipal" | "federal" | "particular">("all");
  const [newSchool, setNewSchool] = useState({ name: "", city: "", state: "", inep_code: "" });
  const [schoolDialogOpen, setSchoolDialogOpen] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({ totalUsers: 0, approvedUsers: 0, pendingUsers: 0, totalSchools: 0, totalBookings: 0, subscribedSchools: 0 });
  const [activeTab, setActiveTab] = useState("users");
  const [subStatusFilter, setSubStatusFilter] = useState<"all" | "subscribed" | "blocked">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "expired" | "none">("all");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "pending" | "approved">("all");
  const [userDateFrom, setUserDateFrom] = useState<string>("");
  const [userDateTo, setUserDateTo] = useState<string>("");
  const [usersPage, setUsersPage] = useState(1);
  const USERS_PAGE_SIZE = 20;
  const [companySettings, setCompanySettings] = useState({
    id: "",
    razao_social: "", cnpj: "", address: "", number: "", neighborhood: "",
    city: "", state: "", cep: "", phone: "", email: "",
    representative_name: "", representative_cpf: "",
  });
  const [savingCompany, setSavingCompany] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmName, setResetConfirmName] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetStep, setResetStep] = useState<"idle" | "deleting" | "json" | "pdf" | "done" | "cancelled">("idle");
  const resetCancelRef = useRef(false);
  const [autoReportError, setAutoReportError] = useState<{ stage: "json" | "pdf"; message: string; stack?: string; name?: string } | null>(null);
  const [resetSchoolScope, setResetSchoolScope] = useState<string>("__all__");
  const [resetSchoolList, setResetSchoolList] = useState<{ id: string; name: string; city?: string | null; state?: string | null }[]>([]);
  const [resetSchoolListLoading, setResetSchoolListLoading] = useState(false);
  const [tempPwdState, setTempPwdState] = useState<{
    open: boolean;
    loading: boolean;
    fullName: string;
    email: string;
    password: string;
    copyCount: number;
  }>({ open: false, loading: false, fullName: "", email: "", password: "", copyCount: 0 });
  const [tempPwdTargetId, setTempPwdTargetId] = useState<string | null>(null);

  const handleSetTempPassword = async (userId: string, fullName: string) => {
    if (!confirm(`Gerar uma nova senha temporária para "${fullName}"?\n\nA senha atual será substituída e mostrada apenas UMA vez.`)) return;
    try {
      setTempPwdTargetId(userId);
      setTempPwdState({ open: true, loading: true, fullName, email: "", password: "", copyCount: 0 });
      const { data, error } = await supabase.functions.invoke("admin-user-details", {
        body: { user_id: userId, action: "set_temp_password" },
      });
      if (error) throw error;
      const d = data as { success?: boolean; email?: string; temp_password?: string; error?: string };
      if (!d?.success || !d.temp_password) throw new Error(d?.error || "Falha ao gerar senha");
      setTempPwdState({ open: true, loading: false, fullName, email: d.email || "", password: d.temp_password, copyCount: 0 });
    } catch (e) {
      setTempPwdState({ open: false, loading: false, fullName: "", email: "", password: "", copyCount: 0 });
      toast.error((e as Error).message || "Erro ao gerar senha temporária");
    } finally {
      setTempPwdTargetId(null);
    }
  };
  const [resetResult, setResetResult] = useState<null | {
    deleted_bookings: number;
    deleted_users: number;
    kept_admins: number;
    bookings_breakdown: {
      by_status: Record<string, number>;
      by_event_type: Record<string, number>;
      by_sector: Record<string, number>;
    };
    users_breakdown: {
      by_role: Record<string, number>;
      approved: number;
      pending_approval: number;
    };
  }>(null);

  const loadCompanySettings = useCallback(async () => {
    const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setCompanySettings({
        id: data.id,
        razao_social: data.razao_social || "",
        cnpj: data.cnpj || "",
        address: data.address || "",
        number: data.number || "",
        neighborhood: data.neighborhood || "",
        city: data.city || "",
        state: data.state || "",
        cep: data.cep || "",
        phone: data.phone || "",
        email: data.email || "",
        representative_name: data.representative_name || "",
        representative_cpf: data.representative_cpf || "",
      });
    }
  }, []);

  const handleSaveCompanySettings = async () => {
    setSavingCompany(true);
    const payload = { ...companySettings };
    const id = payload.id;
    delete (payload as any).id;

    if (id) {
      const { error } = await supabase.from("company_settings").update(payload).eq("id", id);
      if (error) toast.error("Erro: " + error.message);
      else toast.success("Dados da empresa salvos!");
    } else {
      const { data, error } = await supabase.from("company_settings").insert(payload).select().single();
      if (error) toast.error("Erro: " + error.message);
      else {
        toast.success("Dados da empresa salvos!");
        if (data) setCompanySettings((prev) => ({ ...prev, id: data.id }));
      }
    }
    setSavingCompany(false);
  };

  useEffect(() => {
    if (user) checkAdmin();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      loadProfiles();
      loadStats();
      loadCompanySettings();
      loadAvailableStates();
    }
  }, [isAdmin]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchSchools(searchSchools), 300);
    return () => clearTimeout(t);
  }, [searchSchools]);

  // Reset page on filter or page-size changes
  useEffect(() => {
    setSchoolsPage(0);
  }, [stateFilter, cityFilter, networkFilter, debouncedSearchSchools, schoolsPageSize]);

  // Effect at line 320 area
  // Load schools server-side whenever filters/page change
  useEffect(() => {
    if (isAdmin) loadSchools();
     
  }, [isAdmin, stateFilter, cityFilter, networkFilter, debouncedSearchSchools, schoolsPage, schoolsPageSize]);

  const checkAdmin = async () => {
    const { data } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
    setIsAdmin(!!data);
  };

  const loadStats = async () => {
    const { data, error } = await (supabase as any).rpc("get_admin_dashboard_counts");
    if (error) {
      toast.error("Erro ao carregar indicadores do painel");
      return;
    }
    const counts = data?.[0];
    setStats({
      totalUsers: Number(counts?.total_users || 0),
      approvedUsers: Number(counts?.approved_users || 0),
      pendingUsers: Number(counts?.pending_users || 0),
      totalSchools: Number(counts?.total_schools || 0),
      totalBookings: Number(counts?.total_bookings || 0),
      subscribedSchools: Number(counts?.subscribed_schools || 0),
    });
  };

  const loadProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      const schoolIds = [...new Set(data.map((p) => p.school_id).filter(id => id !== null))];
      const { data: schoolsData } = schoolIds.length > 0 
        ? await supabase
          .from("schools")
          .select("id, name, city, state")
          .in("id", schoolIds)
        : { data: [] };

      const schoolMap = new Map((schoolsData as any[])?.map((s) => [s.id, s]) || []);
      setProfiles(data.map((p) => {
        const sch = p.school_id ? schoolMap.get(p.school_id) as any : null;
        return {
          ...p,
          school_name: sch?.name || "—",
          school_city: sch?.city || undefined,
          school_state: sch?.state || undefined,
        };
      }));
    }
  };

  const loadAvailableStates = async () => {
    const { data } = await supabase.rpc("list_school_states_admin");
    setAvailableStates((data as any) || []);
  };

  const loadAvailableCities = async (state: string) => {
    if (state === "all") {
      setAvailableCities([]);
      return;
    }
    const { data } = await supabase.rpc("list_school_cities_admin", { _state: state });
    setAvailableCities((data as any) || []);
  };

  const [paymentBySchool, setPaymentBySchool] = useState<Record<string, { status: "paid" | "expired" | "none"; validade: string | null; tipo: string | null }>>({});

  const loadSchools = async () => {
    setSchoolsLoading(true);
    const { data, error } = await supabase.rpc("list_schools_admin_paginated", {
      _state: stateFilter === "all" ? null : stateFilter,
      _city: cityFilter === "all" ? null : cityFilter,
      _network: networkFilter === "all" ? null : networkFilter,
      _search: debouncedSearchSchools.trim() || null,
      _limit: schoolsPageSize,
      _offset: schoolsPage * schoolsPageSize,
    });
    if (error) {
      toast.error("Erro ao carregar escolas: " + error.message);
      setSchools([]);
      setSchoolsTotalCount(0);
    } else {
      const rows = (data as any[]) || [];
      const cleaned = rows.map((r) => {
        const { total_count, ...rest } = r;
        return rest;
      });
      setSchools(cleaned);
      setSchoolsTotalCount(rows[0]?.total_count ?? 0);

      // Fetch real payment status (assinaturas) for these schools
      const ids = cleaned.map((s: any) => s.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: subs } = await supabase
          .from("assinaturas")
          .select("school_id, status, validade, tipo, updated_at")
          .in("school_id", ids)
          .order("updated_at", { ascending: false });
        const map: Record<string, { status: "paid" | "expired" | "none"; validade: string | null; tipo: string | null }> = {};
        const now = Date.now();
        (subs || []).forEach((row: any) => {
          if (map[row.school_id]) return; // keep latest only
          const isActive = row.status === "ativo" && row.validade && new Date(row.validade).getTime() > now;
          map[row.school_id] = {
            status: isActive ? "paid" : "expired",
            validade: row.validade ?? null,
            tipo: row.tipo ?? null,
          };
        });
        setPaymentBySchool(map);
      } else {
        setPaymentBySchool({});
      }
    }
    setSchoolsLoading(false);
  };

  const toggleApproval = async (profileId: string, currentStatus: boolean) => {
    // Admin global só pode revogar (aprovação é feita pelo gestor da escola)
    if (!currentStatus) {
      toast.info("Aprovação cabe ao gestor da escola.", {
        description: "O administrador global não aprova cadastros novos.",
      });
      return;
    }

    const reason = window.prompt(
      "Motivo da revogação de acesso (opcional):\n\nFica registrado no log de auditoria.",
      ""
    );
    // null = usuário cancelou o prompt
    if (reason === null) return;

    const loadingId = toast.loading("Revogando acesso...");
    const { error } = await (supabase as any).rpc("admin_revoke_profile_access", {
      _profile_id: profileId,
      _reason: reason.trim() || null,
    });

    if (error) {
      toast.error("Não foi possível revogar o acesso.", {
        id: loadingId,
        description: error.message,
      });
    } else {
      toast.success(t("admin.accessRevoked"), {
        id: loadingId,
        description: reason.trim()
          ? `Motivo: ${reason.trim()}`
          : "O usuário não poderá mais acessar até nova aprovação do gestor.",
      });
      loadProfiles();
      loadStats();
    }
  };

  const approveAsIntended = async (profileId: string, intendedRole: string) => {
    const isManager = intendedRole === "gestor_pedagogico" || intendedRole === "chef_projeto_vida";

    // Gestores recebem trial de 7 dias via RPC dedicada
    if (isManager) {
      const { error } = await (supabase as any).rpc("admin_approve_gestor_trial", {
        _profile_id: profileId,
      });
      if (error) {
        toast.error("Erro ao aprovar gestor: " + error.message);
      } else {
        toast.success(`Aprovado como ${roleLabel(intendedRole)} · trial de 7 dias`);
        loadProfiles();
        loadStats();
      }
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: true, role: intendedRole, intended_role: null })
      .eq("id", profileId);

    if (error) {
      toast.error("Erro ao promover: " + error.message);
    } else {
      toast.success(`Aprovado como ${roleLabel(intendedRole)}`);
      loadProfiles();
      loadStats();
    }
  };

  const handleDeleteUser = async (profileId: string, userId: string, fullName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${fullName}"? Esta ação não pode ser desfeita.`)) return;

    const reason = window.prompt(
      `Motivo da exclusão de "${fullName}" (opcional):\n\nFica registrado no log de auditoria.`,
      ""
    );
    if (reason === null) return;

    const loadingId = toast.loading(`Excluindo "${fullName}"...`);

    // 1) Registra no audit log ANTES de deletar (perfil ainda existe para capturar school_id)
    const { error: auditError } = await (supabase as any).rpc("admin_log_profile_deletion", {
      _profile_id: profileId,
      _user_id: userId,
      _full_name: fullName,
      _reason: reason.trim() || null,
    });
    if (auditError) {
      toast.error("Erro ao registrar auditoria. Exclusão cancelada.", {
        id: loadingId,
        description: auditError.message,
      });
      return;
    }

    const { error: profileError } = await supabase.from("profiles").delete().eq("id", profileId);
    if (profileError) {
      toast.error("Erro ao excluir perfil.", { id: loadingId, description: profileError.message });
      return;
    }

    const { error: fnError } = await supabase.functions.invoke("delete-user", {
      body: { user_id: userId },
    });

    if (fnError) {
      toast.warning("Perfil removido, mas a conta de login não foi excluída.", {
        id: loadingId,
        description: fnError.message,
      });
    } else {
      toast.success(t("admin.userDeleted"), {
        id: loadingId,
        description: reason.trim()
          ? `${fullName} removido. Motivo: ${reason.trim()}`
          : `${fullName} foi removido permanentemente.`,
      });
    }

    loadProfiles();
    loadStats();
  };

  const handleResetTestData = async () => {
    if (!profile?.full_name || resetConfirmName.trim() !== profile.full_name.trim()) {
      toast.error("Nome de confirmação não confere");
      return;
    }
    setResetting(true);
    setResetStep("deleting");
    resetCancelRef.current = false;
    const toastId = toast.loading("Resetando dados de teste...");
    const body: Record<string, unknown> = {};
    if (resetSchoolScope && resetSchoolScope !== "__all__") body.school_id = resetSchoolScope;
    const { data, error } = await supabase.functions.invoke("admin-reset-test-data", { body });
    if (error) {
      setResetting(false);
      setResetStep("idle");
      toast.error("Erro: " + error.message, { id: toastId });
      return;
    }
    toast.success("Reset concluído com sucesso", { id: toastId });
    const report = data as ResetReport;
    setResetConfirmName("");
    loadProfiles();
    loadStats();
    // Geração automática dos relatórios (JSON + PDF) ao concluir
    setResetting(false);
    setResetResult(report);
    await runAutoReports(report);
  };

  const runAutoReports = async (report: ResetReport) => {
    resetCancelRef.current = false;
    setAutoReportError(null);
    let stage: "json" | "pdf" = "json";
    try {
      if (resetCancelRef.current) throw new Error("__cancelled__");
      stage = "json";
      setResetStep("json");
      downloadResetReportJson(report);
      await new Promise((r) => setTimeout(r, 400));
      if (resetCancelRef.current) throw new Error("__cancelled__");
      stage = "pdf";
      setResetStep("pdf");
      await downloadResetReportPdf(report);
      if (resetCancelRef.current) throw new Error("__cancelled__");
      setResetStep("done");
      toast.success("Relatórios JSON e PDF baixados automaticamente");
    } catch (e: any) {
      if (e?.message === "__cancelled__") {
        setResetStep("cancelled");
        toast.message("Geração de relatórios cancelada. Use o botão de tentar novamente ou baixe manualmente.");
      } else {
        const msg = e?.message || String(e) || "Erro desconhecido";
        setAutoReportError({ stage, message: msg, stack: e?.stack, name: e?.name });
        setResetStep("cancelled");
        toast.error(`Falha ao gerar ${stage === "json" ? "JSON" : "PDF"}: ${msg}`);
      }
    }
  };

  const handleCancelSchoolPlan = async (s: SchoolRow) => {
    const first = window.confirm(
      `⚠️ Cancelar o plano da escola "${s.name}" e EXCLUIR PERMANENTEMENTE todos os cadastros ligados a ela?\n\n` +
      `Serão removidos: usuários (exceto admins globais), agendamentos, pagamentos, assinaturas, contratos e históricos.\n\n` +
      `Esta ação NÃO pode ser desfeita.`
    );
    if (!first) return;
    const confirmText = window.prompt(`Para confirmar, digite o nome exato da escola:\n\n${s.name}`);
    if (!confirmText || confirmText.trim() !== s.name.trim()) {
      toast.error("Nome não confere. Operação cancelada.");
      return;
    }
    const toastId = toast.loading(`Cancelando plano e excluindo cadastros de "${s.name}"...`);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-test-data", {
        body: { school_id: s.id },
      });
      if (error) throw error;

      const { error: upErr } = await supabase
        .from("schools")
        .update({ subscription_status: "blocked", subscription_end_date: null })
        .eq("id", s.id);
      if (upErr) throw upErr;

      const report = data as { deleted_bookings?: number; deleted_users?: number };
      toast.success(
        `Plano cancelado. Removidos ${report?.deleted_users ?? 0} usuário(s) e ${report?.deleted_bookings ?? 0} agendamento(s).`,
        { id: toastId }
      );
      loadSchools();
      loadStats();
      loadProfiles();
    } catch (e: any) {
      toast.error(`Falha ao cancelar plano: ${e?.message ?? e}`, { id: toastId });
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 2MB");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (schoolId: string): Promise<string | null> => {
    if (!logoFile) return null;
    const ext = logoFile.name.split(".").pop();
    const path = `${schoolId}.${ext}`;

    const { error } = await supabase.storage
      .from("school-logos")
      .upload(path, logoFile, { upsert: true });

    if (error) {
      toast.error("Erro ao enviar logo: " + error.message);
      return null;
    }

    const { data } = supabase.storage.from("school-logos").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchool.name || !newSchool.city || !newSchool.state) {
      toast.error("Preencha nome, cidade e estado");
      return;
    }

    setUploadingLogo(true);

    const { data: schoolData, error } = await supabase.from("schools").insert({
      name: newSchool.name.trim(),
      city: newSchool.city.trim(),
      state: newSchool.state.trim().toUpperCase(),
      inep_code: newSchool.inep_code.trim() || null,
    }).select().single();

    if (error) {
      toast.error("Erro: " + error.message);
      setUploadingLogo(false);
      return;
    }

    if (logoFile && schoolData) {
      const logoUrl = await uploadLogo(schoolData.id);
      if (logoUrl) {
        await supabase.from("schools").update({ logo_url: logoUrl }).eq("id", schoolData.id);
      }
    }

    toast.success(t("admin.schoolRegistered"));
    setNewSchool({ name: "", city: "", state: "", inep_code: "" });
    setLogoFile(null);
    setLogoPreview(null);
    setSchoolDialogOpen(false);
    setUploadingLogo(false);
    loadSchools();
    loadStats();
  };

  const handleUploadLogoForSchool = async (school: SchoolRow) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Logo deve ter no máximo 2MB");
        return;
      }

      const ext = file.name.split(".").pop();
      const path = `${school.id}.${ext}`;
      const { error } = await supabase.storage
        .from("school-logos")
        .upload(path, file, { upsert: true });

      if (error) {
        toast.error("Erro ao enviar logo: " + error.message);
        return;
      }

      const { data } = supabase.storage.from("school-logos").getPublicUrl(path);
      await supabase.from("schools").update({ logo_url: data.publicUrl }).eq("id", school.id);
      toast.success(t("admin.logoUpdated"));
      loadSchools();
    };
    input.click();
  };

  const handleDeleteSchool = async (schoolId: string) => {
    const { error } = await supabase.from("schools").delete().eq("id", schoolId);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success(t("admin.schoolRemoved"));
      loadSchools();
      loadStats();
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("admin.checkingPermissions")}</div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  const filteredProfiles = profiles.filter((p) => {
    // Admin global só lida com pendentes de gestor (gestores não podem se autoaprovar).
    // Cadastros pendentes de outros cargos ficam apenas com o gestor da escola.
    if (!p.is_approved) {
      const effectiveRole = p.intended_role || p.role;
      if (effectiveRole !== "gestor_pedagogico") return false;
    }
    if (userStatusFilter === "pending" && p.is_approved) return false;
    if (userStatusFilter === "approved" && !p.is_approved) return false;
    if (userDateFrom) {
      const fromMs = new Date(userDateFrom + "T00:00:00").getTime();
      if (new Date(p.created_at).getTime() < fromMs) return false;
    }
    if (userDateTo) {
      const toMs = new Date(userDateTo + "T23:59:59.999").getTime();
      if (new Date(p.created_at).getTime() > toMs) return false;
    }
    const q = searchUsers.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.school_name?.toLowerCase().includes(q) ?? false) ||
      (p.school_city?.toLowerCase().includes(q) ?? false) ||
      (p.school_state?.toLowerCase().includes(q) ?? false)
    );
  });

  const filteredProfilesCount = filteredProfiles.length;
  const usersTotalPages = Math.max(1, Math.ceil(filteredProfilesCount / USERS_PAGE_SIZE));
  const usersCurrentPage = Math.min(usersPage, usersTotalPages);
  const paginatedProfiles = filteredProfiles.slice(
    (usersCurrentPage - 1) * USERS_PAGE_SIZE,
    usersCurrentPage * USERS_PAGE_SIZE,
  );

  const filteredSchools = schools.filter((s) => {
    if (subStatusFilter === "subscribed" && !(!!(s as any).subscription_end_date && ["active", "grace_period"].includes((s as any).subscription_status))) return false;
    if (subStatusFilter === "blocked" && (s as any).subscription_status !== "blocked") return false;
    if (paymentFilter !== "all") {
      const ps = paymentBySchool[s.id]?.status ?? "none";
      if (ps !== paymentFilter) return false;
    }
    return true;
  });
  const totalSchoolsPages = Math.max(1, Math.ceil(schoolsTotalCount / schoolsPageSize));

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <AdminAIAssistant />
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b" data-testid="admin-header">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 pt-16 pb-3 sm:py-3 sm:pr-36 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={goBack}
              className="w-8 h-8 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow shrink-0">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold font-display leading-tight break-words">{t("admin.title")}</h1>
              <p className="text-xs text-muted-foreground break-words">{t("admin.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="rounded-xl gap-2" asChild>
              <a href="/home">
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">{t("admin.viewApp")}</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2"
              onClick={() => navigate("/profile")}
              title="Editar meus dados de perfil"
            >
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">Meu perfil</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { if (confirm(t("toolbar.logoutConfirm"))) signOut(); }}
              className="rounded-xl hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-2 sm:px-4 pt-2 sm:pt-3 pb-4 sm:pb-6 space-y-3 sm:space-y-6 flex-1 overflow-y-auto overscroll-contain">
        {pendingContractsCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("/admin/contracts?filter=awaiting_admin")}
            className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-destructive/10 border-2 border-destructive/40 text-destructive hover:bg-destructive/15 active:scale-[0.99] transition-all animate-pulse-red"
          >
            <div className="flex items-center gap-3 text-left">
              <FileText className="h-5 w-5 shrink-0" strokeWidth={2.2} />
              <p className="text-sm font-bold leading-tight">
                {pendingContractsCount === 1
                  ? "1 contrato pendente para assinar"
                  : `${pendingContractsCount} contratos pendentes para assinar`}
              </p>
            </div>
            <span className="min-w-[24px] h-6 px-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center shadow">
              {pendingContractsCount}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("/admin/documentos")}
          className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-primary/10 border-2 border-primary/40 text-primary-foreground hover:bg-primary/20 active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3 text-left">
            <FileText className="h-5 w-5 shrink-0 text-accent" strokeWidth={2.2} />
            <p className="text-sm font-bold leading-tight text-accent">
              Gaveta de Documentos · busca por escola, tipo, status
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-accent" />
        </button>
        {/* Action mini-panel — 2x2 outer + center cutout (Login admin), same style as stats grid */}
        {(() => {
          const actions = [
            { key: "teste-mp", label: "Teste MP", icon: FlaskConical, onClick: () => navigate("/admin/mp-test-pix") },
            { key: "suporte", label: "Suporte", icon: Headphones, onClick: () => navigate("/admin/support-contact") },
            { key: "prazos", label: "Prazos", icon: Clock, onClick: () => navigate("/admin/deadlines") },
            { key: "bloqueados", label: "Bloqueados", icon: ShieldAlert, onClick: () => navigate("/admin/blocked-by-deadline") },
            { key: "alertas", label: "Alertas", icon: Bell, onClick: () => navigate("/admin/notifications") },
          ];
          const centerAction = { key: "login-admin", label: "Login admin", icon: Crown, onClick: () => navigate("/admin/login") };

          const A_VB_W = 200;
          const A_VB_H = 70;
          const a_btnW = 96;
          const a_btnH = 30;
          const a_gap = 3;
          const a_cutW = a_btnW + a_gap * 2;
          const a_cutH = a_btnH + a_gap * 2;
          const a_cutX = (A_VB_W - a_cutW) / 2;
          const a_cutY = (A_VB_H - a_cutH) / 2;
          const a_cutR = 7;
          const aRoundedCutPath = `M${a_cutX + a_cutR} ${a_cutY}H${a_cutX + a_cutW - a_cutR}Q${a_cutX + a_cutW} ${a_cutY} ${a_cutX + a_cutW} ${a_cutY + a_cutR}V${a_cutY + a_cutH - a_cutR}Q${a_cutX + a_cutW} ${a_cutY + a_cutH} ${a_cutX + a_cutW - a_cutR} ${a_cutY + a_cutH}H${a_cutX + a_cutR}Q${a_cutX} ${a_cutY + a_cutH} ${a_cutX} ${a_cutY + a_cutH - a_cutR}V${a_cutY + a_cutR}Q${a_cutX} ${a_cutY} ${a_cutX + a_cutR} ${a_cutY}Z`;
          const aMaskSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${A_VB_W} ${A_VB_H}' preserveAspectRatio='none'><path fill='white' fill-rule='evenodd' d='M0 0H${A_VB_W}V${A_VB_H}H0Z ${aRoundedCutPath}'/></svg>`;
          const aMaskUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(aMaskSvg)}")`;

          return (
            <div className="w-full max-w-md mx-auto">
              <div className="relative" style={{ aspectRatio: "200 / 70" }}>
                <div
                  className="absolute inset-0 grid grid-cols-2 grid-rows-2"
                  style={{
                    gap: 3,
                    WebkitMaskImage: aMaskUrl,
                    maskImage: aMaskUrl,
                    WebkitMaskSize: "100% 100%",
                    maskSize: "100% 100%",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                  }}
                >
                  {actions.map(({ key, label, icon: Icon, onClick }, i) => {
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const corner = `${col === 0 ? 16 : 14}px ${col === 1 ? 16 : 14}px ${col === 1 && row === 1 ? 16 : 14}px ${col === 0 && row === 1 ? 16 : 14}px`;
                    const stacked = key === "prazos" || key === "alertas";
                    const justify = stacked ? "justify-center" : col === 0 ? "justify-start" : "justify-end";
                    const items = stacked ? "items-center" : row === 0 ? "items-start" : "items-end";
                    const padding = stacked
                      ? { paddingTop: row === 0 ? 4 : 2, paddingBottom: row === 1 ? 4 : 2, paddingLeft: col === 0 ? 18 : 4, paddingRight: col === 1 ? 18 : 4 }
                      : {
                          paddingTop: row === 0 ? 6 : 2,
                          paddingBottom: row === 1 ? 6 : 2,
                          paddingLeft: col === 0 ? 18 : 4,
                          paddingRight: col === 1 ? 18 : 4,
                        };
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={onClick}
                        className={`relative flex ${stacked ? "flex-col gap-0.5" : "flex-row gap-1.5"} ${items} ${justify} text-primary-foreground bg-gradient-to-br from-primary to-primary/80 transition-all duration-300 hover:brightness-125 active:scale-95 cursor-pointer`}
                        style={{
                          borderRadius: corner,
                          boxShadow: "inset 0 1.5px 5px hsla(45, 90%, 75%, 0.20), inset 0 -2px 8px hsla(220, 85%, 5%, 0.45), 0 6px 18px hsla(220, 80%, 5%, 0.5)",
                          ...padding,
                        }}
                      >
                        <Icon className={`${stacked ? "h-5 w-5" : "h-6 w-6"} text-accent shrink-0`} strokeWidth={1.8} />
                        <p className={`${stacked ? "text-sm" : "text-base"} font-bold uppercase tracking-wider text-primary-foreground/95 leading-none whitespace-nowrap`}>
                          {label}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Center horizontal button — Login admin */}
                <div
                  className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{ width: `${(a_btnW / A_VB_W) * 100}%`, height: `${(a_btnH / A_VB_H) * 100}%` }}
                >
                  <button
                    type="button"
                    onClick={centerAction.onClick}
                    className="relative flex flex-row items-center justify-center gap-2 w-full h-full text-primary-foreground transition-all duration-300 hover:brightness-125 active:scale-95 overflow-hidden px-3"
                    style={{
                      borderRadius: 14,
                      background: "radial-gradient(ellipse at 30% 25%, hsla(210, 75%, 42%, 1) 0%, hsla(220, 70%, 22%, 1) 55%, hsla(225, 80%, 12%, 1) 100%)",
                      boxShadow: "inset 0 2px 6px hsla(45, 90%, 75%, 0.30), inset 0 -3px 10px hsla(220, 85%, 5%, 0.55), 0 2px 5px hsla(220, 80%, 5%, 0.35)",
                      border: "1.5px solid hsla(45, 90%, 65%, 0.55)",
                    }}
                  >
                    <centerAction.icon className="h-4 w-4 text-accent shrink-0" strokeWidth={1.8} />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-accent leading-none">
                      {centerAction.label}
                    </p>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <Button
          onClick={() => navigate("/admin/push-test")}
          variant="outline"
          className="w-full h-12 font-bold gap-2"
        >
          <Bell className="h-4 w-4" />
          Teste de Push (notificações)
        </Button>

        {/* Stats — 3x2 grid + 1 center horizontal rectangle (Contratos) */}
        {(() => {
          const outerStats = [
            { key: "users", label: t("admin.usersTab"), value: stats.totalUsers, icon: Users, onClick: () => setActiveTab("users") },
            { key: "approved", label: t("admin.approved"), value: stats.approvedUsers, icon: UserCheck, onClick: () => { setUserStatusFilter("approved"); setActiveTab("users"); } },
            { key: "pending", label: t("admin.pending"), value: stats.pendingUsers, icon: UserX, onClick: () => { setUserStatusFilter("pending"); setActiveTab("users"); } },
            { key: "schools", label: "Escolas Cad.", value: stats.totalSchools, icon: School, onClick: () => { setSubStatusFilter("all"); setActiveTab("schools"); } },
            { key: "subscribed", label: "Com plano", value: stats.subscribedSchools, icon: CreditCard, onClick: () => navigate("/admin/global") },
            { key: "bookings", label: "Agend.", value: stats.totalBookings, icon: BarChart3, onClick: undefined as undefined | (() => void) },
          ];
          const centerStat = { key: "contracts", label: "Contratos", icon: FileText, onClick: () => navigate(pendingContractsCount > 0 ? "/admin/contracts?filter=awaiting_admin" : "/admin/contracts") };

          // Center rectangle dims (in % of grid box) — the SVG path creates a real transparent cutout in all 6 buttons.
          const VB_W = 300; // viewBox width (3 cols)
          const VB_H = 240; // viewBox height (2 rows) -> matches aspect 3/2.4
          const btnW = 168; // button width inside viewBox
          const btnH = 64;  // button height inside viewBox
          const gap = 3;    // ~1mm em volta do botão (≈3.78px no viewport mobile)
          const cutW = btnW + gap * 2;
          const cutH = btnH + gap * 2;
          const cutX = (VB_W - cutW) / 2;
          const cutY = (VB_H - cutH) / 2;
          const cutR = 16;
          const roundedCutPath = `M${cutX + cutR} ${cutY}H${cutX + cutW - cutR}Q${cutX + cutW} ${cutY} ${cutX + cutW} ${cutY + cutR}V${cutY + cutH - cutR}Q${cutX + cutW} ${cutY + cutH} ${cutX + cutW - cutR} ${cutY + cutH}H${cutX + cutR}Q${cutX} ${cutY + cutH} ${cutX} ${cutY + cutH - cutR}V${cutY + cutR}Q${cutX} ${cutY} ${cutX + cutR} ${cutY}Z`;
          const maskSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${VB_W} ${VB_H}' preserveAspectRatio='none'><path fill='white' fill-rule='evenodd' d='M0 0H${VB_W}V${VB_H}H0Z ${roundedCutPath}'/></svg>`;
          const maskUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(maskSvg)}")`;

          return (
            <div className="w-full max-w-md mx-auto">
              <div className="relative" style={{ aspectRatio: "3 / 2.4" }}>
                <div
                  className="absolute inset-0 grid grid-cols-3 grid-rows-2"
                  style={{
                    gap: 3,
                    WebkitMaskImage: maskUrl,
                    maskImage: maskUrl,
                    WebkitMaskSize: "100% 100%",
                    maskSize: "100% 100%",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                  }}
                >
                  {outerStats.map(({ key, label, value, icon: Icon, onClick }, i) => {
                    const col = i % 3;
                    const row = Math.floor(i / 3);
                    // Outer corner rounding — outermost corner 18px; inner corners that meet the central cutout share the cutout radius (16px) for perfect alignment
                    const outerCorner = `${col === 0 ? 18 : 16}px ${col === 2 ? 18 : 16}px ${col === 2 && row === 1 ? 18 : 16}px ${col === 0 && row === 1 ? 18 : 16}px`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={onClick}
                        disabled={!onClick}
                        className={`relative flex flex-col items-center justify-center text-primary-foreground bg-gradient-to-br from-primary to-primary/80 transition-all duration-300 hover:brightness-125 active:scale-95 ${onClick ? "cursor-pointer" : "cursor-default opacity-90"}`}
                        style={{
                          borderRadius: outerCorner,
                          boxShadow: "inset 0 1.5px 5px hsla(45, 90%, 75%, 0.20), inset 0 -2px 8px hsla(220, 85%, 5%, 0.45), 0 6px 18px hsla(220, 80%, 5%, 0.5)",
                          padding: 8,
                        }}
                      >
                        <Icon
                          className="h-5 w-5 text-accent relative z-10"
                          strokeWidth={1.8}
                          style={{ marginTop: row === 0 ? "-10px" : "18px" }}
                        />
                        <p className="text-2xl font-extrabold font-display leading-none tracking-tight text-accent relative z-10 mt-1">
                          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
                        </p>
                        <p className="text-base font-bold uppercase tracking-wider text-primary-foreground/90 text-center px-1 leading-tight mt-1 max-w-[14ch] relative z-10">
                          {label}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Center horizontal rectangle button — Contratos */}
                <div
                  className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{ width: `${(btnW / VB_W) * 100}%`, height: `${(btnH / VB_H) * 100}%` }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={centerStat.onClick}
                        aria-label="Contratos — mostra apenas contratos pendentes para assinar"
                        className={`relative flex flex-row items-center justify-center gap-2 w-full h-full text-primary-foreground bg-gradient-to-br from-primary to-primary/80 transition-all duration-300 hover:brightness-125 active:scale-95 overflow-hidden px-3 ${pendingContractsCount > 0 ? "animate-pulse-red" : ""}`}
                        style={{
                          borderRadius: 16,
                          boxShadow: "inset 0 1.5px 5px hsla(45, 90%, 75%, 0.20), inset 0 -2px 8px hsla(220, 85%, 5%, 0.45), 0 6px 18px hsla(220, 80%, 5%, 0.5)",
                        }}
                      >
                        <centerStat.icon className="h-6 w-6 text-accent shrink-0" strokeWidth={1.8} />
                        <p className="text-base font-bold uppercase tracking-wider text-primary-foreground/95 leading-none whitespace-nowrap">
                          {centerStat.label}
                        </p>
                        {pendingContractsCount > 0 && (
                          <span className="absolute top-1 right-1 z-30 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shadow-lg ring-2 ring-background">
                            {pendingContractsCount}
                          </span>
                        )}
                        {pendingContractsRefreshing && (
                          <Loader2 className="absolute bottom-1 right-1 z-30 h-3.5 w-3.5 text-accent animate-spin drop-shadow" aria-label="Atualizando" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm text-left">
                      <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {pendingContractsRefreshing && <Loader2 className="h-3 w-3 animate-spin" />}
                          {pendingContractsRefreshing ? "Atualizando…" : "Última atualização"}
                        </span>
                        <span className="font-mono">
                          {pendingContractsUpdatedAt
                            ? pendingContractsUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                            : "—"}
                        </span>
                      </div>
                      {pendingContractsList.length === 0 ? (
                        <p className="text-xs">Nenhum contrato pendente</p>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold">Pendências por escola:</p>
                          <ul className="space-y-1 text-xs">
                            {pendingContractsList.slice(0, 8).map((item) => {
                              const parts: string[] = [];
                              if (item.needsAdmin) parts.push("admin");
                              if (item.needsGestor) parts.push("gestor");
                              if (item.needsPayment) parts.push("pagamento");
                              return (
                                <li key={item.schoolId} className="leading-tight">
                                  <span className="font-medium">{item.schoolName}</span>
                                  <span className="text-muted-foreground"> — falta {parts.join(", ")}</span>
                                </li>
                              );
                            })}
                            {pendingContractsList.length > 8 && (
                              <li className="text-muted-foreground italic">
                                +{pendingContractsList.length - 8} outras escolas
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Seletor rápido: entrar como gestor local de qualquer escola */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <RefreshCw className="h-4 w-4" />
                Limpar cache de buscas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar cache de buscas?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso remove todas as entradas de cache e sessão relacionadas a buscas de escolas no seu navegador, e em seguida recarrega a página. Nenhum dado do banco será apagado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    try {
                      const purge = (storage: Storage) => {
                        const keys: string[] = [];
                        for (let i = 0; i < storage.length; i++) {
                          const k = storage.key(i);
                          if (!k) continue;
                          if (/school|escola|inep|search|busca|cache|paginat/i.test(k)) {
                            keys.push(k);
                          }
                        }
                        keys.forEach((k) => storage.removeItem(k));
                        return keys.length;
                      };
                      const removedLocal = purge(localStorage);
                      const removedSession = purge(sessionStorage);
                      toast.success("Cache de buscas limpo", {
                        description: `Removidas ${removedLocal + removedSession} entradas. Recarregando…`,
                      });
                      setTimeout(() => window.location.reload(), 600);
                    } catch (e) {
                      toast.error("Não foi possível limpar o cache", {
                        description: e instanceof Error ? e.message : "Erro desconhecido",
                      });
                    }
                  }}
                >
                  Sim, limpar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <AdminSchoolPicker onPick={(id, name) => { setPickedSchool({ id, name }); setServidorModalOpen(true); }} />
        <ServidorPickerModal
          open={servidorModalOpen}
          onOpenChange={setServidorModalOpen}
          schoolId={pickedSchool?.id ?? null}
          schoolName={pickedSchool?.name ?? ""}
        />


        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-stretch gap-2">
            <TabsList className="rounded-xl bg-secondary p-1 h-auto grid grid-cols-4 flex-1 gap-1">
              <TabsTrigger value="users" className="rounded-lg flex-col sm:flex-row gap-1 sm:gap-2 py-2 text-[11px] sm:text-sm data-[state=active]:shadow-sm">
                <Users className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("admin.usersTab")}</span>
              </TabsTrigger>
              <TabsTrigger value="schools" className="rounded-lg flex-col sm:flex-row gap-1 sm:gap-2 py-2 text-[11px] sm:text-sm data-[state=active]:shadow-sm">
                <School className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("admin.schoolsTab")}</span>
              </TabsTrigger>
              <TabsTrigger value="company" className="rounded-lg flex-col sm:flex-row gap-1 sm:gap-2 py-2 text-[11px] sm:text-sm data-[state=active]:shadow-sm">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("admin.companyTab")}</span>
              </TabsTrigger>
              <TabsTrigger value="version" className="rounded-lg flex-col sm:flex-row gap-1 sm:gap-2 py-2 text-[11px] sm:text-sm data-[state=active]:shadow-sm">
                <RefreshCw className="h-4 w-4 shrink-0" />
                <span className="truncate">Versão</span>
              </TabsTrigger>
            </TabsList>

            {/* Reset test data — same row as tabs */}
            <Dialog
              open={resetDialogOpen}
              onOpenChange={async (o) => {
                setResetDialogOpen(o);
                if (!o) {
                  setResetConfirmName("");
                  setResetResult(null);
                  setResetStep("idle");
                  setResetSchoolScope("__all__");
                } else if (resetSchoolList.length === 0) {
                  setResetSchoolListLoading(true);
                  // Base tem 180k+ escolas: pagina em lotes de 1000 para evitar 500.
                  const PAGE_SIZE = 1000;
                  const acc: Array<{ id: string; name: string; city: string; state: string }> = [];
                  let offset = 0;
                  let keepGoing = true;
                  while (keepGoing) {
                    const { data, error } = await supabase.rpc("list_schools_admin_paginated", {
                      _state: null,
                      _city: null,
                      _network: null,
                      _search: null,
                      _limit: PAGE_SIZE,
                      _offset: offset,
                    });
                    if (error) break;
                    const rows = (data ?? []) as any[];
                    acc.push(...rows.map((s) => ({ id: s.id, name: s.name, city: s.city, state: s.state })));
                    if (rows.length < PAGE_SIZE) keepGoing = false;
                    else {
                      offset += PAGE_SIZE;
                      if (offset > 50000) keepGoing = false;
                    }
                  }
                  setResetSchoolList(acc);
                  setResetSchoolListLoading(false);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  title="Resetar dados de teste"
                  className="rounded-xl gap-1.5 font-semibold shrink-0 px-3 self-stretch"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Resetar</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    {resetResult ? "Reset concluído" : "Confirmar reset de dados"}
                  </DialogTitle>
                </DialogHeader>

                {resetting && !resetResult ? (
                  <ResetProgressIndicator
                    step={resetStep}
                    onCancel={() => {
                      resetCancelRef.current = true;
                    }}
                  />
                ) : !resetResult ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-school-scope" className="text-xs font-semibold">
                        Escopo do reset
                      </Label>
                      <Select value={resetSchoolScope} onValueChange={setResetSchoolScope}>
                        <SelectTrigger id="reset-school-scope" className="h-11 rounded-xl">
                          <SelectValue placeholder={resetSchoolListLoading ? "Carregando escolas..." : "Selecionar escopo"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="__all__">
                            <span className="font-bold">Todas as escolas</span>
                          </SelectItem>
                          {resetSchoolList.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="break-words">
                                {s.name}
                                {s.city ? ` — ${s.city}${s.state ? `/${s.state}` : ""}` : ""}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {resetSchoolScope === "__all__"
                          ? "Apaga agendamentos e usuários de todas as escolas (admins preservados)."
                          : "Apaga apenas agendamentos e usuários da escola selecionada."}
                      </p>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Esta ação é <strong>irreversível</strong>. Para confirmar, digite seu nome de admin exatamente como aparece abaixo:
                    </p>
                    <div className="rounded-lg bg-secondary px-3 py-2 text-sm font-mono font-bold break-words">
                      {profile?.full_name ?? "—"}
                    </div>
                    <Label htmlFor="reset-confirm-name" className="text-xs font-semibold">
                      Digite seu nome para liberar o botão
                    </Label>
                    <Input
                      id="reset-confirm-name"
                      value={resetConfirmName}
                      onChange={(e) => setResetConfirmName(e.target.value.slice(0, 200))}
                      placeholder="Seu nome completo"
                      className="h-11 rounded-xl"
                      autoComplete="off"
                      maxLength={200}
                    />
                    <Button
                      variant="destructive"
                      className="w-full h-12 rounded-xl gap-2 font-bold"
                      disabled={
                        resetting ||
                        !profile?.full_name ||
                        resetConfirmName.trim() !== (profile?.full_name ?? "").trim()
                      }
                      onClick={handleResetTestData}
                    >
                      <Trash2 className="h-4 w-4" />
                      {resetting
                        ? "Resetando..."
                        : resetSchoolScope === "__all__"
                          ? "Confirmar e resetar tudo"
                          : "Confirmar e resetar esta escola"}
                    </Button>
                  </div>
                ) : (
                  <ResetResultSummary
                    result={resetResult}
                    onClose={() => setResetDialogOpen(false)}
                    onGoBookings={() => {
                      setResetDialogOpen(false);
                      navigate("/today-bookings");
                    }}
                    onGoUsers={() => {
                      setResetDialogOpen(false);
                      setActiveTab("users");
                    }}
                    onRetryReports={() => {
                      if (resetResult) runAutoReports(resetResult);
                    }}
                    autoReportStep={resetStep}
                    autoReportError={autoReportError}
                  />
                )}
              </DialogContent>
            </Dialog>
          </div>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <AdminAIAssistantPanel />
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("admin.searchUserSchool")}
                  value={searchUsers}
                  onChange={(e) => { setSearchUsers(e.target.value); setUsersPage(1); }}
                  className="pl-10 h-11 rounded-xl bg-secondary/50 border-0"
                />
              </div>
            </div>

            {/* Filtro de intervalo de datas (cadastro) */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs font-semibold text-muted-foreground">De</label>
                <Input
                  type="date"
                  value={userDateFrom}
                  max={userDateTo || undefined}
                  onChange={(e) => { setUserDateFrom(e.target.value); setUsersPage(1); }}
                  className="h-11 rounded-xl bg-secondary/50 border-0"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs font-semibold text-muted-foreground">Até</label>
                <Input
                  type="date"
                  value={userDateTo}
                  min={userDateFrom || undefined}
                  onChange={(e) => { setUserDateTo(e.target.value); setUsersPage(1); }}
                  className="h-11 rounded-xl bg-secondary/50 border-0"
                />
              </div>
              {(userDateFrom || userDateTo) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 rounded-xl text-xs font-bold"
                  onClick={() => { setUserDateFrom(""); setUserDateTo(""); setUsersPage(1); }}
                >
                  Limpar datas
                </Button>
              )}
            </div>

            {/* Filtro de status */}
            <div className="grid grid-cols-3 gap-2">
              {([
                { k: "all", label: `Todos (${stats.totalUsers})` },
                { k: "pending", label: `Pendentes (${stats.pendingUsers})` },
                { k: "approved", label: `Aprovados (${stats.approvedUsers})` },
              ] as const).map((opt) => (
                <Button
                  key={opt.k}
                  variant={userStatusFilter === opt.k ? "default" : "outline"}
                  size="sm"
                  className={`rounded-xl text-xs font-bold h-10 ${
                    userStatusFilter === opt.k && opt.k === "pending" ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""
                  }`}
                  onClick={() => { setUserStatusFilter(opt.k); setUsersPage(1); }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {(() => {
              const hasUsersFilter =
                searchUsers.trim().length >= 2 ||
                !!userDateFrom ||
                !!userDateTo ||
                userStatusFilter !== "all";
              if (!hasUsersFilter) {
                return (
                  <Card className="border-0 shadow-card">
                    <CardContent className="py-10 text-center text-muted-foreground space-y-2">
                      <Users className="h-10 w-10 mx-auto opacity-30" />
                      <p className="text-sm font-semibold">Lista de profissionais oculta</p>
                      <p className="text-xs">
                        Digite ao menos 2 letras, escolha um intervalo de datas ou filtre por status para listar os usuários.
                      </p>
                      <p className="text-[11px] opacity-70">
                        Para ações por escola, use <strong>Entrar como gestor local</strong> acima.
                      </p>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })()}

            <div className={
              (searchUsers.trim().length >= 2 || userDateFrom || userDateTo || userStatusFilter !== "all")
                ? "flex items-center justify-between text-xs text-muted-foreground px-1"
                : "hidden"
            }>
              <span className="font-semibold">{filteredProfilesCount} resultado{filteredProfilesCount === 1 ? "" : "s"}</span>
              {usersTotalPages > 1 && (
                <span>Página {usersCurrentPage} de {usersTotalPages}</span>
              )}
            </div>

            <div className={
              (searchUsers.trim().length >= 2 || userDateFrom || userDateTo || userStatusFilter !== "all")
                ? "space-y-3"
                : "hidden"
            }>

              {paginatedProfiles.map((p) => (
                <Card key={p.id} className="border-0 shadow-card hover:shadow-card-hover transition-all">
                  <CardContent className="p-5 space-y-4">
                    {/* Header: icon + name + status badge */}
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        p.is_approved ? "bg-accent/10" : "bg-warning/10"
                      }`}>
                        <Users className={`h-6 w-6 ${p.is_approved ? "text-accent" : "text-warning"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base leading-snug break-words whitespace-normal">{p.full_name}</p>
                        <Badge
                          variant="outline"
                          className={`mt-1.5 text-xs rounded-lg ${
                            p.is_approved
                              ? "bg-accent/10 text-accent border-accent/20"
                              : "bg-warning/10 text-warning border-warning/20"
                          }`}
                        >
                          {p.is_approved ? <CheckCircle className="h-3.5 w-3.5 mr-1" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1" />}
                          {p.is_approved ? t("admin.approvedStatus") : t("admin.pendingStatus")}
                        </Badge>
                      </div>
                    </div>

                    {/* Info rows */}
                    <div className="space-y-2 pl-1">
                      <div className="flex items-start gap-2">
                        <School className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium break-words">{p.school_name}</span>
                          {(p.school_city || p.school_state) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="break-words">
                                {[p.school_city, p.school_state].filter(Boolean).join(" / ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">{roleLabel(p.role)}</span>
                      </div>
                      {(p as any).intended_role && (p as any).intended_role !== p.role && (
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm font-semibold text-primary">
                            Quer ser: {roleLabel((p as any).intended_role)}
                          </span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">📱 {p.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                      {!p.is_approved && (
                        <Button
                          size="sm"
                          className="w-full rounded-xl gap-2 text-xs font-bold h-11 bg-accent text-accent-foreground hover:bg-accent/90"
                          onClick={() => approveAsIntended(p.id, ((p as any).intended_role || p.role) as string)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Aprovar como {roleLabel(((p as any).intended_role || p.role) as string)}
                        </Button>
                      )}
                      <div className="flex items-center gap-2">
                        {p.is_approved && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-xl gap-2 text-xs font-semibold border-destructive/20 text-destructive hover:bg-destructive/10"
                            onClick={() => toggleApproval(p.id, p.is_approved)}
                          >
                            <XCircle className="h-4 w-4" />
                            {t("admin.revokeAccess")}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className={`${p.is_approved ? "" : "flex-1"} rounded-xl gap-2 text-xs font-semibold border-destructive/20 text-destructive hover:bg-destructive/10`}
                          onClick={() => handleDeleteUser(p.id, p.user_id, p.full_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={tempPwdTargetId === p.user_id}
                        className="w-full rounded-xl gap-2 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => handleSetTempPassword(p.user_id, p.full_name)}
                      >
                        {tempPwdTargetId === p.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        Definir nova senha
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredProfilesCount === 0 && (
                <Card className="border-0 shadow-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t("admin.noUsersFound")}</p>
                  </CardContent>
                </Card>
              )}
              {usersTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-bold h-10"
                    disabled={usersCurrentPage <= 1}
                    onClick={() => setUsersPage((n) => Math.max(1, n - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs font-semibold text-muted-foreground px-2">
                    {usersCurrentPage} / {usersTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-bold h-10"
                    disabled={usersCurrentPage >= usersTotalPages}
                    onClick={() => setUsersPage((n) => Math.min(usersTotalPages, n + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Schools Tab */}
          <TabsContent value="schools" className="space-y-4">
            <SubscribedSchoolsList />
            {/* Network filter buttons */}
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { value: "all" as const, label: t("admin.all") },
                { value: "estadual" as const, label: "Estadual" },
                { value: "municipal" as const, label: "Municipal" },
                { value: "federal" as const, label: "Federal" },
                { value: "particular" as const, label: "Particular" },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNetworkFilter(value)}
                  className={`px-2 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-all truncate ${
                    networkFilter === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select
                value={stateFilter}
                onValueChange={(v) => {
                  setStateFilter(v);
                  setCityFilter("all");
                  loadAvailableCities(v);
                }}
              >
                <SelectTrigger className="h-11 rounded-xl bg-secondary/50 border-0">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {availableStates.map((s) => (
                    <SelectItem key={s.state} value={s.state}>
                      {s.state} ({s.school_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={cityFilter}
                onValueChange={setCityFilter}
                disabled={stateFilter === "all"}
              >
                <SelectTrigger className="h-11 rounded-xl bg-secondary/50 border-0">
                  <SelectValue placeholder={stateFilter === "all" ? "Selecione um estado" : "Cidade"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Todas as cidades</SelectItem>
                  {availableCities.map((c) => (
                    <SelectItem key={c.city} value={c.city}>
                      {c.city} ({c.school_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("admin.searchSchool")}
                  value={searchSchools}
                  onChange={(e) => setSearchSchools(e.target.value)}
                  className="pl-10 h-11 rounded-xl bg-secondary/50 border-0"
                />
              </div>
              <Dialog open={schoolDialogOpen} onOpenChange={(open) => {
                setSchoolDialogOpen(open);
                if (!open) {
                  setLogoFile(null);
                  setLogoPreview(null);
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl gradient-primary text-primary-foreground shadow-glow gap-2 border-0">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("admin.schoolsTab")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl border-0 shadow-card-hover">
                  <DialogHeader>
                    <DialogTitle className="font-display text-xl">{t("admin.registerSchool")}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddSchool} className="space-y-4">
                    {/* Logo upload */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.schoolLogo")}</Label>
                      <div
                        className="relative w-full h-32 rounded-xl bg-secondary/50 border-2 border-dashed border-border hover:border-primary/40 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {logoPreview ? (
                          <img src={logoPreview} alt="Preview" className="h-20 w-20 object-contain rounded-xl" />
                        ) : (
                          <>
                            <Upload className="h-6 w-6 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">{t("admin.uploadLogo")}</p>
                          </>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoChange}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.schoolName")}</Label>
                      <Input
                        value={newSchool.name}
                        onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                        placeholder="Ex: EEEP Maria José"
                        className="h-12 rounded-xl bg-secondary/50 border-0"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.city")}</Label>
                        <Input
                          value={newSchool.city}
                          onChange={(e) => setNewSchool({ ...newSchool, city: e.target.value })}
                          placeholder="Fortaleza"
                          className="h-12 rounded-xl bg-secondary/50 border-0"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.state")}</Label>
                        <Input
                          value={newSchool.state}
                          onChange={(e) => setNewSchool({ ...newSchool, state: e.target.value })}
                          placeholder="CE"
                          maxLength={2}
                          className="h-12 rounded-xl bg-secondary/50 border-0"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.inepCode")} <span className="font-normal normal-case">({t("admin.optional")})</span>
                      </Label>
                      <Input
                        value={newSchool.inep_code}
                        onChange={(e) => setNewSchool({ ...newSchool, inep_code: e.target.value })}
                        placeholder="00000000"
                        className="h-12 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold shadow-glow border-0"
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? t("admin.registering") : t("admin.registerSchoolBtn")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Result count + page size */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
              <span className="truncate">
                {schoolsLoading
                  ? "Carregando..."
                  : `${schoolsTotalCount.toLocaleString("pt-BR")} escola${schoolsTotalCount === 1 ? "" : "s"} encontrada${schoolsTotalCount === 1 ? "" : "s"}`}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {schoolsTotalCount > schoolsPageSize && (
                  <span>Pág. {schoolsPage + 1}/{totalSchoolsPages}</span>
                )}
                <Select value={String(schoolsPageSize)} onValueChange={(v) => setSchoolsPageSize(Number(v))}>
                  <SelectTrigger className="h-7 w-[72px] rounded-lg text-xs bg-secondary/50 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filtro por Pagamento (status real da assinatura) */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                Filtrar por Pagamento
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { key: "all", label: "Todos", cls: "border-border bg-secondary/40 hover:bg-secondary/60", active: "border-primary bg-primary/10 ring-2 ring-primary/30" },
                  { key: "paid", label: "Pago", cls: "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", active: "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 text-emerald-700 dark:text-emerald-400" },
                  { key: "expired", label: "Vencido", cls: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive", active: "border-destructive bg-destructive/15 ring-2 ring-destructive/30 text-destructive" },
                  { key: "none", label: "Sem assinatura", cls: "border-border bg-muted/30 hover:bg-muted/50 text-muted-foreground", active: "border-foreground/40 bg-muted ring-2 ring-foreground/20 text-foreground" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPaymentFilter(opt.key as typeof paymentFilter)}
                    className={`rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all text-center break-words ${
                      paymentFilter === opt.key ? opt.active : opt.cls
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentFilter !== "all" && (
              <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-accent/10 border border-accent/20">
                <span className="text-sm font-medium text-accent">
                  Filtro de pagamento: {paymentFilter === "paid" ? "Pago" : paymentFilter === "expired" ? "Vencido" : "Sem assinatura"}
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPaymentFilter("all")}>
                  Limpar
                </Button>
              </div>
            )}

            {subStatusFilter !== "all" && (
              <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-accent/10 border border-accent/20">
                <span className="text-sm font-medium text-accent">
                  Filtro ativo: {subStatusFilter === "subscribed" ? "Apenas escolas com plano (ativo + carência)" : "Apenas escolas bloqueadas"}
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSubStatusFilter("all")}>
                  Limpar
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {schoolsLoading && filteredSchools.length === 0 ? (
                <Card className="border-0 shadow-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-30 animate-spin" />
                    <p className="text-sm">Carregando escolas...</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {filteredSchools.map((s) => (
                    <SchoolCard
                      key={s.id}
                      school={s}
                      payment={paymentBySchool[s.id]}
                      onUploadLogo={handleUploadLogoForSchool}
                      onDelete={handleDeleteSchool}
                      onUpdate={() => { loadSchools(); loadStats(); }}
                      onOpen={(id) => navigate(`/admin/school/${id}`)}
                      onCancelPlan={handleCancelSchoolPlan}
                    />
                  ))}
                  {filteredSchools.length === 0 && (
                    <Card className="border-0 shadow-card">
                      <CardContent className="py-12 text-center text-muted-foreground">
                        <School className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{t("admin.noSchoolsFound")}</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>

            {/* Pagination */}
            {schoolsTotalCount > schoolsPageSize && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={schoolsPage === 0 || schoolsLoading}
                  onClick={() => setSchoolsPage((p) => Math.max(0, p - 1))}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-xs font-semibold text-muted-foreground">
                  {schoolsPage + 1} / {totalSchoolsPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={schoolsPage + 1 >= totalSchoolsPages || schoolsLoading}
                  onClick={() => setSchoolsPage((p) => p + 1)}
                >
                  Próxima
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Company Tab */}
          <TabsContent value="company" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                  <Building2 className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm">{t("admin.companyData")}</h3>
                    <p className="text-xs text-muted-foreground">{t("admin.companySubtitle")}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.razaoSocial")}</Label>
                    <Input
                      value={companySettings.razao_social}
                      onChange={(e) => setCompanySettings((p) => ({ ...p, razao_social: e.target.value }))}
                      placeholder="Nome completo da empresa"
                      className="h-10 rounded-xl bg-secondary/50 border-0"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.cnpj")}</Label>
                      <Input
                        value={companySettings.cnpj}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, cnpj: e.target.value }))}
                        placeholder="00.000.000/0000-00"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.cep")}</Label>
                      <Input
                        value={companySettings.cep}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, cep: e.target.value }))}
                        placeholder="00000-000"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs font-medium">{t("admin.address")}</Label>
                      <Input
                        value={companySettings.address}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, address: e.target.value }))}
                        placeholder="Rua / Avenida"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.number")}</Label>
                      <Input
                        value={companySettings.number}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, number: e.target.value }))}
                        placeholder="Nº"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.neighborhood")}</Label>
                    <Input
                      value={companySettings.neighborhood}
                      onChange={(e) => setCompanySettings((p) => ({ ...p, neighborhood: e.target.value }))}
                      placeholder="Bairro"
                      className="h-10 rounded-xl bg-secondary/50 border-0"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.city")}</Label>
                      <Input
                        value={companySettings.city}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, city: e.target.value }))}
                        placeholder="Cidade"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.state")}</Label>
                      <Input
                        value={companySettings.state}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, state: e.target.value }))}
                        placeholder="UF"
                        maxLength={2}
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.phone")}</Label>
                      <Input
                        value={companySettings.phone}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.email")}</Label>
                      <Input
                        value={companySettings.email}
                        onChange={(e) => setCompanySettings((p) => ({ ...p, email: e.target.value }))}
                        placeholder="empresa@email.com"
                        className="h-10 rounded-xl bg-secondary/50 border-0"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">{t("admin.representative")}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">{t("auth.name")}</Label>
                        <Input
                          value={companySettings.representative_name}
                          onChange={(e) => setCompanySettings((p) => ({ ...p, representative_name: e.target.value }))}
                          placeholder="Nome do representante"
                          className="h-10 rounded-xl bg-secondary/50 border-0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">{t("admin.cpf")}</Label>
                        <Input
                          value={companySettings.representative_cpf}
                          onChange={(e) => setCompanySettings((p) => ({ ...p, representative_cpf: e.target.value }))}
                          placeholder="000.000.000-00"
                          className="h-10 rounded-xl bg-secondary/50 border-0"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full rounded-xl h-11"
                    onClick={handleSaveCompanySettings}
                    disabled={savingCompany}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {savingCompany ? t("admin.saving") : t("admin.saveData")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Version Tab */}
          <TabsContent value="version" className="space-y-4">
            <AppVersionGateCard />
            <LastUpdateLocationCard />
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog: nova senha temporária (mostrada apenas uma vez) */}
      <Dialog
        open={tempPwdState.open}
        onOpenChange={(open) => {
          if (!open) setTempPwdState({ open: false, loading: false, fullName: "", email: "", password: "", copyCount: 0 });
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Nova senha temporária
            </DialogTitle>
          </DialogHeader>
          {tempPwdState.loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Banner de auditoria */}
              <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-[11px] leading-relaxed text-foreground/90 flex gap-2">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Esta ação foi <strong>registrada no log de auditoria</strong> com seu usuário, data e hora. Use somente para ajudar quem não consegue redefinir a própria senha.
                </span>
              </div>

              <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-xs text-foreground/90">
                ⚠️ Esta senha aparece <strong>apenas nesta tela</strong>. Após fechar, não é possível visualizá-la novamente — mas você pode <strong>gerar uma nova senha quantas vezes for preciso</strong>, sem limite.
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Usuário</Label>
                <p className="text-sm font-semibold break-words">{tempPwdState.fullName}</p>
                {tempPwdState.email && (
                  <p className="text-xs text-muted-foreground break-all">{tempPwdState.email}</p>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Senha temporária</Label>
                  <Badge
                    variant="outline"
                    className={`text-[10px] rounded-md px-1.5 py-0 ${
                      tempPwdState.copyCount > 0
                        ? "bg-accent/10 text-accent border-accent/30"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {tempPwdState.copyCount > 0
                      ? `Copiada ${tempPwdState.copyCount}×`
                      : "Ainda não copiada"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-3 rounded-xl bg-secondary text-base font-mono font-bold tracking-wider break-all select-all">
                    {tempPwdState.password}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-12 w-12 rounded-xl shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(tempPwdState.password);
                        setTempPwdState((s) => ({ ...s, copyCount: s.copyCount + 1 }));
                        toast.success("Senha copiada");
                      } catch {
                        toast.error("Falha ao copiar");
                      }
                    }}
                    aria-label="Copiar senha"
                  >
                    <Copy className="h-5 w-5" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  {tempPwdState.copyCount === 0
                    ? "Ainda não copiada para a área de transferência."
                    : `Copiada ${tempPwdState.copyCount} ${tempPwdState.copyCount === 1 ? "vez" : "vezes"} nesta sessão.`}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={tempPwdTargetId !== null}
                  className="w-full h-11 rounded-xl font-semibold gap-2"
                  onClick={() => handleSetTempPassword(
                    // recupera user_id pela lista atual usando email/nome — usamos o targetId guardado no clique
                    // como fallback, refazemos pelo email do estado
                    profiles.find((pp) => pp.full_name === tempPwdState.fullName)?.user_id || "",
                    tempPwdState.fullName,
                  )}
                >
                  {tempPwdTargetId !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Gerar outra senha
                </Button>
                <Button
                  type="button"
                  className="w-full h-12 rounded-xl font-bold"
                  onClick={() => setTempPwdState({ open: false, loading: false, fullName: "", email: "", password: "", copyCount: 0 })}
                >
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
