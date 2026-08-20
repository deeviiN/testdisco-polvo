import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileText, Receipt, FileSignature, Folder, Inbox,
  ChevronRight, Download, ExternalLink, Loader2, Bell, QrCode, CheckCircle2,
  Search, School as SchoolIcon, Filter, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { validatePaymentBatch, type DiscardedPaymentLog } from "@/lib/paymentDocumentValidator";
import { PaymentValidationLog } from "@/components/PaymentValidationLog";
import { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";

type FolderKey = "contratos" | "boletos" | "pix" | "comunicados";

type DocItem = {
  id: string;
  folder: FolderKey;
  schoolId: string;
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
  status?: string;
};

type SchoolMini = { id: string; name: string; city: string; state: string; inep_code: string | null; network: string };

const FOLDER_META: Record<FolderKey, { label: string; icon: typeof FileText; color: string }> = {
  contratos: { label: "Contratos", icon: FileSignature, color: "from-blue-500 to-blue-700" },
  boletos: { label: "Boletos", icon: Receipt, color: "from-amber-500 to-amber-700" },
  pix: { label: "Extratos PIX", icon: QrCode, color: "from-emerald-500 to-emerald-700" },
  comunicados: { label: "Comunicados", icon: Bell, color: "from-fuchsia-500 to-fuchsia-700" },
};

const PAID_STATUS = new Set(["approved", "paid", "pago", "aprovado", "completed", "succeeded"]);

export default function AdminDocumentos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolMini[]>([]);
  const [items, setItems] = useState<DocItem[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [discards, setDiscards] = useState<DiscardedPaymentLog[]>([]);

  // UI state
  const [tab, setTab] = useState<"escola" | "tipo">("escola");
  const [search, setSearch] = useState("");
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [folderFilter, setFolderFilter] = useState<"all" | FolderKey>("all");
  const [openSchoolId, setOpenSchoolId] = useState<string | null>(null);
  const [openTypeKey, setOpenTypeKey] = useState<FolderKey | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const [schoolsRes, contratosRes, pagamentosRes, subNotifsRes] = await Promise.all([
        supabase.from("schools").select("id, name, city, state, inep_code, network"),
        supabase.from("signed_contracts").select("id, school_id, file_path, file_name, uploaded_at, signer_role, status").order("uploaded_at", { ascending: false }),
        supabase.from("pagamentos").select("id, school_id, plano, valor, metodo, status, ticket_url, qr_code, qr_code_base64, created_at, approved_at").order("created_at", { ascending: false }),
        supabase.from("subscription_notifications").select("id, school_id, subject, message, channel, event_type, created_at, sent_at").order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const sList: SchoolMini[] = (schoolsRes.data ?? []) as any[];
      const all: DocItem[] = [];

      for (const c of (contratosRes.data ?? []) as any[]) {
        if (!c.file_path || c.file_path.startsWith("__request__") || c.file_name === "__request__") continue;
        all.push({
          id: `c-${c.id}`,
          folder: "contratos",
          schoolId: c.school_id,
          title: c.file_name || "Contrato",
          subtitle: `Assinado por ${c.signer_role === "admin" ? "Administração" : "Gestor"} · ${c.status}`,
          date: c.uploaded_at,
          bucket: "signed-contracts",
          path: c.file_path,
          status: c.status,
          paid: c.status === "completed",
        });
      }

      const { docs: payDocs, discards: payDiscards } = validatePaymentBatch(
        (pagamentosRes.data ?? []) as any[],
        "admin",
      );
      for (const v of payDocs) {
        all.push({
          id: `p-${v.id}`,
          folder: v.kind === "pix" ? "pix" : "boletos",
          schoolId: v.schoolId,
          title: `${v.plano} — R$ ${v.valor}`,
          subtitle: `${v.metodo.toUpperCase()} · ${v.paid ? "PAGO" : v.status}`,
          date: v.date,
          paid: v.paid,
          paidAt: v.paidAt,
          status: v.status,
          url: v.url,
          pixCode: v.pixCode,
        });
      }

      for (const n of (subNotifsRes.data ?? []) as any[]) {
        all.push({
          id: `n-${n.id}`,
          folder: "comunicados",
          schoolId: n.school_id,
          title: n.subject || `Aviso (${n.event_type})`,
          subtitle: `Canal: ${n.channel}`,
          date: n.sent_at || n.created_at,
          body: n.message,
        });
      }

      setSchools(sList);
      setItems(all);
      setDiscards(payDiscards);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const networks = useMemo(() => {
    const s = new Set<string>();
    schools.forEach((sc) => sc.network && s.add(sc.network));
    return Array.from(s).sort();
  }, [schools]);

  const schoolMap = useMemo(() => new Map(schools.map((s) => [s.id, s])), [schools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const sc = schoolMap.get(it.schoolId);
      if (networkFilter !== "all" && sc?.network !== networkFilter) return false;
      if (statusFilter === "paid" && !it.paid) return false;
      if (statusFilter === "unpaid" && it.paid) return false;
      if (folderFilter !== "all" && it.folder !== folderFilter) return false;
      if (q) {
        const hay = `${it.title} ${it.subtitle ?? ""} ${sc?.name ?? ""} ${sc?.city ?? ""} ${sc?.inep_code ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, networkFilter, statusFilter, folderFilter, schoolMap]);

  // Group for "Por Escola"
  const bySchool = useMemo(() => {
    const map = new Map<string, DocItem[]>();
    for (const it of filtered) {
      if (!map.has(it.schoolId)) map.set(it.schoolId, []);
      map.get(it.schoolId)!.push(it);
    }
    return map;
  }, [filtered]);

  const schoolEntries = useMemo(() => {
    return schools
      .filter((s) => bySchool.has(s.id))
      .map((s) => ({ school: s, items: bySchool.get(s.id) ?? [] }))
      .sort((a, b) => a.school.name.localeCompare(b.school.name));
  }, [schools, bySchool]);

  // Group for "Por Tipo"
  const byType = useMemo(() => {
    const map: Record<FolderKey, DocItem[]> = { contratos: [], boletos: [], pix: [], comunicados: [] };
    for (const it of filtered) map[it.folder].push(it);
    return map;
  }, [filtered]);

  const openItem = async (item: DocItem) => {
    if (item.bucket && item.path) {
      try {
        setDownloading(item.id);
        const { data, error } = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 60 * 30);
        if (error || !data?.signedUrl) throw error || new Error("Sem URL");
        window.open(data.signedUrl, "_blank", "noopener");
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao abrir documento");
      } finally {
        setDownloading(null);
      }
      return;
    }
    if (item.url) { window.open(item.url, "_blank", "noopener"); return; }
    if (item.pixCode) {
      try { await navigator.clipboard.writeText(item.pixCode); toast.success("Código PIX copiado"); } catch {}
    }
  };

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/admin"));

  const clearFilters = () => {
    setSearch(""); setNetworkFilter("all"); setStatusFilter("all"); setFolderFilter("all");
  };
  const activeFilterCount = (search ? 1 : 0) + (networkFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (folderFilter !== "all" ? 1 : 0);

  const renderItemCard = (it: DocItem, showSchool = false) => {
    const sc = schoolMap.get(it.schoolId);
    const Icon = FOLDER_META[it.folder].icon;
    return (
      <button
        key={it.id}
        type="button"
        onClick={() => openItem(it)}
        disabled={downloading === it.id}
        className="relative w-full text-left rounded-xl p-3 border border-white/10 bg-black/30 hover:bg-black/50 transition-colors flex items-start gap-3 overflow-hidden"
      >
        {it.paid && (
          <span aria-hidden className="pointer-events-none absolute top-2 right-2 px-2 py-0.5 rounded-md border-2 border-emerald-400 text-emerald-300 font-black uppercase tracking-[0.18em] text-[10px] bg-emerald-500/10" style={{ transform: "rotate(-12deg)" }}>
            PAGO
          </span>
        )}
        <div className="shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center relative">
          {downloading === it.id ? <Loader2 className="h-5 w-5 text-white animate-spin" />
            : it.bucket ? <Download className="h-5 w-5 text-white" />
            : it.url ? <ExternalLink className="h-5 w-5 text-white" />
            : <Icon className="h-5 w-5 text-white" />}
          {it.paid && <CheckCircle2 className="absolute -bottom-1 -right-1 h-4 w-4 text-emerald-400 bg-black rounded-full" />}
        </div>
        <div className="flex-1 min-w-0 pr-14">
          <p className="text-white font-bold text-sm break-words">{it.title}</p>
          {showSchool && sc && (
            <p className="text-amber-200/90 text-[11px] mt-0.5 font-bold break-words">
              {sc.name} · {sc.city}/{sc.state}
            </p>
          )}
          {it.subtitle && (
            <p className={`${it.paid ? "text-emerald-300" : "text-amber-100/70"} text-xs mt-0.5 break-words font-semibold`}>{it.subtitle}</p>
          )}
          {it.date && (
            <p className="text-amber-100/50 text-[11px] mt-1">
              {format(new Date(it.date), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-[hsl(220,70%,10%)] via-[hsl(222,65%,14%)] to-[hsl(225,75%,7%)]">
      <div className="relative z-10 px-3 pt-16 pb-8 max-w-4xl mx-auto">
        {/* Header padrão */}
        <div className="mb-3">
          {(openSchoolId || openTypeKey) && (
            <nav aria-label="Navegação" className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-200/80 flex-wrap">
              <button
                type="button"
                onClick={() => { setOpenSchoolId(null); setOpenTypeKey(null); }}
                className="hover:text-amber-300 underline-offset-2 hover:underline"
              >
                Documentos
              </button>
              <ChevronRight className="h-3 w-3 opacity-60" />
              <button
                type="button"
                onClick={() => {
                  setTab(openSchoolId ? "escola" : "tipo");
                  setOpenSchoolId(null);
                  setOpenTypeKey(null);
                }}
                className="px-2 py-0.5 rounded-md bg-amber-400 text-[hsl(220,70%,10%)] hover:brightness-110"
              >
                {openSchoolId ? "Por Escola" : "Por Tipo"}
              </button>
              <ChevronRight className="h-3 w-3 opacity-60" />
              <button
                type="button"
                onClick={() => {
                  setTab(openSchoolId ? "escola" : "tipo");
                  setOpenSchoolId(null);
                  setOpenTypeKey(null);
                }}
                className="px-2 py-0.5 rounded-md bg-amber-400 text-[hsl(220,70%,10%)] hover:brightness-110 truncate max-w-[55vw]"
              >
                {openSchoolId
                  ? schoolMap.get(openSchoolId)?.name ?? "Escola"
                  : openTypeKey ? FOLDER_META[openTypeKey].label : ""}
              </button>
            </nav>
          )}
          <GestorPremiumHeader
            title={
              openSchoolId
                ? schoolMap.get(openSchoolId)?.name ?? "Escola"
                : openTypeKey
                  ? FOLDER_META[openTypeKey].label
                  : "Gaveta de Documentos"
            }
            subtitle={
              openSchoolId
                ? (() => {
                    const sc = schoolMap.get(openSchoolId);
                    const loc = [sc?.city, sc?.state].filter(Boolean).join("/");
                    const parts = [loc, sc?.inep_code ? `INEP ${sc.inep_code}` : ""].filter(Boolean);
                    return parts.join(" · ") || undefined;
                  })()
                : `${filtered.length} ${filtered.length === 1 ? "documento" : "documentos"}`
            }
            right={
              <button
                type="button"
                onClick={openSchoolId || openTypeKey ? () => { setOpenSchoolId(null); setOpenTypeKey(null); } : goBack}
                className="h-10 w-10 rounded-xl bg-black/40 backdrop-blur-md ring-1 ring-white/15 text-white flex items-center justify-center"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            }
          />
        </div>

        {/* Tabs */}
        {!openSchoolId && !openTypeKey && (
          <div className="flex gap-2 mb-3">
            {(["escola", "tipo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex-1 h-10 rounded-xl text-sm font-extrabold uppercase tracking-wide transition-all ${tab === k ? "bg-amber-400 text-[hsl(220,70%,10%)] shadow-lg ring-2 ring-amber-300 scale-[1.02]" : "bg-black/40 text-amber-100/80 ring-1 ring-white/10"}`}
              >
                {k === "escola" ? "Por Escola" : "Por Tipo"}
              </button>
            ))}
          </div>
        )}

        {/* Search + filters bar */}
        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por escola, INEP, plano, assunto…"
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-black/40 ring-1 ring-white/15 text-white placeholder-white/50 text-sm outline-none focus:ring-amber-300/60"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-white/70 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 ring-1 ${showFilters || activeFilterCount ? "bg-amber-400 text-[hsl(220,70%,10%)] ring-amber-300" : "bg-black/40 text-amber-100/90 ring-white/15"}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros {activeFilterCount > 0 && <span className="ml-0.5 bg-black/30 rounded-full px-1.5">{activeFilterCount}</span>}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="h-9 px-3 rounded-lg text-xs font-bold text-white/80 ring-1 ring-white/15 hover:bg-white/10">
                Limpar
              </button>
            )}
            <span className="ml-auto text-white/60 text-xs font-semibold">{filtered.length} {filtered.length === 1 ? "doc" : "docs"}</span>
          </div>
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-black/40 ring-1 ring-white/10">
              <label className="text-xs text-amber-100/80 font-semibold">
                Tipo
                <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value as any)} className="mt-1 w-full h-9 rounded-md bg-black/60 ring-1 ring-white/15 px-2 text-white text-sm">
                  <option value="all">Todos</option>
                  {(Object.keys(FOLDER_META) as FolderKey[]).map((k) => <option key={k} value={k}>{FOLDER_META[k].label}</option>)}
                </select>
              </label>
              <label className="text-xs text-amber-100/80 font-semibold">
                Status
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="mt-1 w-full h-9 rounded-md bg-black/60 ring-1 ring-white/15 px-2 text-white text-sm">
                  <option value="all">Todos</option>
                  <option value="paid">Pagos / concluídos</option>
                  <option value="unpaid">Pendentes</option>
                </select>
              </label>
              <label className="text-xs text-amber-100/80 font-semibold">
                Rede
                <select value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} className="mt-1 w-full h-9 rounded-md bg-black/60 ring-1 ring-white/15 px-2 text-white text-sm">
                  <option value="all">Todas</option>
                  {networks.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

        {!loading && (
          <PaymentValidationLog
            discards={discards}
            viewer="admin"
            schoolNameOf={(id) => (id ? schoolMap.get(id)?.name : undefined)}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-amber-100/80 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando documentos...
          </div>
        ) : openSchoolId ? (
          <div className="space-y-2">
            {(bySchool.get(openSchoolId) ?? []).length === 0
              ? <div className="rounded-2xl p-6 border border-white/10 bg-black/30 text-amber-100/70 text-sm text-center">Nenhum documento.</div>
              : (bySchool.get(openSchoolId) ?? []).map((it) => renderItemCard(it))}
          </div>
        ) : openTypeKey ? (
          <div className="space-y-2">
            {byType[openTypeKey].length === 0
              ? <div className="rounded-2xl p-6 border border-white/10 bg-black/30 text-amber-100/70 text-sm text-center">Nenhum documento.</div>
              : byType[openTypeKey].map((it) => renderItemCard(it, true))}
          </div>
        ) : tab === "escola" ? (
          <div className="space-y-2">
            {schoolEntries.length === 0 ? (
              <div className="rounded-2xl p-6 border border-white/10 bg-black/30 text-amber-100/70 text-sm text-center">
                Nenhuma escola com documentos para os filtros atuais.
              </div>
            ) : (
              schoolEntries.map(({ school: s, items: its }) => {
                const counts = its.reduce<Record<FolderKey, number>>((acc, it) => {
                  acc[it.folder] = (acc[it.folder] ?? 0) + 1; return acc;
                }, { contratos: 0, boletos: 0, pix: 0, comunicados: 0 });
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOpenSchoolId(s.id)}
                    className="w-full text-left rounded-xl p-3 border border-white/10 bg-black/30 hover:bg-black/50 transition flex items-start gap-3"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-400/20 flex items-center justify-center">
                      <SchoolIcon className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm break-words">{s.name}</p>
                      <p className="text-amber-100/60 text-[11px] mt-0.5">{s.city}/{s.state} · {s.network}{s.inep_code ? ` · INEP ${s.inep_code}` : ""}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {(Object.keys(counts) as FolderKey[]).filter((k) => counts[k] > 0).map((k) => (
                          <span key={k} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white">
                            {FOLDER_META[k].label}: {counts[k]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/60 shrink-0 mt-2" />
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(FOLDER_META) as FolderKey[]).map((k) => {
              const { label, icon: Icon, color } = FOLDER_META[k];
              const n = byType[k].length;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOpenTypeKey(k)}
                  className={`rounded-2xl p-4 border border-white/10 shadow-lg bg-gradient-to-br ${color} text-white flex flex-col items-start gap-2 min-h-[120px] hover:scale-[1.02] transition-transform text-left`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Icon className="h-7 w-7 drop-shadow" strokeWidth={2.4} />
                    <span className="text-xs font-bold bg-black/30 rounded-full px-2 py-0.5">{n}</span>
                  </div>
                  <span className="font-extrabold uppercase tracking-wide text-base break-words">{label}</span>
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    {n > 0 ? "Tocar para abrir" : "Nenhum documento"}
                    {n > 0 && <ChevronRight className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
