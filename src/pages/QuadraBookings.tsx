import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, Trophy, CalendarDays, Globe, Handshake, Clock, Users, Monitor, GraduationCap, Dumbbell, TreePine, Coffee, FileText, Download, Share2, Copy, X, Loader2, Pencil, Check, BookOpen, MapPin, Tv, Volume2, Mic, Laptop, Laptop2, Calendar as CalendarIcon, Hash, LayoutGrid, FlaskConical, Lightbulb, Trophy as TrophyIcon, FileSpreadsheet, Search, Bell, User, BookMarked, Tag, UserCheck, Package, Hourglass, CheckCircle2, XCircle, AlertTriangle, History as HistoryIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import autoTable from "jspdf-autotable";
import { useSectorPreferences } from "@/hooks/useSectorPreferences";
import { toast as toastUi } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSectorLabels } from "@/hooks/useSectorLabels";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { buildOfficialHeader } from "@/lib/officialHeader";
import { resolveGovLogoUrl, loadImageDataUrl } from "@/lib/govLogo";
import { getSignedSignatureUrl } from "@/lib/signatureUrl";
import GestorThemeShell, { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";

type Booking = Tables<"bookings"> & { profiles?: { full_name: string; phone?: string | null } | null };

const SECTOR_KEYS = ["projeto_vida", "informatica", "quadra", "patio", "sala_professores", "laboratorio_ciencias", "biblioteca"];

const SECTOR_ICONS: Record<string, any> = {
  projeto_vida: GraduationCap,
  informatica: Monitor,
  quadra: Dumbbell,
  patio: TreePine,
  sala_professores: Coffee,
  laboratorio_ciencias: FileText,
  biblioteca: BookOpen,
};

const EVENT_LABELS: Record<string, string> = {
  aula: "Aula",
  palestra: "Palestra",
  reuniao: "Reunião",
  evento_externo: "Evento Externo",
  esportivo: "Evento Esportivo",
  outros: "Evento Escolar",
  externo: "Evento Externo",
};

const SECTOR_LABELS: Record<string, string> = {
  quadra: "Quadra Escolar",
  informatica: "Sala de Informática",
  patio: "Pátio",
  sala_professores: "Sala dos Professores",
  projeto_vida: "Sala de Vídeo",
  laboratorio_ciencias: "Laboratório de Ciências",
  biblioteca: "Biblioteca",
};

const RESOURCE_ICONS: Record<string, any> = {
  data_show: Monitor,
  tv: Tv,
  caixa_som: Volume2,
  microfone: Mic,
  notebook_escola: Laptop,
  notebook_professor: Laptop2,
};

const RESOURCE_LABELS: Record<string, string> = {
  data_show: "Data Show",
  tv: "TV",
  caixa_som: "Caixa de Som",
  microfone: "Microfone",
  notebook_escola: "Notebook Escola",
  notebook_professor: "Notebook do Professor",
};

export default function QuadraBookings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goBack = useSmartBack("/sectors");
  const { profile } = useAuth();
  const { getShortLabel, getLabel } = useSectorLabels();
  const { color, glowEnabled } = useSectorPreferences();

  const SECTOR_TABS = SECTOR_KEYS.map((key) => ({
    key,
    label: getShortLabel(key),
    icon: SECTOR_ICONS[key],
  }));

  const isManagerLike = profile?.role === "gestor_pedagogico" || profile?.role === "coord_pedagogico" || profile?.role === "chef_projeto_vida";
  // Regras:
  // - Visualizar comunicado/solicitação já gerado: qualquer usuário (botão "Ver").
  // - Gerar comunicado: SOMENTE gestor ou coord. pedagógico, e apenas se ainda não existir
  //   (primeiro que gerar trava — o outro não pode gerar um segundo).
  // - Para "evento_externo" sem comunicado, o próprio solicitante também pode gerar a Solicitação ao Gestor.
  const canGenerateComunicadoFor = (b: Booking) => {
    if (b.gestor_communique) return false; // primeiro que gerar trava
    if (isManagerLike) return true;
    if (b.event_type === "evento_externo" && b.user_id === profile?.user_id) return true;
    return false;
  };
  const canViewExistingComunicado = (b: Booking) => !!b.gestor_communique;
  // Heurística para distinguir Solicitação ao Gestor (texto curto que começa com
  // "Prezado(a) Gestor(a),") de um Comunicado oficial (texto longo, geralmente
  // contendo "COMUNICADO" no cabeçalho). Só faz sentido para evento_externo,
  // onde o mesmo campo `gestor_communique` armazena ambos em momentos diferentes.
  const isSolicitacaoText = (txt?: string | null) => {
    if (!txt) return false;
    return /^\s*Prezad[ao]\(a\)\s*Gestor/i.test(txt) && !/COMUNICADO/i.test(txt.slice(0, 200));
  };
  const isStoredSolicitacao = (b: Booking) =>
    b.event_type === "evento_externo" && isSolicitacaoText(b.gestor_communique);
  // Reconstrói a Solicitação curta (até 5 linhas) a partir dos campos do booking,
  // usada quando o `gestor_communique` já foi sobrescrito pelo Comunicado oficial.
  const buildSolicitacaoText = (b: Booking) => {
    const dateBR = (() => {
      try {
        const [y, m, d] = String(b.booking_date).split("-");
        return `${d}/${m}/${y}`;
      } catch {
        return String(b.booking_date);
      }
    })();
    const horario = `${String(b.start_time).slice(0, 5)} - ${String(b.end_time).slice(0, 5)}`;
    const solicitante = (b.profiles?.full_name || "").trim();
    return (
      `Prezado(a) Gestor(a),\n` +
      `${solicitante ? `${solicitante} solicita` : "Solicito"} a liberação do ambiente "${b.sector}" no dia ${dateBR}, das ${horario}, para uso externo.\n` +
      `Assunto: ${b.topic || "—"}.${b.visitor_name ? ` Solicitante externo: ${b.visitor_name}.` : ""}\n` +
      (b.description ? `Justificativa: ${b.description}\n` : "") +
      `Aguardo deferimento.`
    );
  };
  const initialTab = searchParams.get("setor") || "projeto_vida";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sectorFilter, setSectorFilter] = useState<string>(initialTab);
  const [eventTypeFilters, setEventTypeFilters] = useState<Record<string, string>>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"upcoming" | "history">("upcoming");

  // Filtra allBookings por data conforme viewMode (upcoming: hoje+ / history: antes de hoje)
  const dateScopedBookings = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = format(today, "yyyy-MM-dd");
    const list = allBookings.filter((b) =>
      viewMode === "history" ? b.booking_date < todayISO : b.booking_date >= todayISO
    );
    if (viewMode === "history") {
      // Histórico: mais recente primeiro
      return [...list].sort((a, b) => {
        if (a.booking_date !== b.booking_date) return b.booking_date.localeCompare(a.booking_date);
        return b.start_time.localeCompare(a.start_time);
      });
    }
    return list;
  })();

  // Estados para exportação WhatsApp / PDF (estilo /today-bookings)
  const [exporting, setExporting] = useState(false);
  const [waPreviewOpen, setWaPreviewOpen] = useState(false);
  const [waPreviewText, setWaPreviewText] = useState("");

  // Sectors that get a per-event-type filter row
  const SECTORS_WITH_EVENT_FILTER = ["sala_professores", "laboratorio_ciencias", "biblioteca"];
  const EVENT_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
    { key: "todos", label: "Todos" },
    { key: "aula", label: "Aula" },
    { key: "reuniao", label: "Reunião" },
    { key: "palestra", label: "Palestra" },
    { key: "outros", label: "Evento Escolar" },
    { key: "evento_externo", label: "Evento Externo" },
  ];

  const eventTypeFilter = eventTypeFilters[activeTab] || "todos";
  const setEventTypeFilter = (key: string) =>
    setEventTypeFilters((prev) => ({ ...prev, [activeTab]: key }));
  const [loading, setLoading] = useState(true);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [govLogoUrl, setGovLogoUrl] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolCity, setSchoolCity] = useState("");
  const [schoolState, setSchoolState] = useState("");
  const [schoolNetwork, setSchoolNetwork] = useState<string>("estadual");

  // Comunicado state
  const [comunicadoBooking, setComunicadoBooking] = useState<Booking | null>(null);
  const [comunicado, setComunicado] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  // Co-assinatura da gestora (quando autor é coord/supervisor)
  const [gestorSigner, setGestorSigner] = useState<{ name: string; signature_url: string | null } | null>(null);

  // Tradução do comunicado (mesmo modelo da BookingConfirmation)
  type Lang = "pt" | "en" | "es";
  const [translations, setTranslations] = useState<Record<Lang, string | null>>({ pt: null, en: null, es: null });
  const [activeLang, setActiveLang] = useState<Lang>("pt");
  const [translatingLang, setTranslatingLang] = useState<Lang | null>(null);
  const langLabels: Record<Lang, string> = { pt: "Português", en: "English", es: "Español" };
  const langFlags: Record<Lang, string> = { pt: "🇧🇷", en: "🇺🇸", es: "🇪🇸" };
  const currentText = (activeLang === "pt" ? comunicado : translations[activeLang]) || comunicado;

  const ensureTranslation = async (lang: Lang): Promise<string | null> => {
    if (lang === "pt") return comunicado;
    if (translations[lang]) return translations[lang];
    if (!comunicado) return null;
    setTranslatingLang(lang);
    try {
      const { data, error } = await supabase.functions.invoke("translate-comunicado", {
        body: { text: comunicado, targetLang: lang },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || "Erro ao traduzir.");
        return null;
      }
      const translated = (data as any).translated as string;
      setTranslations((prev) => ({ ...prev, [lang]: translated }));
      return translated;
    } catch (e) {
      console.error(e);
      toast.error("Erro ao traduzir.");
      return null;
    } finally {
      setTranslatingLang(null);
    }
  };

  const handleSelectLang = async (lang: Lang) => {
    if (lang !== "pt" && !translations[lang]) {
      const t = await ensureTranslation(lang);
      if (!t) return;
    }
    setActiveLang(lang);
  };

  // Details modal state
  const [detailsBooking, setDetailsBooking] = useState<Booking | null>(null);

  // Load school logo
  useEffect(() => {
    if (!profile?.school_id) return;
    supabase.from("schools").select("name, logo_url, city, state, network, gov_logo_url").eq("id", profile.school_id).single().then(async ({ data }) => {
      if (data) {
        setSchoolName(data.name);
        setSchoolCity((data as any).city || "");
        setSchoolState((data as any).state || "");
        setSchoolNetwork((data as any).network || "estadual");
        setSchoolLogo((data as any).logo_url || null);
        const url = await resolveGovLogoUrl({
          network: (data as any).network,
          state: (data as any).state,
          city: (data as any).city,
          overrideUrl: (data as any).gov_logo_url,
        });
        setGovLogoUrl(url);
      }
    });
  }, [profile?.school_id]);

  const loadBookings = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    // Carrega TODOS os setores da escola para preservar agendamentos pré-existentes
    // em cada setor (filtragem agora é client-side via sectorFilter)
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("school_id", profile.school_id)
      .eq("status", "confirmed")
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(500);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((b) => b.user_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", userIds);
      const profileMap = new Map(profs?.map((p) => [p.user_id, { full_name: p.full_name, phone: p.phone }]) || []);
      const enriched = data.map((b) => ({ ...b, profiles: profileMap.get(b.user_id) || { full_name: "Usuário", phone: null } }));
      setAllBookings(enriched);
      // Não chamamos setBookings aqui: o useEffect abaixo aplica o filtro de data (viewMode) + setor.
    } else {
      setAllBookings([]);
      setBookings([]);
    }
    setLoading(false);
  }, [profile?.school_id, sectorFilter]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Re-aplica filtro client-side ao trocar setor/modo sem refazer a query
  useEffect(() => {
    setBookings(dateScopedBookings.filter((b) => sectorFilter === "all" || b.sector === sectorFilter));
    if (sectorFilter !== "all") setActiveTab(sectorFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorFilter, allBookings, viewMode]);

  // Auto-disparo de comunicado via URL (?comunicado=<bookingId>) — usado pela /today-bookings
  const autoComunicadoId = searchParams.get("comunicado");
  const [autoTriggered, setAutoTriggered] = useState(false);
  useEffect(() => {
    if (!autoComunicadoId || autoTriggered || allBookings.length === 0) return;
    const target = allBookings.find((b) => b.id === autoComunicadoId);
    if (target && canGenerateComunicadoFor(target)) {
      setAutoTriggered(true);
      setSectorFilter(target.sector);
      handleGenerateComunicado(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoComunicadoId, allBookings, autoTriggered]);

  const getGestorStatusInfo = (b: Booking) => {
    if (b.event_type !== "evento_externo") return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const bDate = parseISO(b.booking_date); bDate.setHours(0,0,0,0);
    const isPast = bDate < today;
    if (b.gestor_status === "approved") {
      const when = b.gestor_responded_at ? format(new Date(b.gestor_responded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "";
      return { label: "APROVADO PELO GESTOR", short: "Aprovado pelo gestor", detail: when ? `Aprovado em ${when}` : "", tone: "ok" as const };
    }
    if (b.gestor_status === "denied") {
      const when = b.gestor_responded_at ? format(new Date(b.gestor_responded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "";
      return { label: "RECUSADO PELO GESTOR", short: "Recusado pelo gestor", detail: [when && `Recusado em ${when}`, b.gestor_response && `Justificativa: ${b.gestor_response}`].filter(Boolean).join(" — "), tone: "bad" as const };
    }
    if (isPast) {
      return { label: "NÃO AVALIADO PELO GESTOR", short: "Não avaliado pelo gestor", detail: "O prazo do agendamento expirou sem manifestação do gestor. O evento não foi formalizado e a data foi perdida.", tone: "bad" as const };
    }
    return { label: "AGUARDANDO APROVAÇÃO DO GESTOR", short: "Aguardando aprovação do gestor", detail: "Este agendamento ainda depende da decisão do gestor para ser formalizado.", tone: "warn" as const };
  };

  const buildDetailsText = (b: Booking): string => {
    const useDate = parseISO(b.booking_date);
    const useDateStr = format(useDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const createdStr = format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const todayStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const startMin = parseInt(b.start_time.slice(0,2)) * 60 + parseInt(b.start_time.slice(3,5));
    const endMin = parseInt(b.end_time.slice(0,2)) * 60 + parseInt(b.end_time.slice(3,5));
    const durMin = endMin - startMin;
    const isOrdered = durMin === 60 || durMin === 55;
    const horarioTipo = isOrdered ? "Ordenado (tempo de aula padrão)" : "Avulso (personalizado)";
    const sectorLabel = SECTOR_LABELS[b.sector] || b.sector;
    const eventLabel = EVENT_LABELS[b.event_type] || b.event_type;
    const title = b.description || b.topic || eventLabel;

    const officialHeader = buildOfficialHeader({
      network: schoolNetwork,
      state: schoolState,
      city: schoolCity,
      schoolName,
    });

    const lines: string[] = [];
    // Cabeçalho oficial
    if (officialHeader.governo) lines.push(`🏛️ *${officialHeader.governo.toUpperCase()}*`);
    if (officialHeader.secretaria) lines.push(`🏛️ *${officialHeader.secretaria}*`);
    if (officialHeader.escola) lines.push(`🏫 *${officialHeader.escola}*`);
    if (schoolCity || schoolState) lines.push(`📍 ${schoolCity || "—"}${schoolState ? ` — ${schoolState.toUpperCase()}` : ""}`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("📋 *DETALHES DO AGENDAMENTO*");
    lines.push("");
    lines.push(`📝 *Assunto/Tema:* ${title}`);
    lines.push(`🏷️ *Tipo:* ${eventLabel}`);
    lines.push(`📍 *Setor:* ${sectorLabel}`);
    const gs = getGestorStatusInfo(b);
    if (gs) {
      const icon = gs.tone === "ok" ? "✅" : gs.tone === "bad" ? "🚫" : "⏳";
      lines.push("");
      lines.push(`${icon} *Status do gestor:* ${gs.short}`);
      if (gs.detail) lines.push(`_${gs.detail}_`);
    }
    lines.push("");
    lines.push(`📅 *Dia de uso:* ${useDateStr}`);
    lines.push(`⏰ *Horário:* ${b.start_time.slice(0,5)} - ${b.end_time.slice(0,5)}`);
    lines.push(`🕐 *Tipo de horário:* ${horarioTipo}`);
    lines.push("");
    lines.push(`👤 *Professor/Responsável:* ${b.profiles?.full_name || "Usuário"}`);
    if (b.discipline) lines.push(`📚 *Disciplina:* ${b.discipline}`);
    if (b.resources && b.resources.length > 0) {
      const resStr = b.resources.map((r) => `• ${RESOURCE_LABELS[r] || r}`).join("\n");
      lines.push(`🎒 *Recursos utilizados:*\n${resStr}`);
    } else {
      lines.push(`🎒 *Recursos utilizados:* Nenhum`);
    }
    if (b.visitor_name) {
      lines.push(`🤝 *Visitante:* ${b.visitor_name}`);
      if (b.visitor_info) lines.push(`ℹ️ ${b.visitor_info}`);
    }
    lines.push("");
    lines.push(`🗓️ *Agendado em:* ${createdStr}`);
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`📍 ${schoolCity || "—"}${schoolState ? `/${schoolState.toUpperCase()}` : ""}, ${todayStr}`);
    return lines.join("\n");
  };

  const downloadDetailsPdf = async (b: Booking) => {
    try {
      const useDate = parseISO(b.booking_date);
      const useDateStr = format(useDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      const createdStr = format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const todayStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      const startMin = parseInt(b.start_time.slice(0,2)) * 60 + parseInt(b.start_time.slice(3,5));
      const endMin = parseInt(b.end_time.slice(0,2)) * 60 + parseInt(b.end_time.slice(3,5));
      const durMin = endMin - startMin;
      const isOrdered = durMin === 60 || durMin === 55;
      const horarioTipo = isOrdered ? "Ordenado (tempo de aula padrão)" : "Avulso (personalizado)";
      const sectorLabel = SECTOR_LABELS[b.sector] || b.sector;
      const eventLabel = EVENT_LABELS[b.event_type] || b.event_type;
      const title = b.description || b.topic || eventLabel;

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 20;
      const marginRight = 20;
      const maxWidth = pageWidth - marginLeft - marginRight;

      // Cabeçalho institucional oficial
      const officialHeader = buildOfficialHeader({
        network: schoolNetwork,
        state: schoolState,
        city: schoolCity,
        schoolName,
      });
      const headerLineCount = officialHeader.lines.length || 1;
      const barHeight = Math.max(26, 10 + headerLineCount * 6);
      doc.setFillColor(36, 64, 107);
      doc.rect(0, 0, pageWidth, barHeight, "F");

      // Logo (white circle)
      let logoData: string | null = null;
      if (schoolLogo) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = schoolLogo;
          });
          if (img.complete && img.naturalWidth > 0) {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              logoData = canvas.toDataURL("image/png");
            }
          }
        } catch {}
      }

      const govLogoData = await loadImageDataUrl(govLogoUrl);
      let leftPad = 0;
      if (govLogoData) {
        doc.setFillColor(255, 255, 255);
        doc.circle(marginLeft + 8, barHeight / 2, 9, "F");
        doc.addImage(govLogoData, "PNG", marginLeft + 1, barHeight / 2 - 7, 14, 14);
        leftPad = 22;
      }
      let rightPad = 0;
      if (logoData) {
        const rx = pageWidth - marginRight - 8;
        doc.setFillColor(255, 255, 255);
        doc.circle(rx, barHeight / 2, 9, "F");
        doc.addImage(logoData, "PNG", pageWidth - marginRight - 15, barHeight / 2 - 7, 14, 14);
        rightPad = 22;
      }
      const textX = marginLeft + leftPad;
      const headerMaxWidth = pageWidth - marginRight - textX - rightPad;
      let hy = (barHeight - headerLineCount * 5) / 2 + 4;
      doc.setTextColor(255, 255, 255);
      if (officialHeader.governo) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(doc.splitTextToSize(officialHeader.governo.toUpperCase(), headerMaxWidth)[0], textX, hy);
        hy += 5;
      }
      if (officialHeader.secretaria) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(220, 230, 245);
        doc.text(doc.splitTextToSize(officialHeader.secretaria, headerMaxWidth)[0], textX, hy);
        hy += 5;
      }
      if (officialHeader.escola) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text(doc.splitTextToSize(officialHeader.escola, headerMaxWidth)[0], textX, hy);
      }

      // Body
      let y = barHeight + 14;
      doc.setTextColor(36, 64, 107);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("DETALHES DO AGENDAMENTO", pageWidth / 2, y, { align: "center" });
      y += 10;

      doc.setDrawColor(36, 64, 107);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, y, pageWidth - marginRight, y);
      y += 8;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);

      const addRow = (label: string, value: string) => {
        const lineH = 6;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(36, 64, 107);
        doc.text(label, marginLeft, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(40, 40, 40);
        const valueLines = doc.splitTextToSize(value, maxWidth - 55);
        doc.text(valueLines, marginLeft + 55, y);
        y += lineH * Math.max(1, valueLines.length) + 2;
      };

      addRow("Assunto/Tema:", title);
      addRow("Tipo de evento:", eventLabel);
      addRow("Setor:", sectorLabel);
      y += 2;
      addRow("Dia de uso:", useDateStr.charAt(0).toUpperCase() + useDateStr.slice(1));
      addRow("Horário:", `${b.start_time.slice(0,5)} às ${b.end_time.slice(0,5)}`);
      addRow("Tipo de horário:", horarioTipo);
      y += 2;
      addRow("Professor:", b.profiles?.full_name || "Usuário");
      if (b.discipline) addRow("Disciplina:", b.discipline);
      const resourcesText = b.resources && b.resources.length > 0
        ? b.resources.map((r) => RESOURCE_LABELS[r] || r).join(", ")
        : "Nenhum";
      addRow("Recursos:", resourcesText);
      if (b.visitor_name) addRow("Visitante:", b.visitor_name + (b.visitor_info ? ` — ${b.visitor_info}` : ""));
      y += 2;
      addRow("Agendado em:", createdStr);

      // Bloco destacado: status do gestor (apenas evento externo)
      const gs = getGestorStatusInfo(b);
      if (gs) {
        y += 4;
        const colors = gs.tone === "ok"
          ? { bg: [220, 245, 230], border: [34, 139, 75], text: [20, 90, 45] }
          : gs.tone === "bad"
          ? { bg: [253, 226, 226], border: [200, 40, 40], text: [140, 20, 20] }
          : { bg: [255, 243, 205], border: [200, 140, 20], text: [120, 80, 10] };
        const detailLines = gs.detail ? doc.splitTextToSize(gs.detail, maxWidth - 8) : [];
        const boxH = 12 + (detailLines.length * 5);
        doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
        doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
        doc.setLineWidth(0.6);
        doc.roundedRect(marginLeft, y, maxWidth, boxH, 2, 2, "FD");
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`STATUS DO GESTOR: ${gs.label}`, marginLeft + 4, y + 7);
        if (detailLines.length) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.text(detailLines, marginLeft + 4, y + 12);
        }
        y += boxH + 4;
      }

      // Footer
      doc.setDrawColor(200, 200, 200);
      doc.line(marginLeft, pageHeight - 18, pageWidth - marginRight, pageHeight - 18);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`${schoolCity || "—"}, ${todayStr}`, pageWidth / 2, pageHeight - 12, { align: "center" });

      doc.save(`agendamento-${b.booking_date}.pdf`);
      toast.success("PDF baixado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF.");
    }
  };

  const shareDetailsWhatsApp = async (b: Booking) => {
    const text = buildDetailsText(b);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    // Try Web Share API first for native sheet
    if (navigator.share) {
      try {
        await navigator.share({ title: "Agendamento", text });
        return;
      } catch { /* fallback */ }
    }
    window.open(url, "_blank");
  };

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const handleResolveSolicitacao = async (booking: Booking, decision: "approved" | "rejected") => {
    if (!profile?.user_id) return;
    setResolvingId(booking.id);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({
          gestor_status: decision,
          gestor_responded_at: new Date().toISOString(),
          gestor_responded_by: profile.user_id,
        })
        .eq("id", booking.id);
      if (error) throw error;
      const patch = {
        gestor_status: decision,
        gestor_responded_at: new Date().toISOString(),
        gestor_responded_by: profile.user_id,
      };
      setAllBookings((prev) => prev.map((bk) => bk.id === booking.id ? { ...bk, ...patch } as Booking : bk));
      setBookings((prev) => prev.map((bk) => bk.id === booking.id ? { ...bk, ...patch } as Booking : bk));
      setComunicadoBooking((prev) => prev && prev.id === booking.id ? { ...prev, ...patch } as Booking : prev);
      toast.success(decision === "approved" ? "Solicitação deferida" : "Solicitação indeferida");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registrar a decisão");
    } finally {
      setResolvingId(null);
    }
  };

  const handleGenerateComunicado = async (booking: Booking, opts?: { forceComunicado?: boolean }) => {
    setGeneratingId(booking.id);
    try {
      const isExternal = booking.event_type === "evento_externo";
      const asComunicado = !!opts?.forceComunicado;
      const payload = {
        // Para externos, qualquer usuário gera SOLICITAÇÃO curta ao gestor —
        // exceto quando o gestor opta por converter em COMUNICADO formal.
        eventType: isExternal && !asComunicado ? "solicitacao_externa" : (isExternal ? "outros" : booking.event_type),
        eventName: booking.description || "",
        audience: booking.topic || "",
        department: booking.discipline || "",
        sector: booking.sector,
        dates: format(parseISO(booking.booking_date), "dd/MM/yyyy"),
        times: `${booking.start_time.slice(0, 5)}-${booking.end_time.slice(0, 5)}`,
        requesterName: booking.profiles?.full_name || "",
      };

      const { data, error } = await supabase.functions.invoke("generate-comunicado", {
        body: payload,
      });

      if (error) {
        toast.error("Erro ao gerar comunicado.");
        console.error(error);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setComunicado(data.comunicado);
      setComunicadoBooking({ ...booking, gestor_communique: data.comunicado });
      setTranslations({ pt: null, en: null, es: null });
      setActiveLang("pt");

      // Persiste o comunicado no agendamento — primeiro que gerar trava futuras gerações,
      // exceto quando o gestor está convertendo uma Solicitação em Comunicado formal.
      try {
        let q = supabase
          .from("bookings")
          .update({ gestor_communique: data.comunicado })
          .eq("id", booking.id);
        if (!asComunicado) q = q.is("gestor_communique", null);
        await q;
        // Atualiza listas locais para refletir o estado salvo
        setAllBookings((prev) => prev.map((bk) => bk.id === booking.id ? { ...bk, gestor_communique: data.comunicado } : bk));
        setBookings((prev) => prev.map((bk) => bk.id === booking.id ? { ...bk, gestor_communique: data.comunicado } : bk));
      } catch (persistErr) {
        console.warn("Falha ao persistir comunicado:", persistErr);
      }

      // Se autor é coord/supervisor, busca gestora p/ co-assinatura e notifica o sininho
      const isAuthorGestor =
        profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida";
      setGestorSigner(null);
      if (!isAuthorGestor && profile?.school_id) {
        try {
          const { data: gestores } = await supabase
            .from("profiles")
            .select("full_name, signature_url")
            .eq("school_id", profile.school_id)
            .eq("is_approved", true)
            .in("role", ["gestor_pedagogico", "chef_projeto_vida"])
            .limit(1);
          const g = gestores?.[0];
          if (g) setGestorSigner({ name: g.full_name, signature_url: g.signature_url ?? null });

          const summary = (booking.description || booking.topic || EVENT_LABELS[booking.event_type] || "novo comunicado").slice(0, 140);
          const ROLE_PT: Record<string, string> = {
            coord_pedagogico: "Coord. Pedagógica",
            supervisor: "Supervisor(a)",
            secretario_escolar: "Assistente de Aluno",
            teacher: "Professor(a)",
          };
          await supabase.rpc("notify_school_gestores_communique", {
            _school_id: profile.school_id,
            _author_name: profile.full_name || "Responsável",
            _author_role: ROLE_PT[profile.role || ""] || profile.role || "—",
            _booking_id: booking.id,
            _summary: summary,
          });
        } catch (notifyErr) {
          console.warn("Falha ao notificar gestor sobre comunicado:", notifyErr);
        }
      }
    } catch (e) {
      toast.error("Erro ao gerar comunicado.");
      console.error(e);
    } finally {
      setGeneratingId(null);
    }
  };

  const generatePdfBlob = async (overrideText?: string): Promise<Blob | null> => {
    const sourceText = overrideText ?? comunicado;
    if (!sourceText) return null;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    // Cabeçalho institucional oficial (3 linhas)
    const officialHeader = buildOfficialHeader({
      network: schoolNetwork,
      state: schoolState,
      city: schoolCity,
      schoolName,
    });
    const headerLineCount = officialHeader.lines.length || 1;
    // Header gradient bar height + margins (adapta à quantidade de linhas)
    const headerHeight = Math.max(26, 10 + headerLineCount * 6);
    const marginTop = headerHeight + 10;
    const marginLeft = 20;
    const marginRight = 20;
    const marginBottom = 20;
    const maxWidth = pageWidth - marginLeft - marginRight;

    // Load logo
    let logoImgData: string | null = null;
    if (schoolLogo) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = schoolLogo;
        });
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            logoImgData = canvas.toDataURL("image/png");
          }
        }
      } catch {}
    }
    const govLogoImg = await loadImageDataUrl(govLogoUrl);

    const addPageExtras = () => {
      // Marca d'água central (logo)
      if (logoImgData) {
        const wmSize = pageHeight * 0.7;
        doc.saveGraphicsState();
        (doc as any).setGState(new (doc as any).GState({ opacity: 0.06 }));
        doc.addImage(logoImgData, "PNG", (pageWidth - wmSize) / 2, (pageHeight - wmSize) / 2, wmSize, wmSize);
        doc.restoreGraphicsState();
      }

      // Faixa de cabeçalho com gradiente azul → verde (simulado com fatias verticais)
      const steps = 60;
      const sliceW = pageWidth / steps;
      // azul inicial (#1e3a8a) → verde final (#16a34a)
      const c1 = { r: 30, g: 58, b: 138 };
      const c2 = { r: 22, g: 163, b: 74 };
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        doc.setFillColor(r, g, b);
        doc.rect(i * sliceW, 0, sliceW + 0.5, headerHeight, "F");
      }

      // Logo do GOVERNO à esquerda (dentro da faixa)
      const logoSize = 18;
      const logoX = 6;
      const logoY = (headerHeight - logoSize) / 2;
      if (govLogoImg) {
        doc.addImage(govLogoImg, "PNG", logoX, logoY, logoSize, logoSize);
      }
      // Logo da ESCOLA à direita (dentro da faixa)
      const rightLogoX = pageWidth - logoSize - 6;
      if (logoImgData) {
        doc.addImage(logoImgData, "PNG", rightLogoX, logoY, logoSize, logoSize);
      }

      // Cabeçalho institucional (governo / secretaria / escola)
      {
        const textX = logoX + logoSize + 6;
        const textMaxW = pageWidth - textX - (logoImgData ? logoSize + 10 : 8);
        let hy = (headerHeight - headerLineCount * 5) / 2 + 4;
        doc.setTextColor(255, 255, 255);
        if (officialHeader.governo) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text(doc.splitTextToSize(officialHeader.governo.toUpperCase(), textMaxW)[0], textX, hy);
          hy += 5;
        }
        if (officialHeader.secretaria) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(235, 245, 255);
          doc.text(doc.splitTextToSize(officialHeader.secretaria, textMaxW)[0], textX, hy);
          hy += 5;
        }
        if (officialHeader.escola) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(255, 255, 255);
          doc.text(doc.splitTextToSize(officialHeader.escola, textMaxW)[0], textX, hy);
        }
        doc.setTextColor(0, 0, 0);
        doc.setFont("times", "normal");
      }
    };

    addPageExtras();

    // ABNT: Times New Roman 12, line spacing 1.5, justified, first-line indent 1.25cm
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    const lineHeight = 12 * 0.3528 * 1.5; // pt -> mm * 1.5
    const indent = 12.5; // 1.25cm

    const paragraphs = sourceText.split(/\n\s*\n/)
      .map(p => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean)
      .filter(p => !/^\s*comunicado\s*$/i.test(p));
    let y = marginTop;

    // Título "COMUNICADO" grande, centralizado
    doc.setFont("times", "bold");
    doc.setFontSize(26);
    doc.text("COMUNICADO", pageWidth / 2, y + 4, { align: "center" });
    // sublinhado decorativo
    const titleW = doc.getTextWidth("COMUNICADO");
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.6);
    doc.line(pageWidth / 2 - titleW / 2, y + 6.5, pageWidth / 2 + titleW / 2, y + 6.5);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    y += 16;

    const writeJustifiedLine = (line: string, x: number, yPos: number, isLastLine: boolean) => {
      const words = line.trim().split(/\s+/);
      if (words.length === 1 || isLastLine) {
        doc.text(line.trim(), x, yPos);
        return;
      }
      const textWidth = doc.getTextWidth(words.join(" "));
      const available = maxWidth - (x - marginLeft);
      const extraSpace = (available - textWidth) / (words.length - 1);
      let cursor = x;
      words.forEach((w, i) => {
        doc.text(w, cursor, yPos);
        cursor += doc.getTextWidth(w) + doc.getTextWidth(" ") + extraSpace;
      });
    };

    for (const para of paragraphs) {
      // Detect heading-like lines (short, all caps) - center, bold, no indent
      const isHeading = para.length < 80 && para === para.toUpperCase() && /[A-ZÀ-Ú]/.test(para);
      if (isHeading) {
        doc.setFont("times", "bold");
        const lines = doc.splitTextToSize(para, maxWidth);
        for (const line of lines) {
          if (y + lineHeight > pageHeight - marginBottom) { doc.addPage(); addPageExtras(); y = marginTop; }
          doc.text(line, pageWidth / 2, y, { align: "center" });
          y += lineHeight;
        }
        doc.setFont("times", "normal");
        y += lineHeight * 0.5;
        continue;
      }

      const firstLineWidth = maxWidth - indent;
      // Split first chunk with indented width, then rest with full width
      const allLines: { text: string; x: number }[] = [];
      let remaining = para;
      const firstChunk = doc.splitTextToSize(remaining, firstLineWidth)[0] || "";
      allLines.push({ text: firstChunk, x: marginLeft + indent });
      remaining = remaining.slice(firstChunk.length).trim();
      if (remaining) {
        const rest = doc.splitTextToSize(remaining, maxWidth);
        rest.forEach((l: string) => allLines.push({ text: l, x: marginLeft }));
      }

      for (let i = 0; i < allLines.length; i++) {
        if (y + lineHeight > pageHeight - marginBottom) { doc.addPage(); addPageExtras(); y = marginTop; }
        const isLast = i === allLines.length - 1;
        writeJustifiedLine(allLines[i].text, allLines[i].x, y, isLast);
        y += lineHeight;
      }
      y += lineHeight * 0.3;
    }

    // Signature block (ABNT): city/date, signature line, name and role
    const ROLE_LABELS: Record<string, string> = {
      gestor_pedagogico: "Gestor(a) Pedagógico(a)",
      coord_pedagogico: "Coordenador(a) Pedagógico(a)",
      supervisor: "Supervisor(a)",
      chef_projeto_vida: "Chef da Sala",
    };
    const signerName = profile?.full_name || "";
    const signerRole = ROLE_LABELS[profile?.role || ""] || "";
    const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const cityLine = `${schoolName ? schoolName + ", " : ""}${today}.`;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - marginBottom) { doc.addPage(); y = marginTop; }
    };

    // Try to load signer's scanned signature
    let signatureImg: string | null = null;
    let sigW = 0, sigH = 0;
    if (profile?.signature_url) {
      try {
        const signedUrl = await getSignedSignatureUrl(profile.signature_url);
        if (signedUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = signedUrl;
          });
          if (img.complete && img.naturalWidth > 0) {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              signatureImg = canvas.toDataURL("image/png");
              const targetW = 60; // mm
              const ratio = img.naturalHeight / img.naturalWidth;
              sigW = targetW;
              sigH = targetW * ratio;
              if (sigH > 25) { sigH = 25; sigW = 25 / ratio; }
            }
          }
        }
      } catch {}
    }

    ensureSpace(lineHeight * 6 + sigH);
    y += lineHeight * 1.5;
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.text(cityLine, pageWidth - marginRight, y, { align: "right" });
    y += lineHeight * 2;
    if (signatureImg) {
      doc.addImage(signatureImg, "PNG", (pageWidth - sigW) / 2, y, sigW, sigH);
      y += sigH + 1;
    } else {
      y += lineHeight;
    }
    const lineWidth = 80;
    const lineX = (pageWidth - lineWidth) / 2;
    doc.setLineWidth(0.3);
    doc.line(lineX, y, lineX + lineWidth, y);
    y += lineHeight * 0.9;
    if (signerName) {
      doc.setFont("times", "bold");
      doc.text(signerName, pageWidth / 2, y, { align: "center" });
      y += lineHeight;
    }
    if (signerRole) {
      doc.setFont("times", "normal");
      doc.text(signerRole, pageWidth / 2, y, { align: "center" });
      y += lineHeight;
    }

    // Co-assinatura da gestora (quando autor é coord/supervisor)
    if (gestorSigner && gestorSigner.name) {
      let gSigImg: string | null = null;
      let gSigW = 0, gSigH = 0;
      if (gestorSigner.signature_url) {
        try {
          const signedUrl = await getSignedSignatureUrl(gestorSigner.signature_url);
          if (signedUrl) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = signedUrl;
            });
            if (img.complete && img.naturalWidth > 0) {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                gSigImg = canvas.toDataURL("image/png");
                const targetW = 60;
                const ratio = img.naturalHeight / img.naturalWidth;
                gSigW = targetW;
                gSigH = targetW * ratio;
                if (gSigH > 25) { gSigH = 25; gSigW = 25 / ratio; }
              }
            }
          }
        } catch {}
      }

      ensureSpace(lineHeight * 5 + gSigH);
      y += lineHeight * 1.2;
      doc.setFont("times", "italic");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text("Aprovado e referendado pela Gestão Pedagógica:", pageWidth / 2, y, { align: "center" });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("times", "normal");
      y += lineHeight * 1.2;
      if (gSigImg) {
        doc.addImage(gSigImg, "PNG", (pageWidth - gSigW) / 2, y, gSigW, gSigH);
        y += gSigH + 1;
      } else {
        y += lineHeight;
      }
      doc.setLineWidth(0.3);
      doc.line(lineX, y, lineX + lineWidth, y);
      y += lineHeight * 0.9;
      doc.setFont("times", "bold");
      doc.text(gestorSigner.name, pageWidth / 2, y, { align: "center" });
      y += lineHeight;
      doc.setFont("times", "normal");
      doc.text("Gestor(a) Pedagógico(a)", pageWidth / 2, y, { align: "center" });
    }

    // ABNT NBR 14724: pagination "Página X de Y" at top-right of each page
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginRight, 15, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }

    return doc.output("blob");
  };

  const handleDownload = async () => {
    const text = await ensureTranslation(activeLang);
    const blob = await generatePdfBlob(text || undefined);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comunicado-${activeLang}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Comunicado baixado em PDF!");
  };

  const handleCopy = async () => {
    const text = currentText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Comunicado copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const handleShare = async () => {
    const text = await ensureTranslation(activeLang);
    const blob = await generatePdfBlob(text || undefined);
    if (!blob) return;
    const file = new File([blob], `comunicado-${activeLang}.pdf`, { type: "application/pdf" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: "Comunicado Escolar", files: [file] });
      } catch { /* cancelled */ }
    } else if (navigator.share) {
      try {
        await navigator.share({ title: "Comunicado Escolar", text: text || "" });
      } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  };

  // ============ Helpers WhatsApp / PDF (estilo /today-bookings) ============
  const buildEventTypeLabelExp = (t: string) => EVENT_LABELS[t] || t;

  const buildWhatsAppText = () => {
    const sorted = [...bookings].sort((a, b) => {
      if (a.booking_date !== b.booking_date) return a.booking_date.localeCompare(b.booking_date);
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      return a.end_time.localeCompare(b.end_time);
    });
    const sectorLabelHeader =
      sectorFilter === "all" ? "Todos os setores" : (getLabel(sectorFilter) || SECTOR_LABELS[sectorFilter] || sectorFilter);
    const divider = "━━━━━━━━━━━━━━━";
    const header =
      `📅 *AGENDAMENTOS POR SETOR*\n` +
      `📍 ${sectorLabelHeader}\n` +
      (schoolName ? `🏫 ${schoolName}\n` : "") +
      `📊 Total: *${sorted.length}* agendamento(s)\n` +
      `${divider}`;
    if (sorted.length === 0) return `${header}\n\n_Nenhum agendamento confirmado._`;
    const blocks = sorted.map((b, idx) => {
      const name = b.profiles?.full_name || b.visitor_name || "—";
      const sector = getLabel(b.sector) || SECTOR_LABELS[b.sector] || b.sector;
      const evt = buildEventTypeLabelExp(b.event_type);
      const topic = b.topic || b.description || "Sem assunto";
      const dateStr = format(parseISO(b.booking_date), "dd/MM/yyyy", { locale: ptBR });
      const createdAt = format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const lines: string[] = [];
      lines.push(`*${idx + 1}.* 📆 *${dateStr}* — ⏰ *${b.start_time.slice(0, 5)} – ${b.end_time.slice(0, 5)}*`);
      lines.push(`📍 Setor: ${sector}`);
      lines.push(`🏷️ Tipo: ${evt}`);
      lines.push(`📝 Assunto: ${topic}`);
      if (b.discipline) lines.push(`📚 Disciplina: ${b.discipline}`);
      lines.push(`👤 Responsável: ${name}`);
      if (b.visitor_name && b.visitor_name !== name) lines.push(`🧑‍💼 Visitante: ${b.visitor_name}`);
      if (b.resources && b.resources.length > 0) {
        const resStr = b.resources.map((r) => RESOURCE_LABELS[r] || r).join(", ");
        lines.push(`🎒 Recursos: ${resStr}`);
      }
      lines.push(`🗓️ _Agendado em ${createdAt}_`);
      return lines.join("\n");
    });
    const footer = `\n${divider}\n_Agendamento de Ambiente Escolar_`;
    return `${header}\n\n${blocks.join(`\n\n${divider}\n\n`)}${footer}`;
  };

  const handleOpenWhatsAppPreview = () => {
    setWaPreviewText(buildWhatsAppText());
    setWaPreviewOpen(true);
  };

  const handleConfirmShareWhatsApp = () => {
    const text = encodeURIComponent(waPreviewText);
    setWaPreviewOpen(false);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleCopyWhatsAppText = async () => {
    try {
      await navigator.clipboard.writeText(waPreviewText);
      toastUi({ title: "Mensagem copiada", description: "Cole onde quiser." });
    } catch {
      toastUi({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const handleGenerateListPDF = async (action: "download" | "share") => {
    if (exporting) return;
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const sectorLabelHeader =
        sectorFilter === "all" ? "Todos os setores" : (getLabel(sectorFilter) || SECTOR_LABELS[sectorFilter] || sectorFilter);

      // Cabeçalho oficial (Governo + Secretaria + Escola + Cidade/UF)
      const officialHeader = buildOfficialHeader({
        network: schoolNetwork,
        state: schoolState,
        city: schoolCity,
        schoolName,
      });

      // Barra superior em gradiente sólido (faixa institucional)
      doc.setFillColor(30, 41, 99); // azul institucional
      doc.rect(0, 0, pageWidth, 8, "F");

      let hy = 16;
      doc.setTextColor(20, 30, 70);
      if (officialHeader.governo) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(officialHeader.governo.toUpperCase(), pageWidth / 2, hy, { align: "center" });
        hy += 5;
      }
      if (officialHeader.secretaria) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(officialHeader.secretaria, pageWidth / 2, hy, { align: "center" });
        hy += 5;
      }
      if (officialHeader.escola) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(officialHeader.escola, pageWidth / 2, hy, { align: "center" });
        hy += 5;
      }
      if (schoolCity || schoolState) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(80, 80, 80);
        doc.text(
          `${schoolCity || "—"}${schoolState ? ` — ${schoolState.toUpperCase()}` : ""}`,
          pageWidth / 2, hy, { align: "center" }
        );
        hy += 5;
      }

      // Linha divisória
      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      doc.line(14, hy, pageWidth - 14, hy);
      hy += 6;

      // Título do relatório
      doc.setTextColor(30, 41, 99);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Relatório de Agendamentos", pageWidth / 2, hy, { align: "center" });
      hy += 5;

      // Metadados
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90, 90, 90);
      doc.text(
        `${sectorLabelHeader}  •  Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}  •  ${bookings.length} agendamento(s)`,
        pageWidth / 2, hy, { align: "center" }
      );
      hy += 4;
      doc.setTextColor(0, 0, 0);

      const todayStr = format(new Date(), "yyyy-MM-dd");
      const computeSituacao = (b: any): string => {
        if (b.status === "cancelled") return "Cancelado";
        const gs = b.gestor_status;
        if (gs === "approved" || gs === "deferred" || gs === "deferido") return "Deferido";
        if (gs === "rejected" || gs === "indeferido") return "Indeferido pelo gestor";
        const isPast = b.booking_date < todayStr;
        if (isPast) return "Não utilizado";
        return "Pendente do gestor";
      };

      const rows = bookings.map((b) => {
        const name = b.profiles?.full_name || b.visitor_name || "—";
        const sector = getLabel(b.sector) || SECTOR_LABELS[b.sector] || b.sector;
        const evt = buildEventTypeLabelExp(b.event_type);
        const detail = [b.topic, b.description].filter(Boolean).join(" — ") || "-";
        const extras = [
          b.discipline ? `Disc.: ${b.discipline}` : null,
          b.visitor_name ? `Visit.: ${b.visitor_name}` : null,
          (b.resources && b.resources.length) ? `Recursos: ${b.resources.map((r) => RESOURCE_LABELS[r] || r).join(", ")}` : null,
        ].filter(Boolean).join("\n");
        const dateStr = format(parseISO(b.booking_date), "dd/MM/yy", { locale: ptBR });
        return [
          `${dateStr}\n${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}`,
          sector,
          evt,
          name,
          extras ? `${detail}\n${extras}` : detail,
          computeSituacao(b),
          (b.gestor_response && String(b.gestor_response).trim()) ? String(b.gestor_response).trim() : "—",
        ];
      });

      autoTable(doc, {
        startY: hy + 2,
        head: [["Data / Horário", "Setor", "Tipo", "Responsável", "Assunto / Detalhes", "Situação", "Motivo"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2.2, overflow: "linebreak", valign: "middle", lineColor: [220, 220, 230], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 41, 99], textColor: 255, fontStyle: "bold", halign: "center", fontSize: 8.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [243, 244, 255] },
        columnStyles: {
          0: { cellWidth: 19, halign: "center", fontStyle: "bold", textColor: [30, 41, 99] },
          1: { cellWidth: 22, fontStyle: "bold" },
          2: { cellWidth: 18, halign: "center" },
          3: { cellWidth: 30 },
          4: { cellWidth: "auto" },
          5: { cellWidth: 22, halign: "center", fontStyle: "bold", fontSize: 7.5 },
          6: { cellWidth: 38, fontSize: 7.5, textColor: [55, 65, 81] },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const v = String(data.cell.raw || "");
            if (v === "Deferido") data.cell.styles.textColor = [22, 101, 52];
            else if (v.startsWith("Indeferido")) data.cell.styles.textColor = [153, 27, 27];
            else if (v === "Cancelado") data.cell.styles.textColor = [120, 53, 15];
            else if (v === "Pendente do gestor") data.cell.styles.textColor = [161, 98, 7];
            else if (v === "Não utilizado") data.cell.styles.textColor = [75, 85, 99];
          }
        },
        margin: { left: 8, right: 8, top: hy + 2 },
        didDrawPage: () => {
          // Rodapé institucional + fonte da informação
          doc.setDrawColor(99, 102, 241);
          doc.setLineWidth(0.3);
          doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
          doc.setFontSize(6.5);
          doc.setTextColor(110, 110, 110);
          const fonteTxt = `Fonte: Sistema de Agendamento de Ambiente Escolar — registros oficiais de ${officialHeader.escola || "—"}${schoolCity ? ` (${schoolCity}${schoolState ? `/${schoolState.toUpperCase()}` : ""})` : ""}. Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} por ${(profile?.full_name || "usuário autenticado")}. Documento gerado automaticamente a partir da base de dados da escola.`;
          const fonteLines = doc.splitTextToSize(fonteTxt, pageWidth - 28);
          doc.text(fonteLines, 14, pageHeight - 12);
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text(
            `${officialHeader.escola || "Agendamento Escolar"}${schoolCity ? ` — ${schoolCity}` : ""}${schoolState ? `/${schoolState.toUpperCase()}` : ""}`,
            14, pageHeight - 4
          );
          doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 4, { align: "right" });
          doc.setTextColor(0, 0, 0);
        },
      });

      const fileName = `agendamentos-setor-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      if (action === "download") {
        doc.save(fileName);
      } else {
        const blob = doc.output("blob");
        const file = new File([blob], fileName, { type: "application/pdf" });
        if (typeof navigator.share === "function" && (navigator as any).canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Agendamentos por Setor", text: schoolName });
          } catch { /* cancelado */ }
        } else {
          doc.save(fileName);
          toastUi({ title: "PDF baixado", description: "Compartilhamento direto não suportado neste dispositivo." });
        }
      }
    } catch (e) {
      console.error(e);
      toastUi({ title: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (exporting || bookings.length === 0) return;
    try {
      const headers = [
        "Data","Início","Fim","Setor","Tipo","Responsável","Disciplina","Assunto/Tema","Descrição","Visitante","Recursos",
      ];
      const escape = (v: string) => {
        const s = (v ?? "").toString().replace(/"/g, '""');
        return /[",;\n\r]/.test(s) ? `"${s}"` : s;
      };
      const rows = bookings.map((b) => [
        format(parseISO(b.booking_date), "dd/MM/yyyy", { locale: ptBR }),
        b.start_time.slice(0, 5),
        b.end_time.slice(0, 5),
        getLabel(b.sector) || SECTOR_LABELS[b.sector] || b.sector,
        EVENT_LABELS[b.event_type] || b.event_type,
        b.profiles?.full_name || "—",
        b.discipline || "",
        b.topic || "",
        b.description || "",
        b.visitor_name || "",
        (b.resources || []).map((r) => RESOURCE_LABELS[r] || r).join(", "),
      ].map(escape).join(";"));
      const csv = "\uFEFF" + [headers.map(escape).join(";"), ...rows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const sectorTag = sectorFilter === "all" ? "todos" : sectorFilter;
      const a = document.createElement("a");
      a.href = url;
      a.download = `agendamentos-${sectorTag}-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV baixado!");
    } catch (e) {
      console.error(e);
      toastUi({ title: "Erro ao gerar CSV", variant: "destructive" });
    }
  };

  // ============ Filtro por setor estilo /today-bookings ============
  const ALL_SECTORS_FILTER: { key: string; icon: LucideIcon }[] = [
    { key: "informatica", icon: Monitor },
    { key: "quadra", icon: TrophyIcon },
    { key: "patio", icon: TreePine },
    { key: "biblioteca", icon: BookOpen },
    { key: "lab_ciencias", icon: FlaskConical },
    { key: "sala_professores", icon: Users },
    { key: "projeto_vida", icon: Lightbulb },
  ];
  const DEFAULT_SECTOR_LABELS_FILTER: Record<string, string> = {
    biblioteca: "Biblioteca",
    lab_ciencias: "Lab. de Ciências",
    sala_professores: "Sala dos Professores",
  };
  const sectorLabelFor = (key: string) => {
    const l = getLabel(key);
    return l === key ? (DEFAULT_SECTOR_LABELS_FILTER[key] || SECTOR_LABELS[key] || key) : l;
  };
  const sectorCounts: Record<string, number> = dateScopedBookings.reduce((acc, b) => {
    acc[b.sector] = (acc[b.sector] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sectorOptions: { key: string; label: string; count: number; icon: LucideIcon }[] = [
    { key: "all", label: "Todos", count: dateScopedBookings.length, icon: LayoutGrid },
    ...ALL_SECTORS_FILTER.map((s) => ({ key: s.key, label: sectorLabelFor(s.key), count: sectorCounts[s.key] ?? 0, icon: s.icon })),
  ];

  const cardGradient = (selected: boolean) =>
    selected
      ? `radial-gradient(circle at 30% 25%, hsla(${color.hueA}, ${color.satA + 10}%, ${color.lightA + 12}%, 1) 0%, hsla(${color.hueB}, ${color.satB + 5}%, ${color.lightB + 6}%, 1) 60%, hsla(${color.hueC}, ${color.satC + 10}%, ${color.lightC + 4}%, 1) 100%)`
      : `linear-gradient(145deg, hsla(${color.hueA}, ${color.satA}%, ${color.lightA}%, 1), hsla(${color.hueB}, ${color.satB}%, ${color.lightB}%, 1))`;
  const cardSolid = (selected: boolean) => {
    const l = selected ? color.lightA + 8 : color.lightB;
    const s = selected ? color.satA : color.satB;
    const h = selected ? color.hueA : color.hueB;
    return `hsl(${h}, ${s}%, ${l}%)`;
  };

  const activeTabInfo = SECTOR_TABS.find((t) => t.key === activeTab) || SECTOR_TABS[0];
  const ActiveIcon = activeTabInfo.icon;

  const todayLabel = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <GestorThemeShell enabled scrollable={false}>
    <div className="relative flex flex-col h-dvh select-none overflow-hidden">


      {/* Comunicado Modal */}
      {comunicadoBooking && comunicado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsla(0,0%,0%,0.7)" }}>
          <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: "hsl(220, 50%, 18%)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {comunicadoBooking && (isStoredSolicitacao(comunicadoBooking) || (comunicadoBooking.event_type === "evento_externo" && isSolicitacaoText(comunicado))) ? "Solicitação" : "Comunicado"} {isEditing && <span className="text-amber-300 text-[10px]">(editando)</span>}
              </h2>
              <div className="flex items-center gap-1.5">
                {!isEditing ? (
                  <>
                    {/* Botão "Gerar Comunicado" movido para barra dedicada abaixo do conteúdo */}
                    {comunicadoBooking?.user_id === profile?.user_id && viewMode !== "history" && (
                      <button
                        onClick={() => { setEditDraft(comunicado || ""); setIsEditing(true); }}
                        className="h-7 px-2 rounded-lg bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 transition-all flex items-center gap-1 text-[11px] font-bold"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setComunicado(editDraft); setTranslations({ pt: null, en: null, es: null }); setActiveLang("pt"); setIsEditing(false); toast.success("Alterações salvas"); }}
                      className="h-7 px-2 rounded-lg bg-emerald-500/30 text-emerald-200 hover:bg-emerald-500/40 transition-all flex items-center gap-1 text-[11px] font-bold"
                    >
                      <Check className="h-3.5 w-3.5" /> Salvar
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="h-7 px-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-all text-[11px] font-bold"
                    >
                      Cancelar
                    </button>
                  </>
                )}
                <button onClick={() => { setComunicadoBooking(null); setComunicado(null); setIsEditing(false); setGestorSigner(null); setTranslations({ pt: null, en: null, es: null }); setActiveLang("pt"); }} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!isEditing && (
                <div className="flex gap-1.5 mb-3 px-1">
                  {(["pt", "en", "es"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleSelectLang(l)}
                      disabled={translatingLang !== null}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        activeLang === l
                          ? "bg-amber-500 text-white shadow-md"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      } disabled:opacity-50`}
                    >
                      <span>{langFlags[l]}</span>
                      {translatingLang === l ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span>{langLabels[l]}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {isEditing ? (
                <Textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  className="w-full min-h-[50vh] bg-white text-gray-800 text-sm leading-relaxed rounded-xl p-5 shadow-lg border-0 focus-visible:ring-2 focus-visible:ring-amber-400 resize-none"
                  style={{ fontFamily: '"Times New Roman", Times, serif', textAlign: "justify", lineHeight: 1.5 }}
                />
              ) : (
                <div
                  className="bg-white rounded-xl p-5 text-gray-800 text-sm whitespace-pre-wrap shadow-lg"
                  style={{ fontFamily: '"Times New Roman", Times, serif', textAlign: "justify", lineHeight: 1.5, textIndent: "1.25cm" }}
                >
                  {currentText}
                </div>
              )}
            </div>

            {comunicadoBooking?.event_type === "evento_externo" && isManagerLike && !isEditing && viewMode !== "history" && (
              <div className="px-4 pt-3 pb-1">
                <Button
                  size="sm"
                  className="w-full rounded-xl h-10 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold disabled:opacity-60"
                  onClick={() => {
                    // Se já existe um Comunicado oficial, abre em modo edição.
                    // Se o que existe ainda é a Solicitação (ou nada), gera o Comunicado oficial.
                    if (comunicado && !isSolicitacaoText(comunicado)) {
                      setEditDraft(comunicado);
                      setIsEditing(true);
                    } else {
                      handleGenerateComunicado(comunicadoBooking, { forceComunicado: true });
                    }
                  }}
                  disabled={generatingId === comunicadoBooking?.id}
                >
                  {generatingId === comunicadoBooking?.id ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
                  ) : comunicado && !isSolicitacaoText(comunicado) ? (
                    <><Pencil className="h-4 w-4 mr-1" /> Editar Comunicado</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-1" /> Gerar Comunicado</>
                  )}
                </Button>
              </div>
            )}

            {comunicadoBooking?.event_type === "evento_externo" && (
              <div className="px-4 py-2 border-t border-white/10 flex items-center gap-2">
                {comunicadoBooking.gestor_status === "approved" || comunicadoBooking.gestor_status === "rejected" ? (
                  <span
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${
                      comunicadoBooking.gestor_status === "approved"
                        ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
                        : "bg-rose-500/25 text-rose-200 border border-rose-400/40"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" /> Resolvido ({comunicadoBooking.gestor_status === "approved" ? "Deferido" : "Indeferido"})
                  </span>
                ) : isManagerLike && viewMode !== "history" ? (
                  <>
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60"
                      onClick={() => handleResolveSolicitacao(comunicadoBooking, "approved")}
                      disabled={resolvingId === comunicadoBooking.id || isEditing}
                    >
                      <Check className="h-4 w-4 mr-1" /> Deferido
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-60"
                      onClick={() => handleResolveSolicitacao(comunicadoBooking, "rejected")}
                      disabled={resolvingId === comunicadoBooking.id || isEditing}
                    >
                      <X className="h-4 w-4 mr-1" /> Indeferido
                    </Button>
                  </>
                ) : null}
              </div>
            )}

            <div className="px-4 py-3 border-t border-white/10 flex gap-2">
              <Button size="sm" className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-xs font-bold" onClick={handleDownload} disabled={isEditing}>
                <Download className="h-4 w-4 mr-1" /> Baixar
              </Button>
              <Button size="sm" className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold" onClick={handleCopy} disabled={isEditing}>
                <Copy className="h-4 w-4 mr-1" /> Copiar
              </Button>
              <Button size="sm" className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold" onClick={handleShare} disabled={isEditing}>
                <Share2 className="h-4 w-4 mr-1" /> Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailsBooking && (() => {
        const b = detailsBooking;
        const useDate = parseISO(b.booking_date);
        const useDateStr = format(useDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        const createdStr = format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        const todayStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        const startMin = parseInt(b.start_time.slice(0,2)) * 60 + parseInt(b.start_time.slice(3,5));
        const endMin = parseInt(b.end_time.slice(0,2)) * 60 + parseInt(b.end_time.slice(3,5));
        const durMin = endMin - startMin;
        const isOrdered = durMin === 60 || durMin === 55;
        const horarioTipo = isOrdered ? "Horário Ordenado (tempo de aula padrão)" : "Horário Avulso (personalizado)";
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "hsla(0,0%,0%,0.75)" }} onClick={() => setDetailsBooking(null)}>
            <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl" style={{ background: "hsl(220, 50%, 18%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-amber-400/10">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-amber-300 shrink-0" />
                  <h2 className="text-base font-bold text-white truncate">Detalhes do Agendamento</h2>
                </div>
                <button onClick={() => setDetailsBooking(null)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Assunto / Tema</p>
                  <p className="text-white text-lg font-bold break-words">
                    {b.description || b.topic || EVENT_LABELS[b.event_type] || b.event_type}
                  </p>
                  <Badge className="mt-2 text-[10px] px-2 py-0.5 bg-amber-400/20 text-amber-300 border-0">
                    {EVENT_LABELS[b.event_type] || b.event_type}
                  </Badge>
                </div>

                {b.event_type === "evento_externo" && (() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const bDate = parseISO(b.booking_date); bDate.setHours(0,0,0,0);
                  const isPast = bDate < today;
                  if (b.gestor_status === "approved") {
                    return (
                      <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 p-3 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-emerald-200/80 font-bold">Status do gestor</p>
                          <p className="text-emerald-100 text-sm font-bold">Aprovado pelo gestor</p>
                        </div>
                      </div>
                    );
                  }
                  if (b.gestor_status === "denied") {
                    return (
                      <div className="rounded-xl bg-red-500/15 border border-red-400/40 p-3">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-300 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-red-200/80 font-bold">Status do gestor</p>
                            <p className="text-red-100 text-sm font-bold">Recusado pelo gestor</p>
                          </div>
                        </div>
                        {b.gestor_response && (
                          <p className="text-red-100/90 text-xs mt-2 whitespace-pre-wrap break-words">{b.gestor_response}</p>
                        )}
                      </div>
                    );
                  }
                  if (isPast) {
                    return (
                      <div className="rounded-xl bg-red-500/15 border border-red-400/50 p-3 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-300 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-red-200/80 font-bold">Status do gestor</p>
                          <p className="text-red-100 text-sm font-bold">Não avaliado pelo gestor</p>
                          <p className="text-red-100/80 text-[11px] mt-0.5">O prazo do agendamento já passou sem manifestação do gestor.</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl bg-amber-400/15 border border-amber-300/40 p-3 flex items-center gap-2">
                      <span className="relative flex h-3 w-3 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400"></span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-amber-200/80 font-bold">Status do gestor</p>
                        <p className="text-amber-100 text-sm font-bold">Aguardando aprovação do gestor</p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                      <CalendarIcon className="h-3 w-3" /> Setor
                    </div>
                    <p className="text-white text-sm font-bold break-words">{SECTOR_LABELS[b.sector] || b.sector}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                      <Clock className="h-3 w-3" /> Horário
                    </div>
                    <p className="text-white text-sm font-bold">{b.start_time.slice(0, 5)} - {b.end_time.slice(0, 5)}</p>
                    <p className="text-white/50 text-[10px] mt-0.5">{horarioTipo}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                    <CalendarDays className="h-3 w-3" /> Dia de uso do ambiente
                  </div>
                  <p className="text-white text-sm font-bold capitalize break-words">{useDateStr}</p>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                    <Users className="h-3 w-3" /> Professor / Responsável
                  </div>
                  <p className="text-white text-sm font-bold break-words">{b.profiles?.full_name || "Usuário"}</p>
                </div>

                {b.discipline && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                      <BookOpen className="h-3 w-3" /> Disciplina
                    </div>
                    <p className="text-white text-sm font-bold break-words">{b.discipline}</p>
                  </div>
                )}

                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2">
                    <Monitor className="h-3 w-3" /> Recursos utilizados
                  </div>
                  {b.resources && b.resources.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {b.resources.map((r) => {
                        const Icon = RESOURCE_ICONS[r] || Monitor;
                        return (
                          <span key={r} className="flex items-center gap-1.5 text-xs text-white/90 bg-white/10 px-2.5 py-1.5 rounded-lg font-semibold">
                            <Icon className="h-3.5 w-3.5" />
                            {RESOURCE_LABELS[r] || r}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-white/40 text-xs italic">Nenhum recurso solicitado</p>
                  )}
                </div>

                {b.visitor_name && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                      <Users className="h-3 w-3" /> Visitante / Convidado
                    </div>
                    <p className="text-white text-sm font-bold break-words">{b.visitor_name}</p>
                    {b.visitor_info && <p className="text-white/60 text-xs mt-0.5 break-words">{b.visitor_info}</p>}
                  </div>
                )}

                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300/80 font-bold mb-1">
                    <Hash className="h-3 w-3" /> Data em que o agendamento foi feito
                  </div>
                  <p className="text-emerald-100 text-sm font-bold">{createdStr}</p>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-white/10 bg-black/20 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    onClick={() => shareDetailsWhatsApp(b)}
                    className="rounded-xl h-11 text-sm font-bold bg-[#25D366] hover:bg-[#20BD5A] text-white shadow-md"
                  >
                    <Share2 className="h-4 w-4 mr-1.5" /> WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => downloadDetailsPdf(b)}
                    className="rounded-xl h-11 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md"
                  >
                    <Download className="h-4 w-4 mr-1.5" /> Baixar PDF
                  </Button>
                </div>
                <p className="text-white/60 text-xs font-semibold flex items-center justify-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  {schoolCity || "—"}, {todayStr}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header padrão */}
      <div className="relative z-10 shrink-0 max-w-4xl w-full mx-auto px-1 sm:px-3 pt-20 pb-2">
        <GestorPremiumHeader
          title={schoolName || "Agendamentos por Setor"}
          subtitle={
            viewMode === "history"
              ? "Histórico — agendamentos anteriores"
              : todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)
          }
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode((v) => (v === "upcoming" ? "history" : "upcoming"))}
                title={viewMode === "history" ? "Voltar para próximos" : "Ver agendamentos anteriores"}
                aria-label="Alternar histórico"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:brightness-110 transition shrink-0"
                style={{
                  background: viewMode === "history"
                    ? "hsla(38, 92%, 50%, 0.95)"
                    : "hsla(220, 30%, 100%, 0.14)",
                  boxShadow: viewMode === "history" ? "0 0 0 2px hsla(38,100%,75%,0.6)" : undefined,
                  color: viewMode === "history" ? "hsl(30, 80%, 12%)" : "white",
                }}
              >
                <HistoryIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleOpenWhatsAppPreview}
                title="Compartilhar no WhatsApp"
                aria-label="Compartilhar no WhatsApp"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:brightness-110 transition shrink-0"
                style={{ background: "hsla(142, 70%, 38%, 0.95)" }}
              
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleGenerateListPDF((typeof navigator.share === "function") ? "share" : "download")}
                disabled={exporting}
                title="Baixar / Compartilhar PDF"
                aria-label="Baixar PDF"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:brightness-110 transition disabled:opacity-40 shrink-0"
                style={{ background: "hsla(0, 70%, 48%, 0.95)" }}
              >
                <Download className="h-4 w-4" />
              </button>
              <span className="w-9 h-9 rounded-xl bg-amber-500 text-amber-950 font-bold flex items-center justify-center text-sm shrink-0">
                {bookings.length}
              </span>
            </div>
          }
        />
      </div>

      {/* Filtro por setor — mini-cards estilo /sectors (igual /today-bookings) */}
      <div className="relative z-10 shrink-0 px-1 pb-2">

        <div className="grid grid-cols-4 gap-1.5">
          {sectorOptions.map((opt) => {
            const active = sectorFilter === opt.key;
            const empty = opt.count === 0;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSectorFilter(opt.key)}
                className="relative flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-white text-[9px] font-bold uppercase tracking-wider hover:brightness-125 active:scale-95 overflow-hidden transition-all"
                style={{
                  background: viewMode === "history"
                    ? (active
                        ? "linear-gradient(180deg, hsl(220, 8%, 55%), hsl(220, 10%, 35%))"
                        : "linear-gradient(180deg, hsl(220, 8%, 42%), hsl(220, 10%, 28%))")
                    : (glowEnabled ? cardGradient(active) : cardSolid(active)),
                  borderRadius: 12,
                  minHeight: 56,
                  opacity: 1,
                  border: viewMode === "history"
                    ? (active ? "2px solid hsla(220, 15%, 85%, 0.9)" : "1px solid hsla(220, 10%, 60%, 0.4)")
                    : (active
                        ? `2px solid hsla(${color.hueA}, 95%, 78%, 0.95)`
                        : `1px solid hsla(${color.hueA}, 60%, 55%, 0.4)`),
                  boxShadow: viewMode === "history"
                    ? (active
                        ? "0 0 0 3px hsla(220, 15%, 80%, 0.6), 0 4px 12px hsla(220, 20%, 5%, 0.5)"
                        : "0 2px 6px hsla(220, 20%, 5%, 0.4)")
                    : (active
                        ? `0 0 0 3px hsla(${color.hueA}, 100%, 80%, 0.85), 0 0 28px hsla(${color.hueA}, 100%, 65%, 0.95), 0 0 56px hsla(${color.hueA}, 95%, 60%, 0.7), inset 0 1px 6px hsla(0, 0%, 100%, 0.55)`
                        : (glowEnabled
                            ? `inset 0 1px 3px hsla(${color.hueA}, 90%, 75%, 0.25), 0 4px 10px hsla(${color.hueC}, 80%, 5%, 0.5)`
                            : "0 2px 6px hsla(220, 80%, 5%, 0.4)")),
                }}
              >
                {glowEnabled && (
                  <span aria-hidden className="absolute inset-x-1 top-0.5 h-2 rounded-full pointer-events-none"
                    style={{ background: "linear-gradient(180deg, hsla(0,0%,100%,0.28) 0%, transparent 100%)", filter: "blur(1.5px)" }} />
                )}
                <Icon className="h-4 w-4 relative z-10 shrink-0" strokeWidth={1.8} />
                <span className="relative z-10 text-center leading-tight line-clamp-2 px-0.5" style={{ textShadow: "0 1px 2px hsla(220,90%,5%,0.7)" }}>
                  {opt.label}
                </span>
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-white/95 text-[hsl(220,60%,12%)] text-[9px] font-black flex items-center justify-center shadow-sm z-10">
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Event-type filter (only for new sectors) */}
      {SECTORS_WITH_EVENT_FILTER.includes(activeTab) && (
        <div className="relative z-10 shrink-0 px-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {EVENT_TYPE_OPTIONS.map((opt) => {
              const isActive = eventTypeFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setEventTypeFilter(opt.key)}
                  className={`shrink-0 px-3 h-8 rounded-full text-[11px] font-bold uppercase tracking-tight transition-all ${
                    isActive
                      ? "bg-amber-400/25 text-amber-200 border border-amber-400/50 shadow"
                      : "bg-white/5 text-white/55 border border-white/10 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Busca por nome / telefone / assunto */}
      <div className="relative z-10 shrink-0 px-1 pb-2">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(220,60%,40%)] pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.slice(0, 80))}
            placeholder="Buscar por nome, telefone ou assunto..."
            className="w-full h-10 pl-9 pr-9 rounded-xl bg-white border border-white/20 text-[hsl(220,60%,20%)] text-sm placeholder:text-[hsl(220,40%,45%)] focus:outline-none focus:border-[hsl(220,60%,40%)] focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[hsl(220,60%,28%)] hover:bg-[hsl(220,60%,22%)] text-white flex items-center justify-center transition-all"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto pl-1 pr-2 pb-6 pt-1">
        {(() => {
          // Guarda extra: garante que agendamentos de dias passados nunca apareçam
          // em "Próximos" — eles pertencem exclusivamente ao Histórico assim que vira o dia.
          const _todayISO = format(new Date(), "yyyy-MM-dd");
          const dateGuarded = bookings.filter((b) =>
            viewMode === "history" ? b.booking_date < _todayISO : b.booking_date >= _todayISO
          );
          const eventFiltered = SECTORS_WITH_EVENT_FILTER.includes(activeTab) && eventTypeFilter !== "todos"
            ? dateGuarded.filter((b) => b.event_type === eventTypeFilter)
            : dateGuarded;
          const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const digits = (s: string) => s.replace(/\D/g, "");
          const q = searchQuery.trim();
          const qNorm = normalize(q);
          const qDigits = digits(q);
          const filteredBookings = q
            ? eventFiltered.filter((b) => {
                const haystack = normalize([
                  b.profiles?.full_name || "",
                  b.visitor_name || "",
                  b.topic || "",
                  b.description || "",
                  b.discipline || "",
                ].join(" "));
                if (haystack.includes(qNorm)) return true;
                if (qDigits.length >= 3) {
                  const phone = digits(b.profiles?.phone || "");
                  if (phone && phone.includes(qDigits)) return true;
                }
                return false;
              })
            : eventFiltered;
          return loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ActiveIcon className="h-14 w-14 text-white/20" />
            <p className="text-white/40 text-base text-center">
              Nenhum agendamento em <span className="font-bold text-white/60">{getLabel(activeTabInfo.key)}</span>
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredBookings.map((booking, idx) => {
              const name = booking.profiles?.full_name || booking.visitor_name || "—";
              const sectorLabel = getLabel(booking.sector);
              const zebra = viewMode === "history"
                ? (idx % 2 === 0 ? "bg-slate-300/30" : "bg-slate-400/20")
                : (idx % 2 === 0 ? "bg-white/[0.06]" : "bg-white/[0.03]");
              const isGenerating = generatingId === booking.id;

              const eventTypeMap: Record<string, { label: string; tone: string }> = {
                aula: { label: "Aula", tone: "bg-sky-500/20 text-sky-200 border-sky-400/30" },
                evento_escolar: { label: "Evento Escolar", tone: "bg-violet-500/20 text-violet-200 border-violet-400/30" },
                evento_externo: { label: "Evento Externo", tone: "bg-amber-500/20 text-amber-200 border-amber-400/30" },
                reuniao: { label: "Reunião", tone: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30" },
                outros: { label: "Evento Escolar", tone: "bg-violet-500/20 text-violet-200 border-violet-400/30" },
                palestra: { label: "Palestra", tone: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/30" },
              };
              const evt = eventTypeMap[booking.event_type] || { label: EVENT_LABELS[booking.event_type] || booking.event_type, tone: "bg-white/15 text-white/80 border-white/20" };

              const [sh, sm] = booking.start_time.split(":").map(Number);
              const [eh, em] = booking.end_time.split(":").map(Number);
              const durMin = (eh * 60 + em) - (sh * 60 + sm);
              const durLabel = durMin >= 60
                ? `${Math.floor(durMin / 60)}h${durMin % 60 ? ` ${durMin % 60}min` : ""}`
                : `${durMin}min`;

              const hasVisitor = !!(booking.visitor_name || booking.visitor_info);
              const hasResources = Array.isArray(booking.resources) && booking.resources.length > 0;
              const hasDescription = !!booking.description && booking.description !== booking.topic;

              return (
                <li
                  key={booking.id}
                  onClick={() => setDetailsBooking(booking)}
                  className={`rounded-xl border-2 border-amber-400/40 ring-1 ring-amber-400/15 ${zebra} pl-1.5 pr-3 py-3 cursor-pointer transition-colors text-white`}
                >
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 w-[84px] flex flex-col gap-2">
                      <div className="self-stretch flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 px-1 py-3">
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-white text-xl font-black uppercase tracking-wider leading-none mb-1">
                            {format(parseISO(booking.booking_date), "EEEEEE", { locale: ptBR }).replace(".", "").toUpperCase()}
                          </span>
                          <span className="text-white text-lg font-black leading-none tabular-nums">
                            {format(parseISO(booking.booking_date), "dd/MM", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="w-9 h-px bg-white/15" />
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-white text-lg font-extrabold leading-none tabular-nums">{booking.start_time.slice(0, 5)}</span>
                          <span className="text-white/70 text-[11px] font-bold leading-none my-0.5">às</span>
                          <span className="text-white text-lg font-extrabold leading-none tabular-nums">{booking.end_time.slice(0, 5)}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-white/80 mt-0.5">
                          <Hourglass className="h-3 w-3" />{durLabel}
                        </span>
                      </div>


                      {/* Ações (abaixo da tarja de horário, mesma largura) */}
                      {canViewExistingComunicado(booking) ? (
                        <div className="grid grid-cols-1 gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const text = booking.event_type === "evento_externo"
                                ? (isSolicitacaoText(booking.gestor_communique)
                                    ? (booking.gestor_communique || "")
                                    : buildSolicitacaoText(booking))
                                : (booking.gestor_communique || "");
                              setComunicado(text);
                              setComunicadoBooking(booking);
                              setTranslations({ pt: null, en: null, es: null });
                              setActiveLang("pt");
                            }}
                            className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[11px] font-bold transition-all active:scale-95 text-white whitespace-nowrap"
                            style={{ background: "linear-gradient(135deg, #2563eb, #3b82f6)", boxShadow: "0 0 18px rgba(59,130,246,0.35)" }}
                          >
                            <FileText className="h-3 w-3" /> {booking.event_type === "evento_externo" ? "Ver Solicitação" : "Ver Comunicado"}
                          </button>
                          {isManagerLike && viewMode !== "history" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (booking.gestor_communique && !isSolicitacaoText(booking.gestor_communique)) {
                                  setComunicado(booking.gestor_communique);
                                  setComunicadoBooking(booking);
                                  setEditDraft(booking.gestor_communique);
                                  setIsEditing(true);
                                  setTranslations({ pt: null, en: null, es: null });
                                  setActiveLang("pt");
                                } else {
                                  handleGenerateComunicado(booking, { forceComunicado: true });
                                }
                              }}
                              disabled={generatingId === booking.id}
                              className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[11px] font-bold transition-all active:scale-95 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 whitespace-nowrap"
                            >
                              {generatingId === booking.id ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Gerando...</>
                              ) : booking.gestor_communique && !isSolicitacaoText(booking.gestor_communique) ? (
                                <><Pencil className="h-3 w-3" /> Editar</>
                              ) : (
                                <><FileText className="h-3 w-3" /> Gerar</>
                              )}
                            </button>
                          )}
                          {(booking.gestor_status === "approved" || booking.gestor_status === "rejected") && (
                            <span
                              className={`w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[11px] font-bold whitespace-nowrap ${
                                booking.gestor_status === "approved"
                                  ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
                                  : "bg-rose-500/25 text-rose-200 border border-rose-400/40"
                              }`}
                            >
                              <Check className="h-3 w-3" /> {booking.gestor_status === "approved" ? "Deferido" : "Indeferido"}
                            </span>
                          )}
                        </div>
                      ) : canGenerateComunicadoFor(booking) && viewMode !== "history" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleGenerateComunicado(booking); }}
                          disabled={isGenerating}
                          className="flex-1 min-w-0 flex items-center justify-center gap-1 px-1 py-1.5 rounded-md text-[10px] font-bold transition-all active:scale-95 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
                        >
                          {isGenerating ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Gerando...</>
                          ) : booking.event_type === "evento_externo" ? (
                            <><FileText className="h-3 w-3" /> Solicitação</>
                          ) : (
                            <><FileText className="h-3 w-3" /> Comunicado</>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Linha 1: Tipo + Setor */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${evt.tone}`}>
                          <Tag className="h-2.5 w-2.5" />{evt.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-semibold text-white/85">
                          <MapPin className="h-2.5 w-2.5" />{sectorLabel}
                        </span>
                        {booking.event_type === "evento_externo" && booking.gestor_status === "pending" && (() => {
                          const today = new Date(); today.setHours(0,0,0,0);
                          const bDate = new Date(booking.booking_date + "T00:00:00");
                          const expired = bDate < today;
                          return expired ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold uppercase tracking-wide bg-red-500/20 border-red-300/50 text-red-100"
                              title="O prazo passou sem decisão do gestor"
                            >
                              <span className="relative flex h-2 w-2">
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                              </span>
                              Não avaliado pelo gestor
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold uppercase tracking-wide bg-amber-500/20 border-amber-300/50 text-amber-100 animate-pulse"
                              title="Aguardando aprovação do gestor"
                            >
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75 animate-ping" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                              </span>
                              Aguardando gestor
                            </span>
                          );
                        })()}
                      </div>

                      {/* Assunto / tema */}
                      <p className="text-white font-bold text-sm break-words leading-snug">
                        {booking.topic || booking.description || "Sem assunto"}
                      </p>

                      {/* Descrição extra */}
                      {hasDescription && (
                        <p className="mt-1 text-white/65 text-[11px] break-words flex items-start gap-1">
                          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{booking.description}</span>
                        </p>
                      )}

                      {/* Responsável */}
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-white/75">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="break-words font-semibold">{name}</span>
                      </div>

                      {/* Disciplina */}
                      {booking.discipline && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/65">
                          <BookMarked className="h-3 w-3 shrink-0" />
                          <span className="break-words">{booking.discipline}</span>
                        </div>
                      )}

                      {/* Visitante */}
                      {hasVisitor && (
                        <div className="mt-0.5 flex items-start gap-1 text-[11px] text-white/65">
                          <UserCheck className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="break-words">
                            {booking.visitor_name && <span className="font-semibold text-white/80">{booking.visitor_name}</span>}
                            {booking.visitor_name && booking.visitor_info && " — "}
                            {booking.visitor_info}
                          </span>
                        </div>
                      )}

                      {/* Data + ID */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-white/45 font-mono">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-2.5 w-2.5" />
                          Agendado em {format(new Date(booking.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-white/35">
                          <Hash className="h-2.5 w-2.5" />{booking.id.slice(0, 8)}
                        </span>
                      </div>

                    </div>
                  </div>

                  {/* Recursos utilizados — largura total do card (estilo TodayBookings) */}
                  {hasResources && (
                    <div className="mt-2.5 w-full">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-white/55 mb-1 flex items-center gap-1">
                        <Monitor className="h-2.5 w-2.5" /> Recursos utilizados
                      </p>
                      <div className="flex flex-wrap items-stretch gap-1.5 w-full">
                        {booking.resources!.map((r) => {
                          const RIcon = RESOURCE_ICONS[r] || Package;
                          return (
                            <span
                              key={r}
                              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-white/10 border border-white/15 text-[11px] font-bold uppercase tracking-wide text-white/90"
                            >
                              <RIcon className="h-3 w-3" />
                              <span className="break-words">{RESOURCE_LABELS[r] || r}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </li>


              );
            })}
          </ul>
        );
        })()}
      </div>

      {/* Bottom button */}
      <div className="relative z-10 px-4 pb-4 pt-2">
        <Button
          size="lg"
          className="w-full rounded-2xl h-14 text-base font-bold bg-primary hover:bg-primary/90"
          onClick={() => navigate("/sectors")}
        >
          Novo Agendamento
        </Button>
      </div>

      {/* Modal de pré-visualização da mensagem do WhatsApp (igual /today-bookings) */}
      {waPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3"
          onClick={() => setWaPreviewOpen(false)}
        >
          <div
            className="relative w-full max-w-md bg-[hsl(220,40%,12%)] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "hsla(142, 70%, 38%, 0.85)" }}>
                <Share2 className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Pré-visualizar mensagem</p>
                <p className="text-white/55 text-[11px] leading-tight">Confira antes de compartilhar no WhatsApp</p>
              </div>
              <button
                type="button"
                onClick={() => setWaPreviewOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3" style={{ background: "hsl(220, 30%, 9%)" }}>
              <div className="ml-auto max-w-full bg-[hsl(142,40%,22%)] text-white rounded-2xl rounded-tr-sm px-3 py-2 text-[13px] whitespace-pre-wrap break-words font-sans leading-relaxed shadow-md">
                {waPreviewText}
              </div>
            </div>
            <details className="border-t border-white/10 bg-white/[0.03]">
              <summary className="px-4 py-2 text-[11px] text-white/60 cursor-pointer select-none hover:text-white/85">
                Editar mensagem antes de enviar
              </summary>
              <textarea
                value={waPreviewText}
                onChange={(e) => setWaPreviewText(e.target.value)}
                rows={6}
                className="w-full bg-[hsl(220,30%,9%)] text-white text-[12px] font-mono px-3 py-2 border-t border-white/10 focus:outline-none resize-y"
              />
            </details>
            <div className="flex items-center gap-2 p-3 border-t border-white/10 bg-[hsl(220,40%,10%)]">
              <button
                type="button"
                onClick={handleCopyWhatsAppText}
                className="flex-1 h-11 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Copy className="h-4 w-4" /> Copiar
              </button>
              <button
                type="button"
                onClick={handleConfirmShareWhatsApp}
                className="flex-[1.4] h-11 rounded-xl text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-lg"
                style={{ background: "hsla(142, 70%, 38%, 1)" }}
              >
                <Share2 className="h-4 w-4" /> Compartilhar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </GestorThemeShell>
  );
}
