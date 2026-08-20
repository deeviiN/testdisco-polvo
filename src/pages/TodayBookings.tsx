import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Bell, Clock, CalendarDays, MapPin, User,
  Monitor, Trophy, TreePine, BookOpen, FlaskConical, Users, Lightbulb, LayoutGrid,
  BookMarked, Tag, FileText, UserCheck, Package, Hourglass, Hash,
  Share2, Download, Copy, X, Tv, Volume2, Mic, Laptop, Laptop2,
  Radio, UserX, CheckCircle2, CircleDashed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSectorLabels } from "@/hooks/useSectorLabels";
import { useSectorPreferences } from "@/hooks/useSectorPreferences";
import { toast } from "@/hooks/use-toast";
import GestorThemeShell, { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";

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

const RESOURCE_EMOJIS: Record<string, string> = {
  data_show: "📽️",
  tv: "📺",
  caixa_som: "🔊",
  microfone: "🎤",
  notebook_escola: "💻",
  notebook_professor: "💻",
};

const formatResource = (r: string) =>
  `${RESOURCE_EMOJIS[r] || "📦"} ${RESOURCE_LABELS[r] || r}`;

interface BookingRow {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  sector: string;
  status: string;
  topic: string | null;
  description: string | null;
  discipline: string | null;
  event_type: string;
  user_id: string;
  visitor_name: string | null;
  visitor_info: string | null;
  resources: string[] | null;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  full_name: string;
}

export default function TodayBookings() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { getLabel } = useSectorLabels();
  const { color, glowEnabled } = useSectorPreferences();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [usages, setUsages] = useState<Record<string, { started_at: string | null; ended_at: string | null }>>({});
  const [schoolName, setSchoolName] = useState<string>("");
  const [checkinTolerance, setCheckinTolerance] = useState<number>(15);
  const [exporting, setExporting] = useState(false);
  const [claimTarget, setClaimTarget] = useState<BookingRow | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [waPreviewOpen, setWaPreviewOpen] = useState(false);
  const [waPreviewText, setWaPreviewText] = useState("");
  const waOpenerRef = useRef<HTMLButtonElement | null>(null);
  const waDialogRef = useRef<HTMLDivElement | null>(null);
  const waTitleId = "wa-preview-title";
  const waDescId = "wa-preview-desc";

  // Tick a cada 5s para atualizar status (aguardando/ausente/em curso/finalizado) ao vivo
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const todayISO = format(new Date(nowTick), "yyyy-MM-dd");
  const nowMinutes = (() => {
    const d = new Date(nowTick);
    return d.getHours() * 60 + d.getMinutes();
  })();

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Trava o scroll do body enquanto esta tela está montada — só a lista interna desliza
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    if (!profile?.school_id) return;
    let cancelled = false;
    let firstLoad = true;
    const load = async () => {
      if (firstLoad) setLoading(true);
      const { data: bs } = await supabase
        .from("bookings")
        .select("id, booking_date, start_time, end_time, sector, status, topic, description, discipline, event_type, user_id, visitor_name, visitor_info, resources, created_at")
        .eq("school_id", profile.school_id)
        .eq("booking_date", todayStr)
        .eq("status", "confirmed")
        .order("start_time", { ascending: true });

      if (cancelled) return;
      const list = (bs ?? []) as BookingRow[];
      setBookings(list);

      const ids = Array.from(new Set(list.map((b) => b.user_id)));
      if (ids.length > 0) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        if (!cancelled) {
          const map: Record<string, string> = {};
          (ps as ProfileRow[] | null)?.forEach((p) => { map[p.user_id] = p.full_name; });
          setProfiles(map);
        }
      }
      const bIds = list.map((b) => b.id);
      if (bIds.length > 0) {
        const { data: us } = await supabase
          .from("booking_usage")
          .select("booking_id, started_at, ended_at")
          .in("booking_id", bIds);
        if (!cancelled) {
          const umap: Record<string, { started_at: string | null; ended_at: string | null }> = {};
          (us as any[] | null)?.forEach((u) => { umap[u.booking_id] = { started_at: u.started_at, ended_at: u.ended_at }; });
          setUsages(umap);
        }
      } else if (!cancelled) {
        setUsages({});
      }
      if (firstLoad) setLoading(false);
      firstLoad = false;
    };
    load();
    // refetch a cada 30s para refletir novos agendamentos/cancelamentos
    const refetchId = setInterval(load, 30000);
    // refetch ao voltar para a aba
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    // realtime: refletir check-in/check-out imediatamente
    const ch = supabase
      .channel(`today_bookings_usage_${profile.school_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_usage", filter: `school_id=eq.${profile.school_id}` }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      clearInterval(refetchId);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [profile?.school_id, todayStr]);


  // Carrega nome da escola para usar nos exports
  useEffect(() => {
    if (!profile?.school_id) return;
    let cancelled = false;
    supabase.from("schools").select("name").eq("id", profile.school_id).maybeSingle().then(({ data }) => {
      if (!cancelled && data?.name) setSchoolName(data.name);
    });
    supabase
      .from("school_discipline_settings")
      .select("checkin_tolerance_minutes")
      .eq("school_id", profile.school_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.checkin_tolerance_minutes != null) {
          setCheckinTolerance(data.checkin_tolerance_minutes);
        }
      });
    return () => { cancelled = true; };
  }, [profile?.school_id]);

  // Focus-trap, Esc to close, restore focus on close (modal WhatsApp)
  useEffect(() => {
    if (!waPreviewOpen) return;
    const dialog = waDialogRef.current;
    if (!dialog) return;

    const opener = waOpenerRef.current;

    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("inert") && el.offsetParent !== null);

    // Move foco inicial para o primeiro elemento focável
    const first = getFocusable()[0];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setWaPreviewOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === firstEl || !dialog.contains(active)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (active === lastEl || !dialog.contains(active)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Retorna foco ao botão que abriu o modal (após o React desmontar o overlay)
      const restore = () => {
        if (opener && document.contains(opener)) {
          opener.focus({ preventScroll: true });
        }
      };
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(restore);
      } else {
        setTimeout(restore, 0);
      }
    };
  }, [waPreviewOpen]);

  // ============ Helpers de export (WhatsApp + PDF) ============
  const buildEventTypeLabel = (t: string) => {
    const map: Record<string, string> = {
      aula: "Aula",
      palestra: "Palestra",
      evento_escolar: "Evento Escolar",
      evento_externo: "Evento Externo",
      reuniao: "Reunião",
    };
    return map[t] || t;
  };

  const buildWhatsAppText = () => {
    const dateLabel = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const dateCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    const divider = "━━━━━━━━━━━━━━━";

    const header =
      `📅 *AGENDAMENTOS DE HOJE*\n` +
      `${dateCap}\n` +
      (schoolName ? `🏫 ${schoolName}\n` : "") +
      `📊 Total: *${bookings.length}* agendamento(s)\n` +
      `${divider}`;

    if (bookings.length === 0) {
      return `${header}\n\n_Nenhum agendamento confirmado para hoje._`;
    }

    // Ordenar por horário de início (e fim como desempate)
    const sorted = [...bookings].sort((a, b) => {
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      return a.end_time.localeCompare(b.end_time);
    });

    const blocks = sorted.map((b, idx) => {
      const name = profiles[b.user_id] || b.visitor_name || "—";
      const sector = getLabel(b.sector);
      const evt = buildEventTypeLabel(b.event_type);
      const topic = b.topic || b.description || "Sem assunto";
      const createdAt = format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

      const lines: string[] = [];
      lines.push(`*${idx + 1}.* ⏰ *${b.start_time.slice(0, 5)} – ${b.end_time.slice(0, 5)}*`);
      lines.push(`📍 Setor: ${sector}`);
      lines.push(`🏷️ Tipo: ${evt}`);
      lines.push(`📝 Assunto: ${topic}`);
      if (b.discipline) lines.push(`📚 Disciplina: ${b.discipline}`);
      lines.push(`👤 Responsável: ${name}`);
      if (b.visitor_name && b.visitor_name !== name) lines.push(`🧑‍💼 Visitante: ${b.visitor_name}`);
      if (b.resources && b.resources.length > 0) lines.push(`🎒 Recursos: ${b.resources.map(formatResource).join(", ")}`);
      lines.push(`🗓️ _Agendado em ${createdAt}_`);
      return lines.join("\n");
    });

    const footer = `\n${divider}\n_Agendamento de Ambiente Escolar_`;

    return `${header}\n\n${blocks.join(`\n\n${divider}\n\n`)}${footer}`;
  };

  const handleOpenWhatsAppPreview = () => {
    if (bookings.length === 0) {
      toast({ title: "Nenhum agendamento para hoje", description: "Não há nada para compartilhar." });
      return;
    }
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
      toast({ title: "Mensagem copiada", description: "Cole onde quiser." });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const handleClaim = async () => {
    if (!claimTarget || claiming) return;
    setClaiming(true);
    const { error } = await supabase.rpc("claim_absent_booking", { _booking_id: claimTarget.id });
    setClaiming(false);
    if (error) {
      const msg = error.message || "";
      const map: Record<string, string> = {
        within_tolerance: "Ainda dentro do período de tolerância (15 min).",
        already_started: "Outro usuário já iniciou o uso.",
        booking_ended: "O horário já terminou.",
        not_today: "Agendamento não é de hoje.",
        cannot_claim_own: "Você não pode assumir seu próprio agendamento.",
        wrong_school: "Escola incorreta.",
        not_approved: "Seu cadastro ainda não está aprovado.",
        booking_not_active: "Este agendamento não está mais ativo.",
      };
      toast({ title: map[msg] || "Não foi possível assumir o horário", variant: "destructive" });
      return;
    }
    toast({ title: "Horário assumido!", description: "Vá ao ambiente e escaneie o QR para iniciar." });
    setClaimTarget(null);
    // dispara reload imediato
    setNowTick(Date.now());
  };

  const handleGeneratePDF = async (action: "download" | "share") => {
    if (exporting) return;
    if (bookings.length === 0) {
      toast({ title: "Nenhum agendamento para hoje", description: "Não há nada para gerar em PDF." });
      return;
    }
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Cabeçalho roxo (mesmo padrão do BookingReport)
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, pageWidth, 45, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Agendamentos de Hoje", pageWidth / 2, 16, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      if (schoolName) doc.text(schoolName, pageWidth / 2, 25, { align: "center" });
      doc.setFontSize(8);
      const todayLabelPdf = format(new Date(), "EEEE, dd/MM/yyyy", { locale: ptBR });
      doc.text(
        `${todayLabelPdf.charAt(0).toUpperCase() + todayLabelPdf.slice(1)} | Gerado em: ${format(new Date(), "HH:mm", { locale: ptBR })} | Total: ${bookings.length}`,
        pageWidth / 2, 33, { align: "center" }
      );
      doc.setTextColor(0, 0, 0);

      const rows = bookings.map((b) => {
        const name = profiles[b.user_id] || b.visitor_name || "—";
        const sector = getLabel(b.sector);
        const evt = buildEventTypeLabel(b.event_type);
        const detail = [b.topic, b.description].filter(Boolean).join(" — ") || "-";
        const extras = [
          b.discipline ? `Disc.: ${b.discipline}` : null,
          b.visitor_name ? `Visit.: ${b.visitor_name}` : null,
          (b.resources && b.resources.length) ? `Recursos: ${b.resources.map(formatResource).join(", ")}` : null,
        ].filter(Boolean).join("\n");
        const createdAt = format(new Date(b.created_at), "dd/MM/yy\nHH:mm", { locale: ptBR });
        return [
          `${b.start_time.slice(0, 5)}\n${b.end_time.slice(0, 5)}`,
          sector,
          evt,
          name,
          extras ? `${detail}\n${extras}` : detail,
          createdAt,
        ];
      });

      autoTable(doc, {
        startY: 50,
        head: [["Horário", "Setor", "Tipo", "Responsável", "Assunto / Detalhes", "Agendado em"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [243, 244, 255] },
        columnStyles: {
          0: { cellWidth: 16, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 26 },
          2: { cellWidth: 24 },
          3: { cellWidth: 34 },
          5: { cellWidth: 20, halign: "center", fontSize: 7, textColor: [90, 90, 90] },
        },
        margin: { left: 8, right: 8 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.text(`Agendamento Escolar${schoolName ? ` — ${schoolName}` : ""}`, 14, pageHeight - 8);
          doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 8, { align: "right" });
          doc.setTextColor(0, 0, 0);
        },
      });

      const fileName = `agendamentos-hoje-${format(new Date(), "yyyy-MM-dd")}.pdf`;

      if (action === "download") {
        doc.save(fileName);
      } else {
        const blob = doc.output("blob");
        const file = new File([blob], fileName, { type: "application/pdf" });
        if (typeof navigator.share === "function" && (navigator as any).canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Agendamentos de Hoje", text: schoolName });
          } catch { /* cancelado */ }
        } else {
          doc.save(fileName);
          toast({ title: "PDF baixado", description: "Compartilhamento direto não suportado neste dispositivo." });
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const todayLabel = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Filtro por setor — mostra TODOS os setores da escola, no mesmo modelo da /sectors
  const ALL_SECTORS: { key: string; icon: LucideIcon }[] = [
    { key: "informatica", icon: Monitor },
    { key: "quadra", icon: Trophy },
    { key: "patio", icon: TreePine },
    { key: "biblioteca", icon: BookOpen },
    { key: "lab_ciencias", icon: FlaskConical },
    { key: "sala_professores", icon: Users },
    { key: "projeto_vida", icon: Lightbulb },
  ];
  const DEFAULT_SECTOR_LABELS: Record<string, string> = {
    biblioteca: "Biblioteca",
    lab_ciencias: "Lab. de Ciências",
    sala_professores: "Sala dos Professores",
  };
  const sectorLabelFor = (key: string) => {
    const l = getLabel(key);
    return l === key ? (DEFAULT_SECTOR_LABELS[key] || key) : l;
  };
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const sectorCounts: Record<string, number> = bookings.reduce((acc, b) => {
    acc[b.sector] = (acc[b.sector] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sectorOptions: { key: string; label: string; count: number; icon: LucideIcon }[] = [
    { key: "all", label: "Todos", count: bookings.length, icon: LayoutGrid },
    ...ALL_SECTORS.map((s) => ({ key: s.key, label: sectorLabelFor(s.key), count: sectorCounts[s.key] ?? 0, icon: s.icon })),
  ];
  const filteredBookings = sectorFilter === "all" ? bookings : bookings.filter((b) => b.sector === sectorFilter);

  // Reaproveita as helpers de cor da tela /sectors
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

  return (
    <GestorThemeShell enabled>
    <div className="relative flex flex-col h-[100dvh] max-h-[100dvh] select-none overflow-hidden overscroll-none">

      {/* Header padrão */}
      <div className="relative z-10 shrink-0 max-w-4xl w-full mx-auto px-1 sm:px-3 pt-16 pb-2">
        <GestorPremiumHeader
          title={schoolName || "Agendamentos de Hoje"}
          subtitle={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
          
          right={
            <div className="flex items-center gap-2">
              <button
                ref={waOpenerRef}
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
                onClick={() => handleGeneratePDF((typeof navigator.share === "function") ? "share" : "download")}
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

      {/* Filtro por setor — mini-cards estilo /sectors (igual /quadra) */}
      <div className="relative z-10 shrink-0 px-1 pb-2">
        <div className="grid grid-cols-4 gap-1.5">
          {sectorOptions.map((opt) => {
            const active = sectorFilter === opt.key;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSectorFilter(opt.key)}
                className="relative flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-white text-[9px] font-bold uppercase tracking-wider hover:brightness-125 active:scale-95 overflow-hidden transition-all"
                style={{
                  background: glowEnabled ? cardGradient(active) : cardSolid(active),
                  borderRadius: 12,
                  minHeight: 56,
                  opacity: 1,
                  border: active
                    ? `2px solid hsla(${color.hueA}, 95%, 78%, 0.95)`
                    : `1px solid hsla(${color.hueA}, 60%, 55%, 0.4)`,
                  boxShadow: active
                    ? `0 0 0 3px hsla(${color.hueA}, 100%, 80%, 0.85), 0 0 28px hsla(${color.hueA}, 100%, 65%, 0.95), 0 0 56px hsla(${color.hueA}, 95%, 60%, 0.7), inset 0 1px 6px hsla(0, 0%, 100%, 0.55)`
                    : (glowEnabled
                        ? `inset 0 1px 3px hsla(${color.hueA}, 90%, 75%, 0.25), 0 4px 10px hsla(${color.hueC}, 80%, 5%, 0.5)`
                        : "0 2px 6px hsla(220, 80%, 5%, 0.4)"),
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
                <span
                  className={`absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black flex items-center justify-center bg-white text-[hsl(220,60%,12%)] border border-white/95 shadow-sm z-10 ${
                    opt.count > 0 && opt.key !== "all" ? "pulse-green-white" : ""
                  }`}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>




      {/* List */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/50 text-sm">Carregando...</div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-full bg-white/8 border border-white/15 flex items-center justify-center mb-4">
              <CalendarDays className="h-7 w-7 text-white/60" />
            </div>
            <p className="text-white font-semibold text-base">Nenhum agendamento para hoje</p>
            <p className="text-white/50 text-xs mt-1">Quando houver reservas confirmadas para o dia atual, elas aparecerão aqui.</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-full bg-white/8 border border-white/15 flex items-center justify-center mb-4">
              <MapPin className="h-7 w-7 text-white/60" />
            </div>
            <p className="text-white font-semibold text-base">Nenhum agendamento para este setor</p>
            <p className="text-white/50 text-xs mt-1">Selecione "Todos" ou outro setor para ver mais reservas.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredBookings.map((b, idx) => {
              const name = profiles[b.user_id] || b.visitor_name || "—";
              const sectorLabel = getLabel(b.sector);
              const zebra = idx % 2 === 0 ? "bg-white/[0.06]" : "bg-white/[0.03]";

              // Tipo de evento legível
              const eventTypeMap: Record<string, { label: string; tone: string }> = {
                aula: { label: "Aula", tone: "bg-sky-500/20 text-sky-200 border-sky-400/30" },
                palestra: { label: "Palestra", tone: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/30" },
                evento_escolar: { label: "Evento Escolar", tone: "bg-violet-500/20 text-violet-200 border-violet-400/30" },
                evento_externo: { label: "Evento Externo", tone: "bg-amber-500/20 text-amber-200 border-amber-400/30" },
                reuniao: { label: "Reunião", tone: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30" },
              };
              const evt = eventTypeMap[b.event_type] || { label: b.event_type, tone: "bg-white/15 text-white/80 border-white/20" };

              // Duração em minutos
              const [sh, sm] = b.start_time.split(":").map(Number);
              const [eh, em] = b.end_time.split(":").map(Number);
              const durMin = (eh * 60 + em) - (sh * 60 + sm);
              const durLabel = durMin >= 60
                ? `${Math.floor(durMin / 60)}h${durMin % 60 ? ` ${durMin % 60}min` : ""}`
                : `${durMin}min`;

              const hasVisitor = !!(b.visitor_name || b.visitor_info);
              const hasResources = Array.isArray(b.resources) && b.resources.length > 0;
              const hasDescription = !!b.description && b.description !== b.topic;

              const startMinB = sh * 60 + sm;
              const endMinB = eh * 60 + em;
              const isLive = b.booking_date === todayISO && nowMinutes >= startMinB && nowMinutes < endMinB;
              const isPast = b.booking_date === todayISO && nowMinutes >= endMinB;

              const u = usages[b.id];
              const hasCheckIn = !!u?.started_at;
              const hasCheckOut = !!u?.ended_at;
              // Tolerância configurável pelo gestor (school_discipline_settings)
              const TOL = checkinTolerance;
              const minutesLate = nowMinutes - startMinB;
              const isToday = b.booking_date === todayISO;
              let presence: "in_use" | "overdue" | "ended" | "absent" | "late" | "waiting" = "waiting";
              if (hasCheckOut) presence = "ended";
              else if (hasCheckIn) presence = isPast ? "overdue" : "in_use";
              else if (isToday && nowMinutes >= startMinB && minutesLate < TOL && !isPast) presence = "late";
              else if (isToday && nowMinutes >= startMinB + TOL && !isPast) presence = "absent";
              else if (isPast && !hasCheckIn) presence = "absent";
              const presenceMeta = presence === "in_use"
                ? { label: "PRESENTE", cls: "bg-blue-500 text-white", Icon: Radio, pulse: true }
                : presence === "overdue"
                  ? { label: "ENCERRADO", cls: "bg-orange-600 text-white", Icon: CheckCircle2, pulse: false }
                : presence === "ended"
                  ? { label: "FINALIZADO", cls: "bg-slate-500 text-white", Icon: CheckCircle2, pulse: false }
                  : presence === "absent"
                    ? { label: "AUSENTE", cls: "bg-red-600 text-white", Icon: UserX, pulse: true }
                    : presence === "late"
                      ? { label: `ATRASADO +${Math.max(0, minutesLate)}min`, cls: "bg-amber-500 text-amber-950", Icon: Hourglass, pulse: true }
                      : { label: "AGUARDANDO", cls: "bg-amber-500 text-amber-950", Icon: CircleDashed, pulse: false };
              const PresenceIcon = presenceMeta.Icon;

              const isOwner = b.user_id === profile?.user_id;
              const canClaim = presence === "absent" && !isOwner && !hasCheckIn && !isPast && isToday;
              const ownerWasAbsent = presence === "absent" && isOwner;

              const borderByPresence =
                presence === "absent" ? "border-red-500 ring-1 ring-red-500/55"
                : presence === "late" ? "border-amber-400 ring-1 ring-amber-400/55"
                : presence === "in_use" ? "border-emerald-400 ring-1 ring-emerald-400/55"
                : presence === "overdue" ? "border-orange-400 ring-1 ring-orange-400/45"
                : presence === "ended" ? "border-slate-400/70 ring-1 ring-slate-400/25"
                : "border-amber-400/80 ring-1 ring-amber-400/25";

              return (
                <li key={b.id} className={`rounded-xl border-2 ${borderByPresence} ${zebra} pl-1.5 pr-3 py-3`}>

                  <div className="flex items-start gap-2">
                    <div className="shrink-0 w-[84px] self-stretch flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 px-1 py-3">
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-white text-xl font-black uppercase tracking-wider leading-none mb-1">
                          {format(new Date(b.booking_date + "T00:00:00"), "EEEEEE", { locale: ptBR }).replace(".", "").toUpperCase()}
                        </span>
                        <span className="text-white text-lg font-black leading-none tabular-nums">
                          {format(new Date(b.booking_date + "T00:00:00"), "dd/MM", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="w-9 h-px bg-white/15" />
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-white text-lg font-extrabold leading-none tabular-nums">{b.start_time.slice(0, 5)}</span>
                        <span className="text-white/70 text-[11px] font-bold leading-none my-0.5">às</span>
                        <span className="text-white text-lg font-extrabold leading-none tabular-nums">{b.end_time.slice(0, 5)}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-white/80 mt-0.5">
                        <Hourglass className="h-3 w-3" />{durLabel}
                      </span>
                      {(() => {
                        if (!isToday) return null;
                        const startMs = new Date(b.booking_date + "T" + b.start_time).getTime();
                        const endMs = new Date(b.booking_date + "T" + b.end_time).getTime();
                        const ref = hasCheckOut && u?.ended_at ? new Date(u.ended_at).getTime() : nowTick;
                        const cap = Math.min(ref, endMs);
                        const elapsed = Math.max(0, Math.floor((cap - startMs) / 1000));
                        if (cap < startMs) return null;
                        const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
                        const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
                        const ss = String(elapsed % 60).padStart(2, "0");
                        const tone = presence === "in_use" ? "text-green-400 drop-shadow-[0_0_4px_rgba(34,197,94,0.6)]" : presence === "absent" ? "text-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.6)]" : presence === "ended" ? "text-white/50" : "text-amber-200";
                        return (
                          <span className={`text-[14px] font-extrabold tabular-nums leading-none mt-0.5 ${tone}`}>
                            {hh}:{mm}:{ss}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Linha 1: Tipo + Setor + presença */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span
                          aria-label={isLive ? "Acontecendo agora" : isPast ? "Encerrado" : "Agendado"}
                          title={isLive ? "Acontecendo agora" : isPast ? "Encerrado" : "Agendado para hoje"}
                          className={`relative inline-flex h-2.5 w-2.5 rounded-full shrink-0 ${isLive ? "bg-rose-500" : isPast ? "bg-white/30" : "bg-emerald-500"}`}
                        >
                          {isLive && <span className="absolute inset-0 rounded-full animate-ping bg-rose-500/70" />}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-bold uppercase tracking-wide ${evt.tone}`}>
                          <Tag className="h-2.5 w-2.5" />{evt.label}
                        </span>
                        <span className={`${isPast ? "" : "pulse-green-white-tag"} inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-semibold ${isPast ? "border-white/15 bg-white/5 text-white/70" : ""}`}>
                          <MapPin className="h-2.5 w-2.5" />{sectorLabel}
                        </span>
                        {b.booking_date === todayISO && (
                          <span
                            title={presence === "in_use" ? "Professor fez check-in via QR Code" : presence === "absent" ? "Sem check-in no horário previsto" : presence === "ended" ? "Uso finalizado" : "Ainda não começou"}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${presenceMeta.cls} ${presenceMeta.pulse ? "animate-pulse" : ""}`}
                          >
                            <PresenceIcon className="h-2.5 w-2.5" />{presenceMeta.label}
                          </span>
                        )}
                      </div>

                      {/* Sala liberada por tolerância de check-in vencida */}
                      {presence === "absent" && isToday && !isPast && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 text-[11px] font-bold uppercase tracking-wide">
                          <Radio className="h-3 w-3" />
                          Sala liberada — disponível (tolerância de {TOL} min vencida)
                        </div>
                      )}

                      {/* Assunto / tema */}
                      <p className="text-white font-bold text-sm break-words leading-snug">
                        {b.topic || b.description || "Sem assunto"}
                      </p>

                      {/* Descrição extra */}
                      {hasDescription && (
                        <p className="mt-1 text-white/65 text-[11px] break-words flex items-start gap-1">
                          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{b.description}</span>
                        </p>
                      )}

                      {/* Responsável */}
                      {/* Responsável — nome do professor/responsável em destaque */}
                      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-white">
                        <User className="h-4 w-4 shrink-0" />
                        <span className="break-words font-extrabold leading-snug">{name}</span>
                      </div>


                      {/* Disciplina */}
                      {b.discipline && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/65">
                          <BookMarked className="h-3 w-3 shrink-0" />
                          <span className="break-words">{b.discipline}</span>
                        </div>
                      )}

                      {/* Visitante */}
                      {hasVisitor && (
                        <div className="mt-0.5 flex items-start gap-1 text-[11px] text-white/65">
                          <UserCheck className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="break-words">
                            {b.visitor_name && <span className="font-semibold text-white/80">{b.visitor_name}</span>}
                            {b.visitor_name && b.visitor_info && " — "}
                            {b.visitor_info}
                          </span>
                        </div>
                      )}

                      {/* Comunicado (somente Gestor/Coord/Supervisor) */}
                      {(profile?.role === "gestor_pedagogico" ||
                        profile?.role === "coord_pedagogico" ||
                        profile?.role === "supervisor") && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/booking/quadra/lista?setor=${encodeURIComponent(b.sector)}&comunicado=${b.id}`)
                          }
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-[11px] font-bold uppercase tracking-wide transition-all"
                        >
                          <FileText className="h-3 w-3" />
                          Gerar Comunicado
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Barra de progresso / contagem regressiva (apenas hoje) */}
                  {b.booking_date === todayISO && (() => {
                    const isUpcoming = nowMinutes < startMinB;
                    const isFinished = nowMinutes >= endMinB;

                    const fmtDelta = (mins: number) => {
                      const m = Math.max(0, Math.round(mins));
                      const h = Math.floor(m / 60);
                      const r = m % 60;
                      if (h > 0 && r > 0) return `${h}h ${r}min`;
                      if (h > 0) return `${h}h`;
                      return `${r}min`;
                    };

                    // Minuto do check-in dentro da janela do agendamento (se houver)
                    let checkInMin: number | null = null;
                    if (u?.started_at) {
                      const d = new Date(u.started_at);
                      const localISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      const sameDay = localISO === b.booking_date;
                      if (sameDay) {
                        const m = d.getHours() * 60 + d.getMinutes();
                        checkInMin = Math.max(startMinB, Math.min(endMinB, m));
                      }
                    }

                    if (isUpcoming) {
                      const total = Math.max(1, startMinB);
                      const elapsed = Math.max(0, nowMinutes);
                      const pct = Math.round(Math.min(1, elapsed / total) * 100);
                      const label = `Faltam ${fmtDelta(startMinB - nowMinutes)} para começar`;
                      return (
                        <div className="mt-2.5 w-full">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[11px] uppercase tracking-wider font-bold text-amber-200 flex items-center gap-1">
                              <span aria-hidden>⏳</span>{label}
                            </p>
                            <span className="text-[10px] font-mono font-bold text-amber-200 tabular-nums">{pct}%</span>
                          </div>
                          <div className="relative h-2 w-full rounded-full overflow-hidden bg-white/10 border border-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
                            <div className="h-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
                            {pct > 2 && (
                              <span className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white border border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" style={{ left: `calc(${pct}% - 6px)` }} aria-hidden />
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Em andamento ou encerrado: pinta vermelho enquanto ausente, verde após check-in
                    const total = Math.max(1, endMinB - startMinB);
                    const cursorMin = isFinished ? endMinB : nowMinutes;
                    const elapsedPct = Math.round(Math.min(1, Math.max(0, cursorMin - startMinB) / total) * 100);
                    const greenStartMin = checkInMin ?? cursorMin; // se não há check-in, sem verde
                    const redPct = Math.round(Math.min(1, Math.max(0, greenStartMin - startMinB) / total) * 100);
                    const greenPct = Math.max(0, elapsedPct - redPct);

                    return (
                      <div className="mt-2.5 w-full">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          {/* Semáforo: vermelho = ausente, verde = presente (c/ atraso quando houver vermelho) */}
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1 text-rose-200">
                              <span className={`h-2 w-2 rounded-full bg-red-500 ${redPct > 0 ? "shadow-[0_0_6px_rgba(239,68,68,0.85)]" : "opacity-40"}`} aria-hidden />
                              Ausente
                            </span>
                            <span className="inline-flex items-center gap-1 text-emerald-200">
                              <span className={`h-2 w-2 rounded-full bg-emerald-400 ${greenPct > 0 ? "shadow-[0_0_6px_rgba(34,197,94,0.85)]" : "opacity-40"}`} aria-hidden />
                              Presente
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-white/80 tabular-nums">
                            {redPct}% / {greenPct}%
                          </span>
                        </div>
                        <div className="relative flex h-2 w-full rounded-full overflow-hidden bg-white/10 border border-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={elapsedPct} aria-label={`Ausente ${redPct}%, presente ${greenPct}%`}>
                          {redPct > 0 && (
                            <div
                              className={`h-full bg-gradient-to-r from-red-500 via-red-500 to-rose-600 transition-[width] duration-1000 ease-linear ${isLive && checkInMin === null ? "shadow-[0_0_12px_rgba(239,68,68,0.85)]" : "shadow-[0_0_6px_rgba(239,68,68,0.45)]"}`}
                              style={{ width: `${redPct}%` }}
                            />
                          )}
                          {greenPct > 0 && (
                            <div
                              className={`h-full bg-gradient-to-r from-emerald-400 via-emerald-400 to-green-500 transition-[width] duration-1000 ease-linear ${isLive ? "shadow-[0_0_12px_rgba(34,197,94,0.8)]" : "shadow-[0_0_6px_rgba(34,197,94,0.45)]"}`}
                              style={{ width: `${greenPct}%` }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Botão para assumir horário do professor ausente */}
                  {canClaim && (
                    <button
                      type="button"
                      onClick={() => setClaimTarget(b)}
                      className="mt-2.5 w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-[0.99] text-white font-extrabold text-sm uppercase tracking-wide shadow-lg flex items-center justify-center gap-2"
                    >
                      <UserCheck className="h-4 w-4" />
                      Assumir este horário
                    </button>
                  )}
                  {ownerWasAbsent && !isPast && (
                    <div className="mt-2.5 rounded-xl border border-red-400/50 bg-red-500/10 text-red-100 px-3 py-2 text-[12px] font-semibold flex items-center gap-2">
                      <UserX className="h-4 w-4 shrink-0" />
                      Você ainda não chegou — enquanto o horário não encerra, outros usuários podem assumi-lo.
                    </div>
                  )}
                  {ownerWasAbsent && isPast && (
                    <div className="mt-2.5 rounded-xl border border-white/15 bg-white/5 text-white/70 px-3 py-2 text-[12px] font-semibold flex items-center gap-2">
                      <UserX className="h-4 w-4 shrink-0" />
                      Horário encerrado sem check-in. Registrado como ausência.
                    </div>
                  )}



                  {/* Recursos utilizados — largura total do card */}
                  {hasResources && (
                    <div className="mt-2.5 w-full">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-white/55 mb-1 flex items-center gap-1">
                        <Monitor className="h-2.5 w-2.5" /> Recursos utilizados
                      </p>
                      <div className="flex flex-wrap items-stretch gap-1.5 w-full">
                        {b.resources!.map((r) => {
                          const Ico = RESOURCE_ICONS[r] || Monitor;
                          return (
                            <span
                              key={r}
                              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-white/10 border border-white/15 text-[11px] font-bold uppercase tracking-wide text-white/90"
                            >
                              <Ico className="h-3 w-3" />
                              {RESOURCE_LABELS[r] || r}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Legenda: data do agendamento (criação) + ID curto — por último */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/45 font-mono">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-2.5 w-2.5" />
                      Agendado em {format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    <span className="inline-flex items-center gap-1 text-white/35">
                      <Hash className="h-2.5 w-2.5" />{b.id.slice(0, 8)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal de pré-visualização da mensagem do WhatsApp */}
      {waPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3"
          onClick={() => setWaPreviewOpen(false)}
        >
          <div
            ref={waDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={waTitleId}
            aria-describedby={waDescId}
            className="relative w-full max-w-md bg-[hsl(220,40%,12%)] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "hsla(142, 70%, 38%, 0.85)" }}>
                <Share2 className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p id={waTitleId} className="text-white font-bold text-sm leading-tight">Pré-visualizar mensagem</p>
                <p id={waDescId} className="text-white/55 text-[11px] leading-tight">Confira antes de compartilhar no WhatsApp</p>
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

            {/* Conteúdo (visual estilo bolha de chat) */}
            <div className="flex-1 overflow-y-auto p-3" style={{ background: "hsl(220, 30%, 9%)" }}>
              <div className="ml-auto max-w-full bg-[hsl(142,40%,22%)] text-white rounded-2xl rounded-tr-sm px-3 py-2 text-[13px] whitespace-pre-wrap break-words font-sans leading-relaxed shadow-md">
                {waPreviewText}
              </div>
            </div>

            {/* Editor opcional para o usuário ajustar */}
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

            {/* Ações */}
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

      {/* Modal: Assumir horário do professor ausente */}
      {claimTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !claiming && setClaimTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md bg-[hsl(220,40%,12%)] border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-amber-400" />
              <p className="text-white font-bold text-base">Assumir este horário?</p>
            </div>
            <div className="px-5 py-4 space-y-2 text-white/85 text-sm">
              <p>
                Você assumirá o uso de <strong>{getLabel(claimTarget.sector)}</strong> das{" "}
                <strong className="tabular-nums">{claimTarget.start_time.slice(0, 5)}</strong> às{" "}
                <strong className="tabular-nums">{claimTarget.end_time.slice(0, 5)}</strong>.
              </p>
              <p className="text-white/70 text-[12px]">
                O agendamento de <strong>{profiles[claimTarget.user_id] || "—"}</strong> será marcado como ausência.
                Em seguida, vá ao ambiente e <strong>escaneie o QR Code</strong> para iniciar o uso.
              </p>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-white/10 bg-[hsl(220,40%,10%)]">
              <button
                type="button"
                disabled={claiming}
                onClick={() => setClaimTarget(null)}
                className="flex-1 h-12 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={claiming}
                onClick={handleClaim}
                className="flex-[1.4] h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-extrabold uppercase tracking-wide shadow-lg disabled:opacity-50"
              >
                {claiming ? "Assumindo..." : "Confirmar e assumir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </GestorThemeShell>
  );
}
