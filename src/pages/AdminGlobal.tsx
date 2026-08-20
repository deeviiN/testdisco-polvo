import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, MapPin, Building2, School as SchoolIcon, Users,
  Crown, ChevronRight, Search, Globe, Loader2, CheckCircle, AlertTriangle, Ban,
  FileText, FileSpreadsheet, KeyRound, Eye, Activity, HeartPulse, RefreshCw,
  Power, PowerOff, ShieldCheck, Clock, Shield,
} from "lucide-react";
import { AdminAccountStatusCard } from "@/components/admin/AdminAccountStatusCard";
import { AdminLinkAuditCard } from "@/components/admin/AdminLinkAuditCard";
import { AdminAIAssistant } from "@/components/admin/AdminAIAssistant";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type SchoolRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
  network: string;
  is_active: boolean;
  subscription_status: string;
  subscription_end_date: string | null;
  grace_period_days: number | null;
  days_left?: number;
  created_at?: string;
};

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  intended_role: string | null;
  is_approved: boolean;
  phone: string | null;
};

type View = "states" | "cities" | "schools" | "school" | "expiring" | "prospects";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coord. Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  gestor_pedagogico: "Gestor(a) Pedagógico(a)",
  secretario_escolar: "Assistente de Aluno",
  chef_projeto_vida: "Chef da Sala de Vídeo",
};

const STATUS_META: Record<string, { label: string; tone: string; Icon: typeof CheckCircle }> = {
  active: { label: "Ativa", tone: "bg-accent/10 text-accent border-accent/20", Icon: CheckCircle },
  grace_period: { label: "Carência", tone: "bg-warning/10 text-warning border-warning/20", Icon: AlertTriangle },
  blocked: { label: "Bloqueada", tone: "bg-destructive/10 text-destructive border-destructive/20", Icon: Ban },
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-dvh p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold font-display">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Ocorreu um erro inesperado ao carregar o painel administrativo.
          </p>
          <Button onClick={() => window.location.reload()} className="rounded-xl gap-2">
            <RefreshCw className="h-4 w-4" />
            Recarregar página
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AdminGlobal() {
  return (
    <ErrorBoundary>
      <AdminGlobalContent />
    </ErrorBoundary>
  );
}

function AdminGlobalContent() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [allSchools, setAllSchools] = useState<SchoolRow[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [expiringSchools, setExpiringSchools] = useState<SchoolRow[]>([]);
  const [prospectSchools, setProspectSchools] = useState<SchoolRow[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [schoolPage, setSchoolPage] = useState(1);
  const SCHOOLS_PER_PAGE = 20;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [searchResults, setSearchResults] = useState<SchoolRow[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setSchoolPage(1); // Reseta paginação ao mudar a busca
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Busca global quando o termo de busca é longo o suficiente
  useEffect(() => {
    if (debouncedSearch.length < 3) {
      setSearchResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    (async () => {
      setIsSearchingGlobal(true);
      try {
        const { data, error } = await supabase.rpc("list_schools_admin_paginated", {
          _state: null,
          _city: null,
          _network: null,
          _search: debouncedSearch,
          _limit: 50,
          _offset: 0
        });
        if (error) throw error;
        setSearchResults((data ?? []) as SchoolRow[]);
      } catch (e) {
        console.error("Erro na busca global:", e);
      } finally {
        setIsSearchingGlobal(false);
      }
    })();
  }, [debouncedSearch]);

  const [view, setView] = useState<View>("states");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRow | null>(null);


  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const isAdminGlobal = useMemo(() => {
    if (!isAdmin || !user) return false;
    // Se logado como admin mas não tem perfil vinculado a escola, é um admin global puro
    return !selectedSchool && view === "school";
  }, [isAdmin, user, selectedSchool, view]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [exporting, setExporting] = useState<null | "csv" | "pdf">(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");
  const [exportSelectedStates, setExportSelectedStates] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "active" | "blocked">(null);
  const [bulkConfirm, setBulkConfirm] = useState<null | "active" | "blocked">(null);
  const [previewLoading, setPreviewLoading] = useState<null | "active" | "blocked">(null);
  const [previewData, setPreviewData] = useState<null | {
    status: "active" | "blocked";
    total: number;
    wouldUpdate: number;
    preserved: number;
    alreadyInStatus: number;
  }>(null);
  const [bulkResult, setBulkResult] = useState<null | {
    status: "active" | "blocked";
    ok: boolean;
    updated: number;
    preserved: number;
    finishedAt: Date;
    error?: string;
  }>(null);

  // Histórico/Exportação de ações em massa
  type BulkHistoryItem = {
    id: string;
    created_at: string;
    status: "active" | "blocked" | string;
    updated: number;
    preserved: number;
    ok: boolean;
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyItems, setHistoryItems] = useState<BulkHistoryItem[]>([]);
  const HISTORY_PAGE_SIZE = 200;
  const todayRef = new Date();
  const [filterAction, setFilterAction] = useState<"all" | "active" | "blocked">("all");
  const [filterResult, setFilterResult] = useState<"all" | "ok" | "fail">("all");
  const [filterFrom, setFilterFrom] = useState<string>(
    new Date(todayRef.getFullYear(), todayRef.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [filterTo, setFilterTo] = useState<string>(todayRef.toISOString().slice(0, 10));
  const [healthStatus, setHealthStatus] = useState<any[]>([]);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const runPreview = async (status: "active" | "blocked") => {
    setPreviewLoading(status);
    setPreviewData(null);
    try {
      const { data, error } = await (supabase as any).rpc("preview_bulk_set_schools_status", { _status: status });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setPreviewData({
        status,
        total: row?.total_schools ?? 0,
        wouldUpdate: row?.would_update ?? 0,
        preserved: row?.preserved_subscribers ?? 0,
        alreadyInStatus: row?.already_in_status ?? 0,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar pré-visualização.");
    } finally {
      setPreviewLoading(null);
    }
  };

  const runBulkSetSchools = async (status: "active" | "blocked") => {
    setBulkAction(status);
    setBulkResult(null);
    try {
      const { data, error } = await (supabase as any).rpc("bulk_set_schools_status", { _status: status });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const updated = row?.updated_count ?? 0;
      const preserved = row?.preserved_count ?? 0;
      setBulkResult({ status, ok: true, updated, preserved, finishedAt: new Date() });
      toast.success(
        status === "blocked"
          ? `Desativação concluída: ${updated} escola(s) bloqueadas, ${preserved} assinante(s) preservada(s).`
          : `Ativação concluída: ${updated} escola(s) reativadas, ${preserved} assinante(s) inalteradas.`
      );
      setPreviewData(null);
    } catch (e: any) {
      const msg = e?.message ?? "Falha desconhecida ao executar ação em massa.";
      setBulkResult({ status, ok: false, updated: 0, preserved: 0, finishedAt: new Date(), error: msg });
      toast.error(`Erro ao ${status === "blocked" ? "desativar" : "ativar"} escolas: ${msg}`);
    } finally {
      setBulkAction(null);
      // Mantém o diálogo aberto para exibir o resumo
    }
  };

  // Dispara prévia automaticamente ao abrir o diálogo de confirmação
  useEffect(() => {
    if (bulkConfirm && !previewData && previewLoading === null && !bulkResult) {
      runPreview(bulkConfirm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkConfirm]);

  const exportBulkResult = (format: "csv" | "pdf") => {
    if (!bulkResult || !bulkResult.ok) return;
    const acao = bulkResult.status === "blocked" ? "Desativação em massa" : "Ativação em massa";
    const dataHora = bulkResult.finishedAt.toLocaleString("pt-BR");
    const statusLabel = bulkResult.ok ? "Sucesso" : "Falha";
    const stamp = bulkResult.finishedAt.toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      const rows = [
        ["Métrica", "Valor"],
        ["Ação", acao],
        ["Status", statusLabel],
        ["Data/Hora", dataHora],
        ["Escolas atualizadas", String(bulkResult.updated)],
        ["Assinantes preservados", String(bulkResult.preserved)],
      ];
      const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-acao-em-massa-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exportado com sucesso");
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Ação em Massa", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Painel Administrativo Global", 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [["Métrica", "Valor"]],
      body: [
        ["Ação", acao],
        ["Status", statusLabel],
        ["Data/Hora", dataHora],
        ["Escolas atualizadas", String(bulkResult.updated)],
        ["Assinantes preservados", String(bulkResult.preserved)],
      ],
      headStyles: { fillColor: [44, 62, 110] },
      styles: { fontSize: 11, cellPadding: 4 },
    });
    doc.save(`relatorio-acao-em-massa-${stamp}.pdf`);
    toast.success("PDF exportado com sucesso");
  };

  const fetchHistoryPage = async (offset: number) => {
    const fromIso = new Date(`${filterFrom}T00:00:00`).toISOString();
    const toIso = new Date(`${filterTo}T23:59:59.999`).toISOString();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, created_at, new_data")
      .eq("action", "bulk_set_schools_status")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + HISTORY_PAGE_SIZE - 1);
    if (error) throw error;
    const items: BulkHistoryItem[] = (data || []).map((r: any) => {
      const nd = r.new_data || {};
      return {
        id: r.id,
        created_at: r.created_at,
        status: String(nd.status ?? "active"),
        updated: Number(nd.updated ?? 0),
        preserved: Number(nd.preserved ?? 0),
        ok: nd.ok === false ? false : true,
      };
    });
    return items;
  };

  const loadBulkHistory = async () => {
    setHistoryLoading(true);
    setHistoryHasMore(false);
    try {
      const items = await fetchHistoryPage(0);
      setHistoryItems(items);
      setHistoryHasMore(items.length === HISTORY_PAGE_SIZE);
    } catch (err: any) {
      toast.error("Erro ao carregar histórico: " + (err?.message || "desconhecido"));
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    try {
      const items = await fetchHistoryPage(historyItems.length);
      setHistoryItems((prev) => [...prev, ...items]);
      setHistoryHasMore(items.length === HISTORY_PAGE_SIZE);
    } catch (err: any) {
      toast.error("Erro ao carregar mais: " + (err?.message || "desconhecido"));
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const filteredHistory = useMemo(() => {
    return historyItems.filter((it) => {
      if (filterAction !== "all" && it.status !== filterAction) return false;
      if (filterResult === "ok" && !it.ok) return false;
      if (filterResult === "fail" && it.ok) return false;
      return true;
    });
  }, [historyItems, filterAction, filterResult]);

  const exportFilteredHistory = (format: "csv" | "pdf") => {
    if (filteredHistory.length === 0) {
      toast.error("Nenhum registro para exportar com os filtros atuais");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const header = ["Data/Hora", "Ação", "Status", "Atualizadas", "Preservadas"];
    const rows = filteredHistory.map((it) => [
      new Date(it.created_at).toLocaleString("pt-BR"),
      it.status === "blocked" ? "Desativação" : "Ativação",
      it.ok ? "Sucesso" : "Falha",
      String(it.updated),
      String(it.preserved),
    ]);

    if (format === "csv") {
      const csv = "\uFEFF" + [header, ...rows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historico-acoes-massa-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV exportado (${filteredHistory.length} registro(s))`);
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text("Histórico de Ações em Massa", 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    const filtroDesc = `Período: ${filterFrom} a ${filterTo} | Ação: ${filterAction === "all" ? "Todas" : filterAction === "blocked" ? "Desativação" : "Ativação"} | Status: ${filterResult === "all" ? "Todos" : filterResult === "ok" ? "Sucesso" : "Falha"}`;
    doc.text(filtroDesc, 14, 22);
    doc.text(`Total: ${filteredHistory.length} registro(s)`, 14, 27);
    autoTable(doc, {
      startY: 32,
      head: [header],
      body: rows,
      headStyles: { fillColor: [44, 62, 110] },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    doc.save(`historico-acoes-massa-${stamp}.pdf`);
    toast.success(`PDF exportado (${filteredHistory.length} registro(s))`);
  };


  useEffect(() => {
    if (historyOpen) { loadBulkHistory(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, filterFrom, filterTo]);

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    (async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      setIsAdmin(!!data);
    })();
  }, [user]);

  useEffect(() => {
    if (isAdmin !== true) return;
    (async () => {
      setLoadingSchools(true);
      try {
        const { data, error } = await supabase.rpc("list_school_states_admin");
        if (error) throw error;
        
        const counts = (data ?? []) as any[];
        // Transformamos para o formato esperado pelas agregações legadas (opcional, ou refatoramos as agregações)
        // Para minimizar quebra de código, vamos manter o stateAgg mas populado via RPC
        setAllSchools(counts.flatMap(c => Array(Number(c.school_count)).fill({ state: c.state, name: '', city: '', subscription_status: 'active' })));
      } catch (e: any) {
        console.error("Erro ao carregar resumo de estados:", e);
        toast.error("Erro ao carregar dados. Tente atualizar a página.");
      } finally {
        setLoadingSchools(false);
      }
    })();
  }, [isAdmin]);

  // Carregamento detalhado por estado (municípios) quando selecionado
  useEffect(() => {
    if (isAdmin !== true || !selectedState || view !== "cities") return;
    
    (async () => {
      setLoadingSchools(true);
      try {
        const { data, error } = await supabase.rpc("list_school_cities_admin", { _state: selectedState });
        if (error) throw error;
        
        const cityCounts = (data ?? []) as any[];
        setAllSchools(prev => {
          const others = prev.filter(s => s.state !== selectedState);
          const newRows = cityCounts.flatMap(c => Array(Number(c.school_count)).fill({ 
            state: selectedState, 
            city: c.city, 
            name: '', 
            subscription_status: 'active' 
          }));
          return [...others, ...newRows];
        });
      } catch (e: any) {
        console.error("Erro ao carregar municípios do estado:", e);
        toast.error("Erro ao carregar cidades deste estado.");
      } finally {
        setLoadingSchools(false);
      }
    })();
  }, [isAdmin, selectedState, view]);

  // Carregamento detalhado de escolas de um município
  useEffect(() => {
    if (isAdmin !== true || !selectedState || !selectedCity || view !== "schools") return;
    
    (async () => {
      setLoadingSchools(true);
      try {
        const { data, error } = await supabase.rpc("list_schools_admin_paginated", {
          _state: selectedState,
          _city: selectedCity,
          _limit: 1000, // Pegamos o máximo razoável para a lista local do AdminGlobal
          _offset: 0
        });
        
        if (error) throw error;
        
        setAllSchools(prev => {
          const others = prev.filter(s => s.state !== selectedState || s.city !== selectedCity || s.name === '');
          return [...others, ...(data as unknown as SchoolRow[])];
        });
      } catch (e: any) {
        console.error("Erro ao carregar escolas do município:", e);
        toast.error("Erro ao carregar a lista de escolas.");
      } finally {
        setLoadingSchools(false);
      }
    })();
  }, [isAdmin, selectedState, selectedCity, view]);

  const loadAdminLists = useCallback(async (retryCount = 0) => {
    if (isAdmin !== true) return;
    setLoadingLists(true);
    try {
      const [expiringRes, prospectsRes] = await Promise.all([
        supabase.rpc("list_expiring_schools_admin", { _limit: 50, _offset: 0 }),
        supabase.rpc("list_prospect_schools_admin", { _limit: 50, _offset: 0 })
      ]);

      if (expiringRes.error || prospectsRes.error) {
        throw expiringRes.error || prospectsRes.error;
      }

      setExpiringSchools((expiringRes.data ?? []) as SchoolRow[]);
      setProspectSchools((prospectsRes.data ?? []) as SchoolRow[]);
    } catch (e: any) {
      console.error("Erro ao carregar listas (tentativa " + (retryCount + 1) + "):", e);
      if (retryCount < 2) {
        setTimeout(() => loadAdminLists(retryCount + 1), 1500 * (retryCount + 1));
      } else {
        toast.error("Erro persistente ao carregar listas administrativas.");
      }
    } finally {
      setLoadingLists(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadAdminLists();
  }, [loadAdminLists]);

  // Carrega perfis ao abrir uma escola
  useEffect(() => {
    if (view !== "school" || !selectedSchool) return;
    (async () => {
      setLoadingProfiles(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,full_name,role,intended_role,is_approved,phone")
        .eq("school_id", selectedSchool.id)
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) {
        toast.error("Falha ao carregar usuários da escola");
        setProfiles([]);
      } else {
        setProfiles((data ?? []) as ProfileRow[]);
      }
      setLoadingProfiles(false);
    })();
  }, [view, selectedSchool]);

  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (view !== "school" || !selectedSchool) {
      setDaysRemaining(null);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("get_school_subscription_countdown", { _school_id: selectedSchool.id });
      setDaysRemaining(data as number);
    })();
  }, [view, selectedSchool]);

  // Agregações
  const stateAgg = useMemo(() => {
    const map = new Map<string, { schools: number; cities: Set<string> }>();
    for (const s of allSchools) {
      const cur = map.get(s.state) ?? { schools: 0, cities: new Set<string>() };
      cur.schools += 1;
      cur.cities.add(s.city);
      map.set(s.state, cur);
    }
    return Array.from(map.entries())
      .map(([state, v]) => ({ state, schools: v.schools, cities: v.cities.size }))
      .sort((a, b) => b.schools - a.schools);
  }, [allSchools]);

  const cityAgg = useMemo(() => {
    if (!selectedState) return [];
    const map = new Map<string, number>();
    for (const s of allSchools) {
      if (s.state !== selectedState) continue;
      map.set(s.city, (map.get(s.city) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([city, schools]) => ({ city, schools }))
      .sort((a, b) => b.schools - a.schools || a.city.localeCompare(b.city));
  }, [allSchools, selectedState]);

  const schoolList = useMemo(() => {
    if (!selectedState || !selectedCity) return [];
    return allSchools
      .filter((s) => s.state === selectedState && s.city === selectedCity)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSchools, selectedState, selectedCity]);

  const filteredStates = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return stateAgg;
    return stateAgg.filter((s) => s.state.toLowerCase().includes(q));
  }, [stateAgg, debouncedSearch]);

  const filteredCities = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return cityAgg;
    return cityAgg.filter((c) => c.city.toLowerCase().includes(q));
  }, [cityAgg, debouncedSearch]);

  const filteredSchoolList = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = schoolList;
    if (q) {
      list = schoolList.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.inep_code ?? "").toLowerCase().includes(q)
      );
    }
    // Retorna apenas até a página atual para lazy loading
    return list.slice(0, schoolPage * SCHOOLS_PER_PAGE);
  }, [schoolList, debouncedSearch, schoolPage]);

  const hasMoreSchools = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = schoolList;
    if (q) {
      list = schoolList.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.inep_code ?? "").toLowerCase().includes(q)
      );
    }
    return (schoolPage * SCHOOLS_PER_PAGE) < list.length;
  }, [schoolList, debouncedSearch, schoolPage]);

  // Health check auto-poll (must be declared before any conditional returns)
  useEffect(() => {
    if (isAdmin === true) {
      checkSystemHealth();
      const interval = setInterval(checkSystemHealth, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  // Guards
  if (loading || isAdmin === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const goBack = () => {
    if (search.trim() !== "") { setSearch(""); return; }
    if (view === "school") { setSelectedSchool(null); setView("schools"); setSearch(""); return; }
    if (view === "schools") { setSelectedCity(null); setView("cities"); setSearch(""); setSchoolPage(1); return; }
    if (view === "cities") { setSelectedState(null); setView("states"); setSearch(""); return; }
    navigate("/admin");
  };

  const totalSchools = allSchools.length;

  // ===== Exportação hierárquica =====

  const fetchAllProfilesForSchools = async (schoolIds: string[]) => {
    if (schoolIds.length === 0) return new Map<string, ProfileRow[]>();
    const { data, error } = await supabase
      .from("profiles")
      .select("id,user_id,full_name,role,intended_role,is_approved,phone,school_id")
      .in("school_id", schoolIds)
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });
    if (error) throw error;
    const map = new Map<string, ProfileRow[]>();
    for (const row of (data ?? []) as (ProfileRow & { school_id: string })[]) {
      const arr = map.get(row.school_id) ?? [];
      arr.push(row);
      map.set(row.school_id, arr);
    }
    return map;
  };

  const buildHierarchy = (statesFilter?: Set<string>) => {
    const tree = new Map<string, Map<string, SchoolRow[]>>();
    for (const s of allSchools) {
      if (statesFilter && statesFilter.size > 0 && !statesFilter.has(s.state)) continue;
      if (!tree.has(s.state)) tree.set(s.state, new Map());
      const cityMap = tree.get(s.state)!;
      const arr = cityMap.get(s.city) ?? [];
      arr.push(s);
      cityMap.set(s.city, arr);
    }
    return tree;
  };

  const getSchoolsForExport = (statesFilter?: Set<string>) => {
    if (!statesFilter || statesFilter.size === 0) return allSchools;
    return allSchools.filter((s) => statesFilter.has(s.state));
  };

  const handleExportCSV = async (statesFilter?: Set<string>) => {
    try {
      setExporting("csv");
      const schools = getSchoolsForExport(statesFilter);
      if (schools.length === 0) { toast.error("Nenhuma escola nos filtros selecionados"); return; }
      const profilesBySchool = await fetchAllProfilesForSchools(schools.map((s) => s.id));
      const tree = buildHierarchy(statesFilter);
      const lines: string[] = [];
      const esc = (v: unknown) => {
        const str = v == null ? "" : String(v);
        return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      lines.push(["Estado","Cidade","Escola","INEP","Rede","Status","Categoria","Nome","Função","Telefone","Aprovado"].map(esc).join(";"));
      const states = Array.from(tree.keys()).sort();
      for (const state of states) {
        const cities = Array.from(tree.get(state)!.keys()).sort();
        for (const city of cities) {
          const schoolsArr = tree.get(state)!.get(city)!.slice().sort((a, b) => a.name.localeCompare(b.name));
          for (const sch of schoolsArr) {
            const ps = profilesBySchool.get(sch.id) ?? [];
            const gestores = ps.filter((p) => ["gestor_pedagogico","chef_projeto_vida"].includes(p.role));
            const outros = ps.filter((p) => !["gestor_pedagogico","chef_projeto_vida"].includes(p.role));
            const baseCols = [state, city, sch.name, sch.inep_code ?? "", sch.network, STATUS_META[sch.subscription_status]?.label ?? sch.subscription_status];
            if (ps.length === 0) {
              lines.push([...baseCols, "—", "(sem usuários)", "", "", ""].map(esc).join(";"));
              continue;
            }
            const labelOf = (p: ProfileRow) => {
              const r = !p.is_approved && p.intended_role ? p.intended_role : p.role;
              const base = ROLE_LABELS[r] ?? r;
              return !p.is_approved && p.intended_role && p.intended_role !== p.role ? `${base} (pretendido)` : base;
            };
            for (const p of gestores) lines.push([...baseCols, "Gestor", p.full_name, labelOf(p), p.phone ?? "", p.is_approved ? "Sim" : "Não"].map(esc).join(";"));
            for (const p of outros) lines.push([...baseCols, "Usuário", p.full_name, labelOf(p), p.phone ?? "", p.is_approved ? "Sim" : "Não"].map(esc).join(";"));
          }
        }
      }
      const csv = "\uFEFF" + lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = statesFilter && statesFilter.size > 0 ? `-${Array.from(statesFilter).sort().join("_")}` : "";
      a.download = `visao-global${suffix}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV gerado com sucesso");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar CSV");
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async (statesFilter?: Set<string>) => {
    try {
      setExporting("pdf");
      const schoolsScope = getSchoolsForExport(statesFilter);
      if (schoolsScope.length === 0) { toast.error("Nenhuma escola nos filtros selecionados"); return; }
      const profilesBySchool = await fetchAllProfilesForSchools(schoolsScope.map((s) => s.id));
      const tree = buildHierarchy(statesFilter);
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const today = new Date().toLocaleDateString("pt-BR");
      const scopeLabel = statesFilter && statesFilter.size > 0
        ? `Estados: ${Array.from(statesFilter).sort().join(", ")}`
        : "Todos os estados";
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Visão Global - Escolas com Plano", 14, 16);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${schoolsScope.length} escola(s) · ${tree.size} estado(s) · ${scopeLabel} · gerado em ${today}`, 14, 22);

      let y = 28;
      const states = Array.from(tree.keys()).sort();
      for (const state of states) {
        const cities = Array.from(tree.get(state)!.keys()).sort();
        const stateSchoolCount = Array.from(tree.get(state)!.values()).reduce((a, c) => a + c.length, 0);
        if (y > 270) { doc.addPage(); y = 16; }
        doc.setFillColor(30, 64, 138);
        doc.rect(14, y - 4, 182, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${state}  ·  ${stateSchoolCount} escola(s)  ·  ${cities.length} cidade(s)`, 16, y + 1);
        doc.setTextColor(0, 0, 0);
        y += 6;

        for (const city of cities) {
          const schoolsArr = tree.get(state)!.get(city)!.slice().sort((a, b) => a.name.localeCompare(b.name));
          if (y > 270) { doc.addPage(); y = 16; }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60, 60, 60);
          doc.text(`${city}  (${schoolsArr.length})`, 16, y + 4);
          doc.setTextColor(0, 0, 0);
          y += 6;

          for (const sch of schoolsArr) {
            const ps = profilesBySchool.get(sch.id) ?? [];
            const gestores = ps.filter((p) => ["gestor_pedagogico","chef_projeto_vida"].includes(p.role));
            const outros = ps.filter((p) => !["gestor_pedagogico","chef_projeto_vida"].includes(p.role));
            const rows: string[][] = [];
            const labelOf = (p: ProfileRow) => {
              const r = !p.is_approved && p.intended_role ? p.intended_role : p.role;
              const base = ROLE_LABELS[r] ?? r;
              return !p.is_approved && p.intended_role && p.intended_role !== p.role ? `${base} (pretendido)` : base;
            };
            for (const p of gestores) rows.push(["Gestor", p.full_name, labelOf(p), p.phone ?? "—", p.is_approved ? "Sim" : "Não"]);
            for (const p of outros) rows.push(["Usuário", p.full_name, labelOf(p), p.phone ?? "—", p.is_approved ? "Sim" : "Não"]);
            if (rows.length === 0) rows.push(["—", "(sem usuários cadastrados)", "", "", ""]);

            autoTable(doc, {
              startY: y,
              margin: { left: 18, right: 14 },
              head: [[`${sch.name}  ·  INEP ${sch.inep_code || "—"}  ·  ${STATUS_META[sch.subscription_status]?.label ?? sch.subscription_status}`]],
              body: [],
              theme: "plain",
              headStyles: { fillColor: [240, 240, 245], textColor: 30, fontStyle: "bold", fontSize: 9 },
            });
            autoTable(doc, {
              startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY,
              margin: { left: 18, right: 14 },
              head: [["Categoria", "Nome", "Função", "Telefone", "Aprovado"]],
              body: rows,
              theme: "striped",
              styles: { fontSize: 8, cellPadding: 1.5 },
              headStyles: { fillColor: [220, 225, 235], textColor: 30, fontStyle: "bold" },
              columnStyles: { 0: { cellWidth: 18 }, 4: { cellWidth: 18, halign: "center" } },
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
            if (y > 275) { doc.addPage(); y = 16; }
          }
        }
        y += 2;
      }

      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: "right" });
      }
      const suffix = statesFilter && statesFilter.size > 0 ? `-${Array.from(statesFilter).sort().join("_")}` : "";
      doc.save(`visao-global${suffix}-${new Date().toISOString().slice(0,10)}.pdf`);
      toast.success("PDF gerado com sucesso");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar PDF");
    } finally {
      setExporting(null);
    }
  };

  const openExportDialog = (format: "csv" | "pdf") => {
    setExportFormat(format);
    // Pré-seleciona o estado em foco se houver
    if (selectedState) {
      setExportSelectedStates(new Set([selectedState]));
    } else if (exportSelectedStates.size === 0) {
      setExportSelectedStates(new Set());
    }
    setExportDialogOpen(true);
  };

  const confirmExport = async () => {
    setExportDialogOpen(false);
    const filter = exportSelectedStates.size === 0 ? undefined : exportSelectedStates;
    if (exportFormat === "csv") await handleExportCSV(filter);
    else await handleExportPDF(filter);
  };


  const checkSystemHealth = async () => {
    setCheckingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke("system-health-check");
      if (error) throw error;
      setHealthStatus(data?.results || []);
      toast.success("Status do sistema atualizado");
    } catch (e: any) {
      console.error(e);
      toast.error("Falha ao verificar saúde do sistema");
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleResetPassword = async (p: ProfileRow) => {
    const ok = window.confirm(
      `Enviar e-mail de redefinição de senha para ${p.full_name}?\n\nA ação será registrada no log de auditoria.`
    );
    if (!ok) return;
    try {
      setResettingUserId(p.user_id);
      const redirectTo = `${window.location.origin}/reset-password`;
      const { data, error } = await supabase.functions.invoke("admin-user-details", {
        body: { user_id: p.user_id, action: "send_password_reset", redirect_to: redirectTo },
      });
      if (error) throw error;
      const d = data as { success?: boolean; email?: string; error?: string };
      if (!d?.success) throw new Error(d?.error || "Falha ao enviar reset");
      toast.success(`E-mail enviado para ${d.email}`);
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Falha ao enviar redefinição de senha");
    } finally {
      setResettingUserId(null);
    }
  };

  const headerTitle =
    view === "states" ? "Visão Global"
    : view === "cities" ? selectedState ?? "Cidades"
    : view === "schools" ? `${selectedCity} · ${selectedState}`
    : view === "expiring" ? "Alerta de Expiração"
    : view === "prospects" ? "Prospectos de Venda"
    : selectedSchool?.name ?? "Escola";

  const headerSub =
    view === "states" ? `${totalSchools} escola(s) com plano em ${stateAgg.length} estado(s)`
    : view === "cities" ? `${cityAgg.length} cidade(s) · ${cityAgg.reduce((a, c) => a + c.schools, 0)} escola(s)`
    : view === "schools" ? `${schoolList.length} escola(s) com plano`
    : view === "expiring" ? "Planos que vencem nos próximos 14 dias"
    : view === "prospects" ? "Escolas cadastradas sem plano ativo"
    : selectedSchool ? `${selectedSchool.city} · ${selectedSchool.state}` : "";

  const gestores = profiles.filter((p) => ["gestor_pedagogico", "chef_projeto_vida"].includes(p.role));
  const outros = profiles.filter((p) => !["gestor_pedagogico", "chef_projeto_vida"].includes(p.role));

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <AdminAIAssistant />
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl shrink-0"
            onClick={goBack}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold font-display truncate">{headerTitle}</h1>
            <p className="text-[10px] text-muted-foreground truncate uppercase font-bold tracking-wider">{headerSub}</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="default"
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5 font-bold bg-amber-500 hover:bg-amber-600 text-amber-950"
              onClick={() => navigate("/admin/console")}
              title="Console do Administrador"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Console</span>
            </Button>
            <Button
              variant={view === "expiring" ? "default" : "outline"}
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5 font-bold"
              onClick={() => { setView("expiring"); setSearch(""); }}
              title="Escolas Expirando"
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Vencimentos</span>
            </Button>
            <Button
              variant={view === "prospects" ? "default" : "outline"}
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5 font-bold"
              onClick={() => { setView("prospects"); setSearch(""); }}
              title="Escolas sem Plano"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Sem Plano</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5"
              onClick={() => openExportDialog("csv")}
              disabled={exporting !== null || allSchools.length === 0}
              aria-label="Gerar CSV"
              title="Gerar CSV"
            >
              {exporting === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              <span className="hidden sm:inline text-xs font-semibold">Gerar CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5"
              onClick={() => openExportDialog("pdf")}
              disabled={exporting !== null || allSchools.length === 0}
              aria-label="Gerar PDF"
              title="Gerar PDF"
            >
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span className="hidden sm:inline text-xs font-semibold">Gerar PDF</span>
            </Button>
            <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5 font-bold border-destructive/20 text-destructive hover:bg-destructive/5"
              onClick={() => setBulkConfirm("blocked")}
              title="Desativar todas sem plano"
            >
              <PowerOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Desativar Tudo</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl gap-1.5 px-2.5 font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5"
              onClick={() => setBulkConfirm("active")}
              title="Reativar todas"
            >
              <Power className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Ativar Tudo</span>
            </Button>
          </div>
        </div>

        {view !== "school" && (
          <div className="max-w-4xl mx-auto px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  view === "states" ? "Buscar estado..."
                  : view === "cities" ? "Buscar cidade..."
                  : view === "expiring" ? "Buscar escola expirando..."
                  : view === "prospects" ? "Buscar prospecto..."
                  : "Buscar escola ou INEP..."
                }
                className="pl-9 h-10 rounded-xl"
              />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
          {loadingSchools && !debouncedSearch ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : debouncedSearch.length >= 3 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Resultados da Busca Global</p>
                <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">Brasil Inteiro</Badge>
              </div>
              
              {isSearchingGlobal ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults.length === 0 ? (
                <EmptyState text="Nenhuma escola encontrada com este nome ou INEP." />
              ) : (
                searchResults.map((s) => {
                  const meta = STATUS_META[s.subscription_status] ?? STATUS_META.active;
                  const Icon = meta.Icon;
                  return (
                    <Card
                      key={s.id}
                      role="button"
                      onClick={() => { setSelectedSchool(s); setView("school"); setSearch(""); }}
                      className="border-0 shadow-card cursor-pointer hover:shadow-card-hover transition-all overflow-hidden"
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                          <SchoolIcon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-bold text-sm leading-tight text-foreground/90">{s.name}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{s.city}, {s.state}</span>
                            <span className="text-[10px] font-bold text-primary/80 uppercase tracking-widest bg-primary/5 px-1.5 py-0.5 rounded">
                              {s.network ? s.network.charAt(0).toUpperCase() + s.network.slice(1).toLowerCase() : "—"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-black rounded-full border px-2.5 py-0.5 shadow-sm ${meta.tone}`}>
                            <Icon className="h-2.5 w-2.5" />
                            {meta.label}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-30" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          ) : (
            <>
              {view === "states" && (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <Card 
                    className="border-0 shadow-card bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors"
                    onClick={() => setView("expiring")}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Clock className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-amber-700 leading-none mb-1">Vencimentos</p>
                        <p className="text-xl font-black text-amber-600 leading-none">{expiringSchools.length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card 
                    className="border-0 shadow-card bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => setView("prospects")}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-primary leading-none mb-1">Sem Plano</p>
                        <p className="text-xl font-black text-primary leading-none">{prospectSchools.length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card 
                    className="border-0 shadow-card bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10 transition-all hover:scale-[1.02] active:scale-95 group"
                    onClick={() => navigate("/admin/security")}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/30 transition-colors">
                        <Shield className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-black uppercase text-emerald-700 leading-none mb-1.5 tracking-wider">Segurança do Banco</p>
                        <p className="text-2xl font-black text-emerald-600 leading-none">Linter</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-emerald-600/30 group-hover:text-emerald-600 transition-colors" />
                    </CardContent>
                  </Card>

                </div>
              )}

              {view === "expiring" && (
                expiringSchools.length === 0 ? (
                  <EmptyState text="Nenhuma escola expirando nos próximos 14 dias." />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Alerta de Expiração</p>
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Próximos 14 dias</Badge>
                    </div>
                    {expiringSchools.map((s) => (
                      <Card
                        key={s.id}
                        role="button"
                        onClick={() => { setSelectedSchool(s); setView("school"); }}
                        className="border-0 shadow-card cursor-pointer hover:shadow-card-hover transition-all border-l-4 border-amber-500 overflow-hidden"
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                            <Clock className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-bold text-sm leading-tight truncate">{s.name}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{s.city}, {s.state}</span>
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/50">
                                {s.network ? s.network.charAt(0).toUpperCase() + s.network.slice(1).toLowerCase() : "—"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end">
                            <p className={`font-black text-sm leading-none ${s.days_left === 0 ? "text-destructive" : "text-amber-600"}`}>
                              {s.days_left === 0 ? "HOJE" : `${s.days_left}d`}
                            </p>
                            <p className="text-[8px] text-muted-foreground uppercase font-black tracking-tighter mt-1">Restantes</p>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-30 mt-1" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              )}

              {view === "prospects" && (
                prospectSchools.length === 0 ? (
                  <EmptyState text="Nenhuma escola sem plano encontrada." />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Novas Escolas (Sem Plano)</p>
                      <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">Leads de Venda</Badge>
                    </div>
                    {prospectSchools.map((s) => (
                      <Card
                        key={s.id}
                        role="button"
                        onClick={() => { setSelectedSchool(s); setView("school"); }}
                        className="border-0 shadow-card cursor-pointer hover:shadow-card-hover transition-all border-l-4 border-primary overflow-hidden"
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-bold text-sm leading-tight truncate">{s.name}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{s.city}, {s.state}</span>
                              <span className="text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                                {s.network ? s.network.charAt(0).toUpperCase() + s.network.slice(1).toLowerCase() : "—"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end">
                            <p className="font-bold text-[11px] text-primary leading-none">
                              {new Date(s.created_at!).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="text-[8px] text-muted-foreground uppercase font-black tracking-tighter mt-1">Cadastro</p>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-30 mt-1" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              )}

              {/* ESTADOS */}
              {view === "states" && (

                filteredStates.length === 0 ? (
                  <EmptyState text="Nenhum estado com escolas assinantes." />
                ) : (
                  filteredStates.map((s) => (
                    <Card
                      key={s.state}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedState(s.state); setView("cities"); setSearch(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedState(s.state); setView("cities"); setSearch(""); } }}
                      className="border-0 shadow-card cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-base">{s.state}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.schools} escola(s) · {s.cities} cidade(s)
                          </p>
                        </div>
                        <Badge variant="secondary" className="font-mono">{s.schools}</Badge>
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  ))
                )
              )}

              {/* CIDADES */}
              {view === "cities" && (
                filteredCities.length === 0 ? (
                  <EmptyState text="Nenhuma cidade encontrada." />
                ) : (
                  filteredCities.map((c) => (
                    <Card
                      key={c.city}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedCity(c.city); setView("schools"); setSearch(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCity(c.city); setView("schools"); setSearch(""); } }}
                      className="border-0 shadow-card cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-accent" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-base break-words">{c.city}</p>
                          <p className="text-xs text-muted-foreground">{c.schools} escola(s) com plano</p>
                        </div>
                        <Badge variant="secondary" className="font-mono">{c.schools}</Badge>
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  ))
                )
              )}

              {/* ESCOLAS */}
              {view === "schools" && (
                filteredSchoolList.length === 0 ? (
                  <EmptyState text="Nenhuma escola encontrada." />
                ) : (
                  filteredSchoolList.map((s) => {
                    const meta = STATUS_META[s.subscription_status] ?? STATUS_META.active;
                    const Icon = meta.Icon;
                    return (
                      <Card
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setSelectedSchool(s); setView("school"); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSchool(s); setView("school"); } }}
                        className="border-0 shadow-card cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all overflow-hidden"
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                            <SchoolIcon className="h-6 w-6 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-bold text-sm leading-tight text-foreground/90">{s.name}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                INEP: {s.inep_code || "—"}
                              </span>
                              <span className="text-[10px] font-bold text-primary/80 uppercase tracking-widest bg-primary/5 px-1.5 py-0.5 rounded">
                                {s.network ? s.network.charAt(0).toUpperCase() + s.network.slice(1).toLowerCase() : "—"}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-black rounded-full border px-2.5 py-0.5 shadow-sm ${meta.tone}`}>
                              <Icon className="h-2.5 w-2.5" />
                              {meta.label}
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-30" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )
              )}


              {/* DETALHE DE UMA ESCOLA OU PERFIL ADMIN */}
              {view === "school" && (isAdminGlobal || selectedSchool) && (
                <div className="space-y-4">
                  <Card className="border-0 shadow-card bg-gradient-to-br from-primary/5 via-transparent to-transparent overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1 flex-1">
                            <p className="text-[10px] uppercase tracking-widest font-black text-primary/60">
                              {isAdminGlobal ? "Administrador Global" : "Identificação da Escola"}
                            </p>
                            <h2 className="text-lg font-black leading-tight text-foreground">
                              {isAdminGlobal ? "Acesso ao Sistema" : (selectedSchool?.name || "Detalhes")}
                            </h2>
                          </div>
                          {!isAdminGlobal && (
                            <div className="bg-primary/10 p-2.5 rounded-2xl">
                              <SchoolIcon className="h-6 w-6 text-primary" />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Código INEP</p>
                            <p className="text-xs font-mono font-bold">{selectedSchool?.inep_code || "—"}</p>
                          </div>
                          <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Rede de Ensino</p>
                            <p className="text-xs font-bold text-primary/80">
                              {selectedSchool?.network ? selectedSchool.network.charAt(0).toUpperCase() + selectedSchool.network.slice(1).toLowerCase() : "—"}
                            </p>
                          </div>
                          <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Localidade</p>
                            <p className="text-xs font-bold truncate">{selectedSchool?.city}, {selectedSchool?.state}</p>
                          </div>
                          <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Estabelecimento</p>
                            <p className="text-xs font-bold text-accent">#{selectedSchool?.id.split('-')[0] || "—"}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                          <Button
                            className="w-full rounded-xl h-12 font-bold gap-2 shadow-sm"
                            onClick={() => navigate(`/gestor?as_school=${selectedSchool.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                            Acessar como Gestor
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full rounded-xl h-11 font-semibold border-primary/20 hover:bg-primary/5 text-primary"
                            onClick={() => navigate(`/admin/school/${selectedSchool.id}`)}
                          >
                            Painel Administrativo Completo
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <section className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <p className="text-sm font-bold">Gestores</p>
                      <Badge variant="secondary" className="ml-auto">{gestores.length}</Badge>
                    </div>
                    {loadingProfiles ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : gestores.length === 0 ? (
                      <EmptyState text="Nenhum gestor cadastrado." />
                    ) : (
                      gestores.map((p) => <ProfileCard key={p.id} p={p} highlight onResetPassword={handleResetPassword} resetting={resettingUserId === p.user_id} />)
                    )}
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Users className="h-4 w-4 text-primary" />
                      <p className="text-sm font-bold">Demais usuários</p>
                      <Badge variant="secondary" className="ml-auto">{outros.length}</Badge>
                    </div>
                    {loadingProfiles ? null : outros.length === 0 ? (
                      <EmptyState text="Nenhum outro usuário cadastrado." />
                    ) : (
                      outros.map((p) => <ProfileCard key={p.id} p={p} onResetPassword={handleResetPassword} resetting={resettingUserId === p.user_id} />)
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </main>


      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar {exportFormat.toUpperCase()}</DialogTitle>
            <DialogDescription>
              Selecione um ou mais estados. Todas as cidades e escolas (com plano) desses estados serão incluídas. Sem seleção = todos os estados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2 py-2">
            <p className="text-xs text-muted-foreground">
              {exportSelectedStates.size === 0
                ? `Todos (${stateAgg.length} estados · ${allSchools.length} escolas)`
                : `${exportSelectedStates.size} estado(s) · ${allSchools.filter((s) => exportSelectedStates.has(s.state)).length} escola(s)`}
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setExportSelectedStates(new Set(stateAgg.map((s) => s.state)))}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setExportSelectedStates(new Set())}
              >
                Limpar
              </Button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {stateAgg.map((s) => {
              const checked = exportSelectedStates.has(s.state);
              return (
                <label
                  key={s.state}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setExportSelectedStates((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(s.state); else next.delete(s.state);
                        return next;
                      });
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{s.state}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.schools} escola(s) · {s.cities} cidade(s)
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmExport} disabled={exporting !== null}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Exportar {exportFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkConfirm !== null}
        onOpenChange={(o) => {
          if (!o) {
            setBulkConfirm(null);
            setPreviewData(null);
            setBulkResult(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkResult ? (
                bulkResult.ok ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Ban className="h-5 w-5 text-destructive" />
                )
              ) : (
                <Eye className="h-5 w-5 text-primary" />
              )}
              {bulkResult
                ? bulkResult.ok
                  ? bulkResult.status === "blocked"
                    ? "Desativação concluída"
                    : "Ativação concluída"
                  : "Falha na execução"
                : bulkConfirm === "blocked"
                  ? "Validar: Desativar todas"
                  : "Validar: Ativar todas"}
            </DialogTitle>
            <DialogDescription>
              {bulkResult
                ? bulkResult.ok
                  ? `Operação finalizada às ${bulkResult.finishedAt.toLocaleTimeString("pt-BR")}.`
                  : "A operação não pôde ser concluída. Veja os detalhes abaixo."
                : bulkConfirm === "blocked"
                  ? "Esta ação irá desativar todas as escolas que não possuem uma assinatura ativa válida. Escolas com planos vigentes serão preservadas."
                  : "Esta ação irá reativar o acesso de todas as escolas desativadas que não possuem assinatura ativa."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {bulkResult ? (
              bulkResult.ok ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`rounded-xl border p-3 ${
                        bulkResult.status === "blocked"
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-emerald-500/30 bg-emerald-500/5"
                      }`}
                    >
                      <p
                        className={`text-[10px] uppercase tracking-wider font-bold ${
                          bulkResult.status === "blocked" ? "text-destructive" : "text-emerald-600"
                        }`}
                      >
                        {bulkResult.status === "blocked" ? "Desativadas" : "Ativadas"}
                      </p>
                      <p
                        className={`text-3xl font-extrabold mt-0.5 ${
                          bulkResult.status === "blocked" ? "text-destructive" : "text-emerald-600"
                        }`}
                      >
                        {bulkResult.updated}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">escola(s) afetada(s)</p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-amber-600">
                        Assinantes preservadas
                      </p>
                      <p className="text-3xl font-extrabold mt-0.5 text-amber-600">{bulkResult.preserved}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">não foram alteradas</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-snug">
                      {bulkResult.status === "blocked"
                        ? `${bulkResult.updated} escola(s) tiveram o acesso bloqueado. ${bulkResult.preserved} assinante(s) ativa(s) continuam liberadas.`
                        : `${bulkResult.updated} escola(s) foram reativadas. ${bulkResult.preserved} assinante(s) já estavam liberadas.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-destructive">Erro ao executar a ação</p>
                    <p className="text-xs text-destructive/90 mt-1 break-words">{bulkResult.error}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Nenhuma alteração foi aplicada. Tente novamente ou verifique os logs.
                    </p>
                  </div>
                </div>
              )
            ) : previewLoading !== null || (!previewData && bulkConfirm) ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Calculando impacto...</span>
              </div>
            ) : previewData ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total de escolas</p>
                  <p className="text-2xl font-extrabold mt-0.5">{previewData.total}</p>
                </div>
                <div className={`rounded-xl border p-3 ${previewData.status === "blocked" ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-bold ${previewData.status === "blocked" ? "text-destructive" : "text-emerald-600"}`}>
                    Serão {previewData.status === "blocked" ? "desativadas" : "ativadas"}
                  </p>
                  <p className={`text-2xl font-extrabold mt-0.5 ${previewData.status === "blocked" ? "text-destructive" : "text-emerald-600"}`}>
                    {previewData.wouldUpdate}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-amber-600">Preservadas (assinantes)</p>
                  <p className="text-2xl font-extrabold mt-0.5 text-amber-600">{previewData.preserved}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Já neste status</p>
                  <p className="text-2xl font-extrabold mt-0.5 text-muted-foreground">{previewData.alreadyInStatus}</p>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            {bulkResult ? (
              <>
                {bulkResult.ok && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => exportBulkResult("csv")}
                      title="Exportar CSV"
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => exportBulkResult("pdf")}
                      title="Exportar PDF"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </>
                )}
                {!bulkResult.ok && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBulkResult(null);
                      if (bulkConfirm) runPreview(bulkConfirm);
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar novamente
                  </Button>
                )}
                <Button
                  className={bulkResult.ok ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                  onClick={() => {
                    setBulkConfirm(null);
                    setPreviewData(null);
                    setBulkResult(null);
                  }}
                >
                  Fechar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setBulkConfirm(null); setPreviewData(null); }} disabled={bulkAction !== null}>Cancelar</Button>
                <Button
                  variant="ghost"
                  onClick={() => bulkConfirm && runPreview(bulkConfirm)}
                  disabled={bulkAction !== null || previewLoading !== null}
                  title="Recalcular"
                >
                  <RefreshCw className={`h-4 w-4 ${previewLoading !== null ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant={bulkConfirm === "blocked" ? "destructive" : "default"}
                  className={bulkConfirm === "active" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                  onClick={() => bulkConfirm && runBulkSetSchools(bulkConfirm)}
                  disabled={bulkAction !== null || previewLoading !== null || !previewData || previewData.wouldUpdate === 0}
                >
                  {bulkAction !== null ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {previewData && previewData.wouldUpdate === 0 ? "Nada a aplicar" : "Confirmar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Histórico e Exportação Filtrada */}
      <Dialog open={historyOpen} onOpenChange={(o) => setHistoryOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Histórico de ações em massa
            </DialogTitle>
            <DialogDescription>
              Filtre por tipo de ação, resultado e intervalo de datas, depois exporte em CSV ou PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Filtros */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">De</label>
                <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} max={filterTo} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Até</label>
                <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} min={filterFrom} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ação</label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  { v: "all", l: "Todas" },
                  { v: "blocked", l: "Desativação" },
                  { v: "active", l: "Ativação" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.v}
                    type="button"
                    variant={filterAction === opt.v ? "default" : "outline"}
                    className={`h-9 rounded-lg text-xs font-bold ${filterAction === opt.v ? (opt.v === "blocked" ? "bg-destructive hover:bg-destructive/90" : opt.v === "active" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "") : ""}`}
                    onClick={() => setFilterAction(opt.v)}
                  >
                    {opt.l}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resultado</label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  { v: "all", l: "Todos" },
                  { v: "ok", l: "Sucesso" },
                  { v: "fail", l: "Falha" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.v}
                    type="button"
                    variant={filterResult === opt.v ? "default" : "outline"}
                    className={`h-9 rounded-lg text-xs font-bold ${filterResult === opt.v ? (opt.v === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : opt.v === "fail" ? "bg-destructive hover:bg-destructive/90" : "") : ""}`}
                    onClick={() => setFilterResult(opt.v)}
                  >
                    {opt.l}
                  </Button>
                ))}
              </div>
            </div>

            {/* Resumo / Lista */}
            <div className="rounded-xl border border-border bg-muted/30 p-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold">
                  {historyLoading ? "Carregando..." : `${filteredHistory.length} registro(s) filtrado(s) de ${historyItems.length}`}
                </p>
                <Button size="sm" variant="ghost" onClick={loadBulkHistory} disabled={historyLoading} title="Recarregar">
                  <RefreshCw className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div
                className="max-h-64 overflow-y-auto space-y-1"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
                    loadMoreHistory();
                  }
                }}
              >
                {historyLoading ? (
                  <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : filteredHistory.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-4">Nenhum registro encontrado para os filtros aplicados.</p>
                ) : (
                  <>
                    {filteredHistory.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background border border-border/50 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge className={`h-5 px-1.5 text-[10px] ${it.status === "blocked" ? "bg-destructive" : "bg-emerald-600"} text-white`}>
                            {it.status === "blocked" ? "Desativ." : "Ativação"}
                          </Badge>
                          <span className="text-muted-foreground truncate">{new Date(it.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span title="Atualizadas" className="font-bold">{it.updated}</span>
                          <span title="Preservadas" className="font-bold text-amber-600">{it.preserved}</span>
                          {it.ok ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <Ban className="h-4 w-4 text-destructive" />}
                        </div>
                      </div>
                    ))}
                    {historyHasMore && (
                      <div className="py-2 flex flex-col items-center gap-1">
                        {historyLoadingMore ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={loadMoreHistory}>
                            Carregar mais
                          </Button>
                        )}
                      </div>
                    )}
                    {!historyHasMore && historyItems.length > HISTORY_PAGE_SIZE && (
                      <p className="text-center text-[10px] text-muted-foreground py-2">— Fim do histórico ({historyItems.length} carregados) —</p>
                    )}
                  </>
                )}
              </div>

            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Fechar</Button>
            <Button
              variant="outline"
              onClick={() => exportFilteredHistory("csv")}
              disabled={filteredHistory.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              onClick={() => exportFilteredHistory("pdf")}
              disabled={filteredHistory.length === 0}
              className="bg-primary"
            >
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProfileCard({
  p,
  highlight,
  onResetPassword,
  resetting,
}: {
  p: ProfileRow;
  highlight?: boolean;
  onResetPassword?: (p: ProfileRow) => void;
  resetting?: boolean;
}) {
  return (
    <Card className={`border-0 shadow-card ${highlight ? "ring-1 ring-amber-500/30" : ""}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${highlight ? "bg-amber-500/15" : "bg-secondary"}`}>
          {highlight ? <Crown className="h-4 w-4 text-amber-500" /> : <Users className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold break-words">{p.full_name}</p>
          <p className="text-xs text-muted-foreground break-words">
            {(() => {
              const displayRole = !p.is_approved && p.intended_role ? p.intended_role : p.role;
              return ROLE_LABELS[displayRole] ?? displayRole;
            })()}
            {!p.is_approved && p.intended_role && p.intended_role !== p.role && (
              <span className="ml-1 text-[10px] uppercase tracking-wider font-bold text-warning">(pretendido)</span>
            )}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
        </div>
        {p.is_approved ? (
          <Badge className="bg-accent/10 text-accent border-accent/20" variant="outline">Aprovado</Badge>
        ) : (
          <Badge className="bg-warning/10 text-warning border-warning/20" variant="outline">Pendente</Badge>
        )}
        {onResetPassword && (
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0"
            onClick={() => onResetPassword(p)}
            disabled={!!resetting}
            aria-label={`Resetar senha de ${p.full_name}`}
            title="Resetar senha (envia e-mail)"
          >
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-6 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
