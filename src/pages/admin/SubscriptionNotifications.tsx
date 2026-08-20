import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Mail, MessageCircle, ExternalLink, Check, X, Search, Download, FileSpreadsheet, Save, Trash2, Star } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = {
  id: string;
  school_id: string;
  school_name: string | null;
  channel: "email" | "whatsapp";
  event_type: "warning_7d" | "blocked" | "renewed";
  recipient: string;
  subject: string | null;
  message: string;
  status: "pending" | "sent" | "failed" | "dismissed";
  error_message: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
};

const EVENT_LABEL: Record<Row["event_type"], string> = {
  warning_7d: "Aviso 7 dias",
  blocked: "Bloqueio",
  renewed: "Renovação",
};

const EVENT_TONE: Record<Row["event_type"], string> = {
  warning_7d: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
  renewed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const STATUS_TONE: Record<Row["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  dismissed: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<Row["status"], string> = {
  pending: "Pendente",
  sent: "Enviada",
  failed: "Falhou",
  dismissed: "Descartada",
};

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export default function SubscriptionNotifications() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Row["status"] | "all">("all");
  const [channelFilter, setChannelFilter] = useState<Row["channel"] | "all">("all");
  const [eventFilter, setEventFilter] = useState<Row["event_type"] | "all">("all");
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "list_subscription_notifications_admin" as any,
    );
    if (error) toast.error("Falha ao carregar: " + error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const enqueueNow = async () => {
    setRunning(true);
    const { error } = await supabase.rpc(
      "enqueue_subscription_notifications" as any,
    );
    if (error) toast.error("Falha ao gerar: " + error.message);
    else {
      toast.success("Alertas atualizados");
      await load();
    }
    setRunning(false);
  };

  const setStatus = async (id: string, status: Row["status"]) => {
    const patch: any = { status, acted_by: (await supabase.auth.getUser()).data.user?.id };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    const { error } = await supabase
      .from("subscription_notifications" as any)
      .update(patch)
      .eq("id", id);
    if (error) toast.error("Falha ao atualizar: " + error.message);
    else {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      toast.success(status === "sent" ? "Marcada como enviada" : "Atualizada");
    }
  };

  const openExternal = (r: Row) => {
    if (r.channel === "whatsapp") {
      const phone = onlyDigits(r.recipient);
      const num = phone.startsWith("55") ? phone : "55" + phone;
      window.open(
        `https://wa.me/${num}?text=${encodeURIComponent(r.message)}`,
        "_blank",
      );
    } else {
      const subj = encodeURIComponent(r.subject ?? "Aviso de assinatura");
      const body = encodeURIComponent(r.message);
      window.location.href = `mailto:${r.recipient}?subject=${subj}&body=${body}`;
    }
  };

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (channelFilter !== "all" && r.channel !== channelFilter) return false;
        if (eventFilter !== "all" && r.event_type !== eventFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const hay = `${r.school_name ?? ""} ${r.recipient} ${r.message}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [rows, statusFilter, channelFilter, eventFilter, search],
  );

  const counts = useMemo(() => {
    const c = { total: rows.length, pending: 0, sent: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "sent") c.sent++;
      else if (r.status === "failed") c.failed++;
    }
    return c;
  }, [rows]);

  const COLUMNS: { key: string; label: string; get: (r: Row) => string; width: number }[] = [
    { key: "school", label: "Escola", get: (r) => r.school_name ?? "", width: 32 },
    { key: "channel", label: "Canal", get: (r) => r.channel, width: 10 },
    { key: "event", label: "Evento", get: (r) => EVENT_LABEL[r.event_type], width: 14 },
    { key: "status", label: "Status", get: (r) => STATUS_LABEL[r.status], width: 12 },
    { key: "recipient", label: "Destinatário", get: (r) => r.recipient, width: 28 },
    { key: "subject", label: "Assunto", get: (r) => r.subject ?? "", width: 28 },
    { key: "message", label: "Mensagem", get: (r) => r.message, width: 50 },
    { key: "scheduled", label: "Agendada", get: (r) => fmtDate(r.scheduled_at), width: 16 },
    { key: "created", label: "Criada", get: (r) => fmtDate(r.created_at), width: 16 },
    { key: "sent", label: "Enviada", get: (r) => fmtDate(r.sent_at), width: 16 },
    { key: "error", label: "Erro", get: (r) => r.error_message ?? "", width: 24 },
  ];

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");
  const [selectedCols, setSelectedCols] = useState<Set<string>>(
    () => new Set(COLUMNS.map((c) => c.key)),
  );

  const PRESETS_KEY = "notif-export-presets-v1";
  const DEFAULT_PRESET_KEY = "notif-export-default-preset-v1";
  const BUILTIN_PRESETS: Record<string, string[]> = {
    Resumo: ["school", "channel", "event", "status", "sent"],
    Detalhado: COLUMNS.map((c) => c.key),
    "Apenas erros": ["school", "channel", "event", "status", "error", "scheduled"],
  };
  const [userPresets, setUserPresets] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [defaultPreset, setDefaultPreset] = useState<string>(
    () => localStorage.getItem(DEFAULT_PRESET_KEY) || "Detalhado",
  );
  const [activePreset, setActivePreset] = useState<string>(defaultPreset);
  const [newPresetName, setNewPresetName] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Apply default preset whenever the export dialog opens
  useEffect(() => {
    if (!exportOpen) return;
    const keys = BUILTIN_PRESETS[defaultPreset] ?? userPresets[defaultPreset];
    if (keys) {
      setSelectedCols(new Set(keys));
      setActivePreset(defaultPreset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportOpen]);

  const setAsDefaultPreset = (name: string) => {
    setDefaultPreset(name);
    localStorage.setItem(DEFAULT_PRESET_KEY, name);
    toast.success(`"${name}" definido como preset padrão`);
  };

  const persistPresets = (next: Record<string, string[]>) => {
    setUserPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  const applyPreset = (name: string) => {
    const keys = BUILTIN_PRESETS[name] ?? userPresets[name];
    if (!keys) return;
    setSelectedCols(new Set(keys));
    setActivePreset(name);
  };

  const savePreset = () => {
    const name = newPresetName.trim();
    if (!name) {
      toast.error("Informe um nome para o preset");
      return;
    }
    if (BUILTIN_PRESETS[name]) {
      toast.error("Esse nome é reservado");
      return;
    }
    const next = { ...userPresets, [name]: Array.from(selectedCols) };
    persistPresets(next);
    setActivePreset(name);
    setNewPresetName("");
    toast.success(`Preset "${name}" salvo`);
  };

  const deletePreset = (name: string) => {
    const { [name]: _, ...rest } = userPresets;
    persistPresets(rest);
    if (activePreset === name) setActivePreset("Detalhado");
    if (defaultPreset === name) {
      setDefaultPreset("Detalhado");
      localStorage.setItem(DEFAULT_PRESET_KEY, "Detalhado");
    }
    toast.success(`Preset "${name}" removido`);
  };

  const toggleCol = (key: string) => {
    setActivePreset("");
    setSelectedCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const runExport = () => {
    if (filtered.length === 0) {
      toast.error("Nenhuma notificação para exportar");
      return;
    }
    const cols = COLUMNS.filter((c) => selectedCols.has(c.key));
    if (cols.length === 0) {
      toast.error("Selecione ao menos uma coluna");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (exportFormat === "csv") {
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [cols.map((c) => c.label).join(",")];
      for (const r of filtered) {
        lines.push(cols.map((c) => esc(c.get(r))).join(","));
      }
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notificacoes-assinatura-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const data = filtered.map((r) => {
        const obj: Record<string, string> = {};
        for (const c of cols) obj[c.label] = c.get(r);
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.label) });
      ws["!cols"] = cols.map((c) => ({ wch: c.width }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Notificações");
      XLSX.writeFile(wb, `notificacoes-assinatura-${stamp}.xlsx`);
    }
    setExportOpen(false);
    toast.success(`${filtered.length} notificação(ões) exportada(s)`);
  };

  return (
    <main className="min-h-dvh bg-background">
      <header className="bg-background border-b border-border pt-16">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold flex-1 break-words">Notificações de Assinatura</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={enqueueNow} disabled={running} size="sm" variant="outline">
              <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
              Gerar agora
            </Button>
            <Button onClick={() => setExportOpen(true)} size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />
              Exportar
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Total" value={counts.total} />
          <Stat label="Pendentes" value={counts.pending} tone="amber" />
          <Stat label="Enviadas" value={counts.sent} tone="emerald" />
          <Stat label="Falhas" value={counts.failed} tone="red" />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por escola, e-mail, telefone..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onChange={(v) => setStatusFilter(v as any)}
            options={[["all","Todos status"],["pending","Pendentes"],["sent","Enviadas"],["failed","Falhas"],["dismissed","Descartadas"]]} />
          <Select value={channelFilter} onChange={(v) => setChannelFilter(v as any)}
            options={[["all","Todos canais"],["email","E-mail"],["whatsapp","WhatsApp"]]} />
          <Select value={eventFilter} onChange={(v) => setEventFilter(v as any)}
            options={[["all","Todos eventos"],["warning_7d","Aviso 7 dias"],["blocked","Bloqueio"],["renewed","Renovação"]]} />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma notificação encontrada.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {r.channel === "email" ? (
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm break-words">
                        {r.school_name ?? "Escola removida"}
                      </p>
                      <p className="text-xs text-muted-foreground break-all">
                        {r.recipient}
                      </p>
                    </div>
                  </div>
                  <Badge className={`${EVENT_TONE[r.event_type]} border`}>
                    {EVENT_LABEL[r.event_type]}
                  </Badge>
                  <Badge className={`${STATUS_TONE[r.status]} border`}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                {r.subject && (
                  <p className="text-sm font-medium mt-2 break-words">{r.subject}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  {r.message}
                </p>
                <div className="text-[11px] text-muted-foreground mt-2 flex flex-wrap gap-x-3">
                  <span>Agendada: {fmtDate(r.scheduled_at)}</span>
                  <span>Criada: {fmtDate(r.created_at)}</span>
                  {r.sent_at && <span>Enviada: {fmtDate(r.sent_at)}</span>}
                </div>
                {r.error_message && (
                  <p className="text-xs text-destructive mt-1">{r.error_message}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => openExternal(r)}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {r.channel === "whatsapp" ? "Abrir WhatsApp" : "Abrir e-mail"}
                  </Button>
                  {r.status !== "sent" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "sent")}>
                      <Check className="h-3 w-3 mr-1" /> Marcar enviada
                    </Button>
                  )}
                  {r.status !== "dismissed" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "dismissed")}>
                      <X className="h-3 w-3 mr-1" /> Descartar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar notificações</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Formato</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={exportFormat === "csv" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setExportFormat("csv")}
                >
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button
                  type="button"
                  variant={exportFormat === "xlsx" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setExportFormat("xlsx")}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Presets</p>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Padrão: <span className="font-medium text-foreground">{defaultPreset}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setResetConfirmOpen(true)}
                    className="text-[11px] underline text-primary hover:opacity-80"
                  >
                    Restaurar padrão
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Object.keys(BUILTIN_PRESETS).map((name) => {
                  const isActive = activePreset === name;
                  const isDefault = defaultPreset === name;
                  return (
                    <span key={name} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => applyPreset(name)}
                        className={`text-xs pl-2 pr-1 py-1 rounded-l-md border-y border-l ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        {name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAsDefaultPreset(name)}
                        className={`text-xs px-1 py-1 rounded-r-md border-y border-r ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                        aria-label={`Definir ${name} como padrão`}
                        title={isDefault ? "Preset padrão" : "Definir como padrão"}
                      >
                        <Star className={`h-3 w-3 ${isDefault ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                      </button>
                    </span>
                  );
                })}
                {Object.keys(userPresets).map((name) => {
                  const isActive = activePreset === name;
                  const isDefault = defaultPreset === name;
                  return (
                    <span key={name} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => applyPreset(name)}
                        className={`text-xs pl-2 pr-1 py-1 rounded-l-md border-y border-l ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        {name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAsDefaultPreset(name)}
                        className={`text-xs px-1 py-1 border-y ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                        aria-label={`Definir ${name} como padrão`}
                        title={isDefault ? "Preset padrão" : "Definir como padrão"}
                      >
                        <Star className={`h-3 w-3 ${isDefault ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(name)}
                        className={`text-xs px-1 py-1 rounded-r-md border-y border-r ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted text-muted-foreground"
                        }`}
                        aria-label={`Remover preset ${name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Nome do novo preset"
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={savePreset}
                  disabled={!newPresetName.trim() || selectedCols.size === 0}
                >
                  <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Colunas ({selectedCols.size}/{COLUMNS.length})
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => { setActivePreset(""); setSelectedCols(new Set(COLUMNS.map((c) => c.key))); }}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => { setActivePreset(""); setSelectedCols(new Set()); }}
                  >
                    Nenhuma
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-auto rounded-md border border-border p-2">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded p-1 hover:bg-muted"
                  >
                    <Checkbox
                      checked={selectedCols.has(c.key)}
                      onCheckedChange={() => toggleCol(c.key)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length} linha(s) serão exportadas (filtros atuais).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancelar</Button>
            <Button onClick={runExport} disabled={selectedCols.size === 0}>
              <Download className="h-4 w-4 mr-1" /> Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restaurar preset padrão?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O preset padrão voltará para <span className="font-medium text-foreground">"Detalhado"</span> e
            quaisquer seleções manuais de colunas serão descartadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setDefaultPreset("Detalhado");
                localStorage.setItem(DEFAULT_PRESET_KEY, "Detalhado");
                setSelectedCols(new Set(BUILTIN_PRESETS["Detalhado"]));
                setActivePreset("Detalhado");
                setResetConfirmOpen(false);
                toast.success('Padrão e colunas restaurados para "Detalhado"');
              }}
            >
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "emerald" | "red" }) {
  const toneCls =
    tone === "amber" ? "text-amber-600 dark:text-amber-400"
    : tone === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "red" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}

function Select({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
