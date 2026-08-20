import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileText, Receipt, FileSignature, Folder, Inbox,
  ChevronRight, Download, ExternalLink, Loader2, Bell, QrCode, CheckCircle2,
  Zap, CheckSquare, CreditCard,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validatePaymentBatch, type DiscardedPaymentLog } from "@/lib/paymentDocumentValidator";
import { PaymentValidationLog } from "@/components/PaymentValidationLog";
import { generateCurrentContractPdf } from "@/lib/currentContractTemplate";
import { useHasUnseenDocuments, type FolderKey } from "@/hooks/useHasUnseenDocuments";
import { toast } from "sonner";

type DocItem = {
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  url?: string;
  bucket?: string;
  path?: string;
  pixCode?: string;
  body?: string;
  paid?: boolean;
  paidAt?: string;
  template?: boolean;
  cycleMonth?: string | null;
  manuallyMarked?: boolean;
  isOpenBoleto?: boolean;
  rawPaymentId?: string;
};

type FolderDef = {
  key: FolderKey;
  label: string;
  icon: typeof FileText;
  color: string;
  items: DocItem[];
};

type RemainingQuote = {
  meses_pagos: number;
  meses_ciclo: number;
  meses_restantes: number;
  valor_total: number;
  desconto_pct: number;
};

export default function GestorDocumentos() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const schoolId = profile?.school_id;
  const { unseenByFolder, markFolderViewed, refresh: refreshUnseen } = useHasUnseenDocuments();

  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<FolderDef[]>([]);
  const [openKey, setOpenKey] = useState<FolderKey | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [discards, setDiscards] = useState<DiscardedPaymentLog[]>([]);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [generatingPix, setGeneratingPix] = useState<string | null>(null);
  const [remainingQuote, setRemainingQuote] = useState<RemainingQuote | null>(null);
  const [boletosByCycle, setBoletosByCycle] = useState<Record<string, { boleto?: any; pix?: any }>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || !schoolId) { setLoading(false); return; }
      setLoading(true);

      const [contratosRes, pagamentosRes, subNotifsRes, notifsRes, quoteRes] = await Promise.all([
        supabase.from("signed_contracts")
          .select("id, file_path, file_name, uploaded_at, signer_role, status")
          .eq("school_id", schoolId).order("uploaded_at", { ascending: false }),
        supabase.from("pagamentos")
          .select("id, plano, valor, metodo, status, ticket_url, qr_code, qr_code_base64, created_at, approved_at, manually_marked_paid, marked_paid_at, cycle_month, due_date, auto_generated")
          .eq("school_id", schoolId).order("created_at", { ascending: false }),
        supabase.from("subscription_notifications")
          .select("id, subject, message, channel, event_type, created_at, sent_at")
          .eq("school_id", schoolId).order("created_at", { ascending: false }),
        supabase.from("notifications").select("id, title, body, data, created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
        supabase.rpc("get_remaining_year_quote", { _school_id: schoolId }),
      ]);

      if (cancelled) return;

      const quote = Array.isArray(quoteRes.data) ? quoteRes.data[0] : quoteRes.data;
      if (quote && quote.meses_restantes > 0) setRemainingQuote(quote as any);
      else setRemainingQuote(null);

      // Index pagamentos auto-gerados por cycle_month → para parear boleto + pix
      const pagamentos = (pagamentosRes.data ?? []) as any[];
      const byCycle: Record<string, { boleto?: any; pix?: any }> = {};
      for (const p of pagamentos) {
        if (!p.cycle_month || !p.auto_generated) continue;
        const k = String(p.cycle_month);
        if (!byCycle[k]) byCycle[k] = {};
        if ((p.metodo || "").includes("pix")) byCycle[k].pix = p;
        else byCycle[k].boleto = p;
      }
      setBoletosByCycle(byCycle);

      const contratosUploaded: DocItem[] = (contratosRes.data ?? [])
        .filter((c: any) => c.file_path && !c.file_path.startsWith("__request__") && c.file_name !== "__request__")
        .map((c: any) => ({
          id: c.id,
          title: c.file_name || "Contrato assinado",
          subtitle: `Assinado por ${c.signer_role === "admin" ? "Administração" : "Gestor"} · ${c.status}`,
          date: c.uploaded_at,
          bucket: "signed-contracts",
          path: c.file_path,
        }));

      const contratoTemplate: DocItem = {
        id: "template-current",
        title: "Contrato vigente — modelo atual (PDF)",
        subtitle: "Gerado pelo sistema · padrão ABNT",
        template: true,
      };
      const contratos: DocItem[] = [contratoTemplate, ...contratosUploaded];

      const boletos: DocItem[] = [];
      const pix: DocItem[] = [];
      const { docs: payDocs, discards: payDiscards } = validatePaymentBatch(pagamentos as any[], "gestor");

      // Para boletos auto-gerados (ciclo dia 5), suprime o PIX-irmão da listagem PIX
      // pois ele aparece como botão "Pagar via PIX" dentro do boleto.
      const pixSiblingIds = new Set<string>();
      for (const k of Object.keys(byCycle)) {
        const pair = byCycle[k];
        if (pair.boleto && pair.pix) pixSiblingIds.add(pair.pix.id);
      }

      for (const v of payDocs) {
        const raw = pagamentos.find((p) => p.id === v.id);
        const base: DocItem = {
          id: v.id,
          rawPaymentId: v.id,
          title: `${v.plano} — R$ ${v.valor}`,
          subtitle: `${v.metodo.toUpperCase()} · ${v.paid ? "PAGO" : v.status}`,
          date: v.date,
          paid: v.paid,
          paidAt: v.paidAt,
          cycleMonth: raw?.cycle_month ?? null,
          manuallyMarked: !!raw?.manually_marked_paid,
          isOpenBoleto: !v.paid && v.kind === "boleto",
        };
        if (v.kind === "pix") {
          if (pixSiblingIds.has(v.id) && !v.paid) continue;
          pix.push({ ...base, pixCode: v.pixCode, url: v.url });
        } else {
          boletos.push({ ...base, url: v.url });
        }
      }
      setDiscards(payDiscards);

      const comunicados: DocItem[] = [
        ...((subNotifsRes.data ?? []) as any[]).map((n) => ({
          id: `sub-${n.id}`, title: n.subject || `Aviso (${n.event_type})`,
          subtitle: `Canal: ${n.channel}`, date: n.sent_at || n.created_at, body: n.message,
        })),
        ...((notifsRes.data ?? []) as any[])
          .filter((n) => {
            const src = (n.data as any)?.source;
            return src === "admin" || src === "gestao" || /admin|gestão|comunicado/i.test(n.title || "");
          })
          .map((n) => ({
            id: `notif-${n.id}`, title: n.title,
            subtitle: (n.data as any)?.source ? `Origem: ${(n.data as any).source}` : undefined,
            date: n.created_at, body: n.body, url: (n.data as any)?.url,
          })),
      ];

      const outros: DocItem[] = ((notifsRes.data ?? []) as any[])
        .filter((n) => {
          const src = (n.data as any)?.source; const url = (n.data as any)?.url;
          return url && src !== "admin" && src !== "gestao";
        })
        .map((n) => ({
          id: `out-${n.id}`, title: n.title, subtitle: n.body?.slice(0, 80),
          date: n.created_at, url: (n.data as any)?.url,
        }));

      setFolders([
        { key: "contratos", label: "Contratos", icon: FileSignature, color: "from-blue-500 to-blue-700", items: contratos },
        { key: "boletos_pagar", label: "Boletos a Pagar", icon: Receipt, color: "from-amber-500 to-amber-700", items: boletos.filter((b) => !b.paid) },
        { key: "boletos_pagos", label: "Boletos Pagos", icon: Receipt, color: "from-emerald-500 to-emerald-700", items: boletos.filter((b) => b.paid) },
        { key: "pix", label: "Extratos PIX", icon: QrCode, color: "from-teal-500 to-teal-700", items: pix },
        { key: "comunicados", label: "Comunicados", icon: Bell, color: "from-fuchsia-500 to-fuchsia-700", items: comunicados },
        { key: "outros", label: "Outros", icon: Folder, color: "from-purple-500 to-purple-700", items: outros },
      ]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user, schoolId, refreshTick]);

  const totalDocs = useMemo(() => folders.reduce((acc, f) => acc + f.items.length, 0), [folders]);

  const openFolder = (key: FolderKey) => {
    setOpenKey(key);
    markFolderViewed(key);
  };

  const openItem = async (item: DocItem) => {
    if (item.template) {
      if (!schoolId) { toast.error("Escola não identificada."); return; }
      try {
        setDownloading(item.id);
        const { blob, fileName } = await generateCurrentContractPdf({ schoolId });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success("Contrato vigente baixado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao gerar contrato.");
      } finally { setDownloading(null); }
      return;
    }
    if (item.bucket && item.path) {
      try {
        setDownloading(item.id);
        const { data, error } = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 60 * 5);
        if (error || !data?.signedUrl) throw error || new Error("Sem URL");
        window.open(data.signedUrl, "_blank", "noopener");
      } finally { setDownloading(null); }
      return;
    }
    if (item.url) { window.open(item.url, "_blank", "noopener"); return; }
    if (item.pixCode) {
      try { await navigator.clipboard.writeText(item.pixCode); toast.success("Código PIX copiado!"); } catch {}
    }
  };

  const markPaidManually = async (paymentId: string) => {
    try {
      setMarkingPaid(paymentId);
      const { error } = await supabase.rpc("mark_boleto_paid_manually", { _pagamento_id: paymentId });
      if (error) throw error;
      toast.success("Marcado como pago — aguardando confirmação automática.");
      setRefreshTick((t) => t + 1);
      refreshUnseen();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao marcar como pago.");
    } finally { setMarkingPaid(null); }
  };

  const payViaPix = async (item: DocItem) => {
    // Se já existe PIX-irmão (boleto auto-gerado), abre seu QR/copia código
    if (item.cycleMonth) {
      const pair = boletosByCycle[String(item.cycleMonth)];
      if (pair?.pix?.qr_code) {
        try {
          await navigator.clipboard.writeText(pair.pix.qr_code);
          toast.success("Código PIX copiado! Cole no app do banco. Liberação imediata.");
        } catch {
          toast.message("Use o código PIX abaixo", { description: pair.pix.qr_code });
        }
        if (pair.pix.qr_code_base64) {
          window.open(`data:image/png;base64,${pair.pix.qr_code_base64}`, "_blank", "noopener");
        }
        return;
      }
    }
    // fallback: gera novo pagamento PIX
    try {
      setGeneratingPix(item.id);
      const { data, error } = await supabase.functions.invoke("criar-pagamento-mp", {
        body: { plano: "mensal", metodo: "pix", payer: { email: user?.email || "gestor@escola.local" } },
      });
      if (error) throw error;
      if ((data as any)?.qr_code) {
        try { await navigator.clipboard.writeText((data as any).qr_code); toast.success("PIX gerado e copiado!"); } catch {}
        if ((data as any).qr_code_base64) {
          window.open(`data:image/png;base64,${(data as any).qr_code_base64}`, "_blank", "noopener");
        }
        setRefreshTick((t) => t + 1);
      } else {
        toast.error("PIX não gerado.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar PIX.");
    } finally { setGeneratingPix(null); }
  };

  const payRemainingViaCard = () => navigate(`/subscription?plano=quitacao_restante&metodo=cartao`);
  const payRemainingViaPix = () => navigate(`/subscription?plano=quitacao_restante&metodo=pix`);
  const payRemainingViaBoleto = () => navigate(`/subscription?plano=quitacao_restante&metodo=boleto`);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/gestor"));
  const openedFolder = folders.find((f) => f.key === openKey);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-[hsl(220,70%,10%)] via-[hsl(222,65%,14%)] to-[hsl(225,75%,7%)]">
      <div className="relative z-10 px-3 pt-16 pb-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          {openedFolder && (
            <button type="button" onClick={() => setOpenKey(null)}
              className="h-10 w-10 rounded-xl bg-black/40 backdrop-blur-md ring-1 ring-white/15 text-white flex items-center justify-center"
              aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-black/40 backdrop-blur-md ring-1 ring-amber-300/30">
            <Inbox className="h-5 w-5 text-amber-300" />
            <span className="text-white text-base font-extrabold uppercase tracking-[0.14em]">
              {openedFolder ? openedFolder.label : "Gaveta de Documentos"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-amber-100/80 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando documentos...
          </div>
        ) : openedFolder ? (
          <div className="space-y-2">
            {openedFolder.key === "boletos_pagar" && remainingQuote && remainingQuote.meses_restantes > 0 && (
              <div className="rounded-2xl p-3 border border-emerald-300/40 bg-gradient-to-br from-emerald-500/15 to-emerald-700/10 mb-2">
                <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1 px-1">
                  💰 Quitar restante do contrato à vista
                </div>
                <div className="text-white text-sm mb-2 px-1">
                  Você já pagou <strong>{remainingQuote.meses_pagos}</strong> de <strong>{remainingQuote.meses_ciclo}</strong> meses.
                  Faltam <strong>{remainingQuote.meses_restantes}</strong> meses ={" "}
                  <strong>R$ {Number(remainingQuote.valor_total).toFixed(2).replace(".", ",")}</strong>
                  <span className="text-emerald-300 ml-1">(5% off)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={payRemainingViaPix}
                    className="rounded-xl p-2 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-extrabold flex flex-col items-center gap-1">
                    <QrCode className="h-4 w-4" /> PIX
                  </button>
                  <button onClick={payRemainingViaBoleto}
                    className="rounded-xl p-2 bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-extrabold flex flex-col items-center gap-1">
                    <Receipt className="h-4 w-4" /> Boleto
                  </button>
                  <button onClick={payRemainingViaCard}
                    className="rounded-xl p-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-extrabold flex flex-col items-center gap-1">
                    <CreditCard className="h-4 w-4" /> Cartão
                  </button>
                </div>
                <div className="text-emerald-100/70 text-[10px] mt-2 px-1">
                  Cartão: parcele em até 12×. Independentemente da forma, o contrato é quitado de uma vez.
                </div>
              </div>
            )}
            {openedFolder.items.length === 0 ? (
              <div className="rounded-2xl p-6 border border-white/10 bg-black/30 text-amber-100/70 text-sm text-center">
                {openedFolder.key === "boletos_pagar" ? "Nenhum boleto em aberto." : openedFolder.key === "boletos_pagos" ? "Nenhum boleto pago ainda." : "Nenhum documento nesta pasta ainda."}
              </div>
            ) : (
              openedFolder.items.map((it) => (
                <div key={it.id} className="relative w-full rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                  <button type="button" onClick={() => openItem(it)} disabled={downloading === it.id}
                    className="w-full text-left p-3 hover:bg-black/50 transition-colors flex items-start gap-3">
                    {it.paid && (
                      <span aria-hidden
                        className="pointer-events-none absolute top-2 right-2 sm:top-3 sm:right-3 px-2 py-0.5 rounded-md border-2 border-emerald-400 text-emerald-300 font-black uppercase tracking-[0.18em] text-[10px] sm:text-xs bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        style={{ transform: "rotate(-12deg)" }}>
                        {it.manuallyMarked ? "PAGO*" : "PAGO"}
                      </span>
                    )}
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center relative">
                      {downloading === it.id ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                        : it.bucket || it.template ? <Download className="h-5 w-5 text-white" />
                        : it.url ? <ExternalLink className="h-5 w-5 text-white" />
                        : <FileText className="h-5 w-5 text-white" />}
                      {it.paid && <CheckCircle2 className="absolute -bottom-1 -right-1 h-4 w-4 text-emerald-400 bg-black rounded-full" />}
                    </div>
                    <div className="flex-1 min-w-0 pr-14">
                      <p className="text-white font-bold text-sm break-words">{it.title}</p>
                      {it.subtitle && (
                        <p className={`${it.paid ? "text-emerald-300" : "text-amber-100/70"} text-xs mt-0.5 break-words font-semibold`}>{it.subtitle}</p>
                      )}
                      {it.body && <p className="text-white/70 text-xs mt-1 line-clamp-2 break-words">{it.body}</p>}
                      {it.paid && it.paidAt && (
                        <p className="text-emerald-300/90 text-[11px] mt-1 font-semibold">
                          Pago em {format(new Date(it.paidAt), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                          {it.manuallyMarked && <span className="text-amber-200 ml-1">(aguardando confirmação)</span>}
                        </p>
                      )}
                      {it.date && !it.paid && (
                        <p className="text-amber-100/50 text-[11px] mt-1">
                          {format(new Date(it.date), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </button>
                  {it.isOpenBoleto && it.rawPaymentId && (
                    <div className="px-3 pb-3 pt-1 flex gap-2 border-t border-white/10 bg-black/20">
                      <button type="button" onClick={() => payViaPix(it)} disabled={generatingPix === it.id}
                        className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-60">
                        {generatingPix === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Pagar via PIX (imediato)
                      </button>
                      <button type="button" onClick={() => markPaidManually(it.rawPaymentId!)} disabled={markingPaid === it.rawPaymentId}
                        className="flex-1 h-9 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-60">
                        {markingPaid === it.rawPaymentId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                        Marquei como pago
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            <p className="text-amber-100/80 text-sm font-medium mb-4">
              Tudo que a administração ou a gestão escolar produz em forma de documento
              é arquivado aqui automaticamente. Total: <strong>{totalDocs}</strong> {totalDocs === 1 ? "documento" : "documentos"}.
            </p>

            <PaymentValidationLog discards={discards} viewer="gestor" />

            <div className="grid grid-cols-2 gap-3">
              {folders.map(({ key, label, icon: Icon, color, items }) => {
                const blink = unseenByFolder[key];
                return (
                  <button key={key} type="button" onClick={() => openFolder(key)}
                    className={`rounded-2xl p-3 border border-white/10 shadow-lg bg-gradient-to-br ${color} text-white flex flex-col items-start gap-1.5 min-h-[92px] hover:scale-[1.02] transition-transform text-left ${blink ? "folder-blink-red" : ""}`}>
                    <div className="flex items-center justify-between w-full">
                      <Icon className="h-7 w-7 drop-shadow" strokeWidth={2.4} />
                      <span className="text-xs font-bold bg-black/30 rounded-full px-2 py-0.5">{items.length}</span>
                    </div>
                    <span className="font-extrabold uppercase tracking-wide text-base break-words">{label}</span>
                    <span className="text-white/80 text-xs flex items-center gap-1">
                      {blink ? "🔴 Nova notificação" : items.length > 0 ? "Tocar para abrir" : "Nenhum documento"}
                      {items.length > 0 && !blink && <ChevronRight className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl p-4 border border-amber-400/30 bg-black/40 text-amber-100/80 text-xs leading-snug">
              Esta gaveta é o repositório oficial entre a administração e os gestores.
              Contratos assinados, boletos, comprovantes PIX e comunicados aparecem aqui
              automaticamente assim que são gerados ou enviados — sem necessidade de
              configuração adicional. Boletos podem ser pagos via PIX (liberação imediata)
              ou marcados manualmente como pagos.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
