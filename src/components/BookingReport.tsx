import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, Download, Printer, Share2, Users, Trophy,
  Clock, BarChart3, Monitor, Tv, Volume2, Mic, Laptop, Laptop2,
  ChevronDown, ChevronUp, X, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Tables } from "@/integrations/supabase/types";
import BookingGestorHistory from "@/components/BookingGestorHistory";

type Booking = Tables<"bookings"> & { profiles?: { full_name: string } | null };

const RESOURCES = [
  { id: "data_show", label: "Data Show", icon: Monitor },
  { id: "tv", label: "TV", icon: Tv },
  { id: "caixa_som", label: "Caixa de Som", icon: Volume2 },
  { id: "microfone", label: "Microfone", icon: Mic },
  { id: "notebook_escola", label: "Notebook da Escola", icon: Laptop },
  { id: "notebook_professor", label: "Notebook do Professor", icon: Laptop2 },
];

const EVENT_TYPES = [
  { id: "aula", label: "Aula" },
  { id: "palestra", label: "Palestra" },
  { id: "reuniao", label: "Reunião" },
  { id: "evento_externo", label: "Evento Externo" },
];

const ALL_TEMPO_SLOTS = [
  { start: "07:20", end: "08:20", label: "1º Tempo", turno: "Manhã" },
  { start: "08:20", end: "09:20", label: "2º Tempo", turno: "Manhã" },
  { start: "09:45", end: "10:45", label: "3º Tempo", turno: "Manhã" },
  { start: "10:45", end: "11:45", label: "4º Tempo", turno: "Manhã" },
  { start: "11:45", end: "12:45", label: "5º Tempo", turno: "Manhã" },
  { start: "13:20", end: "14:20", label: "1º Tempo", turno: "Tarde" },
  { start: "14:20", end: "15:20", label: "2º Tempo", turno: "Tarde" },
  { start: "15:45", end: "16:45", label: "3º Tempo", turno: "Tarde" },
  { start: "16:45", end: "17:45", label: "4º Tempo", turno: "Tarde" },
  { start: "17:45", end: "18:45", label: "5º Tempo", turno: "Tarde" },
  { start: "18:45", end: "19:40", label: "1º Tempo", turno: "Noite" },
  { start: "19:40", end: "20:35", label: "2º Tempo", turno: "Noite" },
  { start: "20:45", end: "21:40", label: "3º Tempo", turno: "Noite" },
  { start: "21:40", end: "22:35", label: "4º Tempo", turno: "Noite" },
];

const getTempoDetails = (startTime: string, endTime: string): string => {
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  const matchedSlots = ALL_TEMPO_SLOTS.filter(
    (s) => s.start >= start && s.start <= end
  );
  if (matchedSlots.length === 0) return `${start} às ${end}`;
  return matchedSlots
    .map((s) => `${s.label} ${s.start} a ${s.end}`)
    .join(" | ");
};

const getTempoDetailsForPDF = (startTime: string, endTime: string): string[] => {
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  const matchedSlots = ALL_TEMPO_SLOTS.filter(
    (s) => s.start >= start && s.start <= end
  );
  if (matchedSlots.length === 0) return [`${start} às ${end}`];
  return matchedSlots.map((s) => `${s.label}: ${s.start} a ${s.end}`);
};

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--warning))",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
];

interface BookingReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: Booking[];
  loading: boolean;
  schoolName: string;
  schoolLogo: string | null;
  onCancelBooking?: (bookingId: string) => void;
  canCancelBooking?: (booking: Booking) => boolean;
  onRestoreBooking?: (bookingId: string) => void;
}

export default function BookingReport({
  open, onOpenChange, bookings, loading, schoolName, schoolLogo, onCancelBooking, canCancelBooking, onRestoreBooking,
}: BookingReportProps) {
  const [receiptBooking, setReceiptBooking] = useState<Booking | null>(null);
  const [showCharts, setShowCharts] = useState(true);
  const [gestorNames, setGestorNames] = useState<Record<string, string>>({});

  // Resolve names of managers who responded (gestor_responded_by) for history display
  useEffect(() => {
    const ids = Array.from(
      new Set(
        bookings
          .map((b) => b.gestor_responded_by)
          .filter((id): id is string => !!id),
      ),
    );
    const missing = ids.filter((id) => !gestorNames[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .in("user_id", missing);
      if (cancelled || !data) return;
      setGestorNames((prev) => {
        const next = { ...prev };
        data.forEach((p: any) => {
          next[p.user_id] = `${p.full_name}${p.role ? ` (${String(p.role).replace(/_/g, " ")})` : ""}`;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [bookings, gestorNames]);

  // Analytics
  const analytics = useMemo(() => {
    if (!bookings.length) return null;

    const byTeacher: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    const byDiscipline: Record<string, number> = {};

    bookings.forEach((b) => {
      const name = b.profiles?.full_name || "Desconhecido";
      byTeacher[name] = (byTeacher[name] || 0) + 1;

      const evtLabel = EVENT_TYPES.find((t) => t.id === b.event_type)?.label || b.event_type;
      byEventType[evtLabel] = (byEventType[evtLabel] || 0) + 1;

      if (b.discipline) {
        byDiscipline[b.discipline] = (byDiscipline[b.discipline] || 0) + 1;
      }
    });

    const teacherData = Object.entries(byTeacher)
      .map(([name, count]) => ({ name: name.split(" ").slice(0, 2).join(" "), fullName: name, count }))
      .sort((a, b) => b.count - a.count);

    const eventData = Object.entries(byEventType)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const disciplineData = Object.entries(byDiscipline)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { teacherData, eventData, disciplineData, topTeacher: teacherData[0] };
  }, [bookings]);

  // Group bookings by date
  const groupedBookings = useMemo(() => {
    const groups: Record<string, Booking[]> = {};
    bookings.forEach((b) => {
      if (!groups[b.booking_date]) groups[b.booking_date] = [];
      groups[b.booking_date].push(b);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [bookings]);

  const generatePDF = async (action: "download" | "print" | "share") => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header background
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageWidth, 45, "F");

    // School logo in PDF header
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
          ctx?.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          doc.addImage(dataUrl, "PNG", 14, 5, 16, 16);
        }
      } catch {}
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Agendamentos", pageWidth / 2, 16, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(schoolName, pageWidth / 2, 25, { align: "center" });
    doc.setFontSize(8);
    doc.text(
      `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} | Total: ${bookings.length} agendamento(s)`,
      pageWidth / 2, 33, { align: "center" }
    );
    doc.setTextColor(0, 0, 0);

    const rows: any[][] = [];
    for (const [dateKey, dateBookings] of groupedBookings) {
      const dateLabel = format(parseISO(dateKey), "EEEE, dd/MM/yyyy", { locale: ptBR });
      rows.push([{
        content: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
        colSpan: 5,
        styles: { fontStyle: "bold", fillColor: [230, 230, 250] },
      }]);
      for (const b of dateBookings) {
        const resourceNames = (b.resources || [])
          .map((resId: string) => RESOURCES.find((r) => r.id === resId)?.label || resId)
          .join(", ");
        const eventLabel = EVENT_TYPES.find((t) => t.id === b.event_type)?.label || b.event_type;
        const tempoText = getTempoDetailsForPDF(b.start_time, b.end_time).join("\n");
        rows.push([
          tempoText,
          b.profiles?.full_name || "Professor",
          `${eventLabel}${b.discipline ? `\n${b.discipline}` : ""}${b.topic ? `\n${b.topic}` : ""}`,
          b.description || "-",
          resourceNames || "-",
        ]);
      }
    }

    autoTable(doc, {
      startY: 50,
      head: [["Horário", "Professor", "Tipo/Disciplina/Tema", "Descrição", "Recursos"]],
      body: rows,
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
      margin: { left: 8, right: 8 },
      tableWidth: 'auto',
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Agendamento Escolar - ${schoolName}`, 14, pageHeight - 10);
        doc.text(
          `Página ${doc.getNumberOfPages()}`,
          pageWidth - 14, pageHeight - 10, { align: "right" }
        );
        doc.setTextColor(0, 0, 0);
      },
    });

    const fileName = `agendamentos-${format(new Date(), "yyyy-MM-dd")}.pdf`;

    if (action === "download") {
      doc.save(fileName);
    } else if (action === "print") {
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
    } else if (action === "share") {
      const pdfBlob = doc.output("blob");
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Relatório de Agendamentos", text: `Agendamentos - ${schoolName}` });
        } catch { /* cancelled */ }
      } else {
        doc.save(fileName);
      }
    }
  };

  const shareBookingReceipt = async (booking: Booking) => {
    const eventLabel = EVENT_TYPES.find((t) => t.id === booking.event_type)?.label || booking.event_type;
    const dateFormatted = format(parseISO(booking.booking_date), "dd/MM/yyyy (EEEE)", { locale: ptBR });
    const resourceNames = (booking.resources || [])
      .map((r: string) => RESOURCES.find((res) => res.id === r)?.label || r)
      .join(", ");
    const tempoDetails = getTempoDetails(booking.start_time, booking.end_time);
    const bookingDateForFooter = format(parseISO(booking.booking_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

    const text = [
      `📋 COMPROVANTE DE AGENDAMENTO`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🏫 ${schoolName}`,
      ``,
      `👤 Professor: ${booking.profiles?.full_name || "—"}`,
      `📅 Data: ${dateFormatted}`,
      `🕐 Horário: ${tempoDetails}`,
      `📌 Tipo: ${eventLabel}`,
      booking.discipline ? `📚 Disciplina: ${booking.discipline}` : "",
      booking.topic ? `📝 Tema: ${booking.topic}` : "",
      booking.description ? `📄 Descrição: ${booking.description}` : "",
      resourceNames ? `🖥️ Recursos: ${resourceNames}` : "",
      booking.visitor_name ? `👥 Visitante: ${booking.visitor_name}${booking.visitor_info ? ` (${booking.visitor_info})` : ""}` : "",
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `✅ Status: Confirmado`,
      ``,
      `Boa Vista-RR, ${bookingDateForFooter}`,
      `📲 Agendamento Escolar — Agendamento de Ambiente Escolar`,
    ].filter(Boolean).join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: "Comprovante de Agendamento", text });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      // toast handled by parent
    }
  };

  const generateReceiptPDF = async (booking: Booking) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const eventLabel = EVENT_TYPES.find((t) => t.id === booking.event_type)?.label || booking.event_type;
    const dateFormatted = format(parseISO(booking.booking_date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const bookingDateFooter = format(parseISO(booking.booking_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const resourceNames = (booking.resources || [])
      .map((r: string) => RESOURCES.find((res) => res.id === r)?.label || r)
      .join(", ");
    const tempoLines = getTempoDetailsForPDF(booking.start_time, booking.end_time);

    // Header background
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageWidth, 50, "F");

    // School logo
    let logoX = pageWidth / 2;
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
          ctx?.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          doc.addImage(dataUrl, "PNG", 15, 5, 18, 18);
          logoX = pageWidth / 2 + 5;
        }
      } catch {}
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Comprovante de Agendamento", logoX, 18, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(schoolName, logoX, 28, { align: "center" });

    doc.setFontSize(9);
    doc.text(dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1), logoX, 38, { align: "center" });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    let y = 60;
    const addField = (label: string, value: string, color?: [number, number, number]) => {
      if (!value || value === "-") return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      if (color) doc.setTextColor(...color);
      else doc.setTextColor(99, 102, 241);
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(value, 80, y);
      y += 10;
    };

    addField("Professor:", booking.profiles?.full_name || "—");
    addField("Tipo:", eventLabel);
    
    // Tempo details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(99, 102, 241);
    doc.text("Horário:", 25, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    tempoLines.forEach((line, i) => {
      doc.text(line, 80, y + (i * 7));
    });
    y += tempoLines.length * 7 + 3;

    if (booking.discipline) addField("Disciplina:", booking.discipline);
    if (booking.topic) addField("Tema:", booking.topic);
    if (booking.description) addField("Descrição:", booking.description);
    if (resourceNames) addField("Recursos:", resourceNames);
    if (booking.visitor_name) addField("Visitante:", `${booking.visitor_name}${booking.visitor_info ? ` (${booking.visitor_info})` : ""}`);

    y += 5;
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.5);
    doc.line(20, y, pageWidth - 20, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(34, 197, 94);
    doc.text("Status: Confirmado", pageWidth / 2, y, { align: "center" });

    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Boa Vista-RR, ${bookingDateFooter}`, pageWidth / 2, pageHeight - 20, { align: "center" });

    doc.setFontSize(8);
    doc.text(
      `Agendamento Escolar — Agendamento de Ambiente Escolar`,
      pageWidth / 2, pageHeight - 13, { align: "center" }
    );

    const fileName = `comprovante-${booking.booking_date}-${booking.start_time.slice(0, 5).replace(":", "h")}.pdf`;
    doc.save(fileName);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!inset-0 !translate-x-0 !translate-y-0 !max-w-none w-full h-dvh max-h-dvh sm:!inset-auto sm:!left-[50%] sm:!top-[50%] sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:!max-w-3xl sm:max-h-[90dvh] sm:h-auto rounded-none sm:rounded-2xl border-0 shadow-card-hover overflow-hidden bg-background flex flex-col [&>button]:text-destructive [&>button]:opacity-100 [&>button>svg]:!size-7 [&>button>svg]:!stroke-[3]">
          <DialogHeader className="shrink-0 pb-2 border-b border-border/50">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
                  <BarChart3 className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="font-display text-lg font-bold">
                    Relatório de Agendamentos
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    {schoolName} • {bookings.length} agendamento{bookings.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              {bookings.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 text-xs h-8 flex-1 sm:flex-none"
                    onClick={() => generatePDF("download")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 text-xs h-8 flex-1 sm:flex-none"
                    onClick={() => generatePDF("print")}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 text-xs h-8 flex-1 sm:flex-none"
                    onClick={() => generatePDF("share")}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Compartilhar
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-1 space-y-4 pb-4">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground animate-pulse">Carregando...</div>
            ) : bookings.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum agendamento encontrado.</p>
              </div>
            ) : (
              <>
                {/* Charts section */}
                {analytics && (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowCharts(!showCharts)}
                      className="flex items-center gap-2 text-sm font-bold font-display text-primary w-full"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Estatísticas de Uso
                      {showCharts ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                    </button>

                    {showCharts && (
                      <div className="space-y-3">
                        {/* Top user highlight */}
                        {analytics.topTeacher && (
                          <Card className="border-0 shadow-card overflow-hidden gradient-primary text-primary-foreground">
                            <CardContent className="p-3 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                                <Trophy className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="text-xs font-medium opacity-80">Quem mais usa a sala</p>
                                <p className="text-base font-bold">{analytics.topTeacher.fullName}</p>
                                <p className="text-xs opacity-80">{analytics.topTeacher.count} agendamento{analytics.topTeacher.count !== 1 ? "s" : ""}</p>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Bar chart - top teachers */}
                        <Card className="border-0 shadow-card">
                          <CardContent className="p-3">
                            <p className="text-xs font-bold font-display mb-2 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-primary" />
                              Agendamentos por Professor
                            </p>
                            <div className="h-[180px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={analytics.teacherData.slice(0, 8)}
                                  layout="vertical"
                                  margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                >
                                  <XAxis type="number" hide />
                                  <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={90}
                                    tick={{ fontSize: 10 }}
                                  />
                                  <Tooltip
                                    formatter={(value: number) => [`${value} agendamento(s)`, "Total"]}
                                    contentStyle={{
                                      borderRadius: 12,
                                      border: "none",
                                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                      fontSize: 11,
                                    }}
                                  />
                                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                                    {analytics.teacherData.slice(0, 8).map((_, index) => (
                                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Pie chart - event types + discipline bar */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Card className="border-0 shadow-card">
                            <CardContent className="p-3">
                              <p className="text-xs font-bold font-display mb-2">Tipos de Evento</p>
                              <div className="h-[150px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={analytics.eventData}
                                      dataKey="count"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      outerRadius={55}
                                      innerRadius={30}
                                      label={({ name, ...rest }: any) => `${name} (${(rest as any).count})`}
                                      labelLine={false}
                                      style={{ fontSize: 9 }}
                                    >
                                      {analytics.eventData.map((_, index) => (
                                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 11 }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </CardContent>
                          </Card>

                          {analytics.disciplineData.length > 0 && (
                            <Card className="border-0 shadow-card">
                              <CardContent className="p-3">
                                <p className="text-xs font-bold font-display mb-2">Top Disciplinas</p>
                                <div className="space-y-1.5">
                                  {analytics.disciplineData.slice(0, 5).map((d, i) => (
                                    <div key={d.name} className="flex items-center gap-2">
                                      <div
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                      />
                                      <span className="text-[11px] flex-1 truncate">{d.name}</span>
                                      <span className="text-[11px] font-bold tabular-nums">{d.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Bookings list */}
                <div className="space-y-4">
                  <p className="text-sm font-bold font-display flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Todos os Agendamentos
                  </p>
                  {groupedBookings.map(([dateKey, dateBookings]) => (
                    <div key={dateKey}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1.5">
                        <div className="h-6 w-1 rounded-full gradient-primary shrink-0" />
                        <h3 className="text-xs font-bold font-display text-primary flex-1">
                          {format(parseISO(dateKey), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        </h3>
                        <Badge variant="secondary" className="text-[10px] rounded-lg shrink-0">
                          {dateBookings.length}
                        </Badge>
                      </div>
                      <div className="space-y-1.5 ml-3">
                        {dateBookings.map((booking) => (
                          <button
                            key={booking.id}
                            onClick={() => setReceiptBooking(booking)}
                            className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border/30 hover:border-primary/30 transition-all cursor-pointer group"
                          >
                            <div className="flex flex-col items-center shrink-0 min-w-[50px]">
                              <span className="text-sm font-bold text-primary">{booking.start_time.slice(0, 5)}</span>
                              <span className="text-[9px] text-muted-foreground">até</span>
                              <span className="text-xs font-semibold text-muted-foreground">{booking.end_time.slice(0, 5)}</span>
                            </div>
                            <div className="w-px min-h-[36px] bg-border shrink-0 self-stretch" />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <p className={`font-semibold text-sm truncate ${booking.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}>{booking.profiles?.full_name || "Professor"}</p>
                                {booking.event_type !== "aula" && (
                                  <Badge variant="outline" className="text-[9px] rounded-md shrink-0">
                                    {EVENT_TYPES.find((t) => t.id === booking.event_type)?.label}
                                  </Badge>
                                )}
                                {booking.status === "cancelled" && (
                                  <Badge variant="outline" className="text-[9px] rounded-md shrink-0 bg-destructive/10 text-destructive border-destructive/20">
                                    Cancelado
                                  </Badge>
                                )}
                                {booking.event_type === "evento_externo" && booking.gestor_status === "denied" && (
                                  <Badge variant="outline" className="text-[9px] rounded-md shrink-0 bg-destructive/10 text-destructive border-destructive/20">
                                    Recusado pelo gestor
                                  </Badge>
                                )}
                                {booking.event_type === "evento_externo" && booking.gestor_status === "approved" && (
                                  <Badge variant="outline" className="text-[9px] rounded-md shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                    Aprovado pelo gestor
                                  </Badge>
                                )}
                                {booking.event_type === "evento_externo" && booking.gestor_status === "pending" && (
                                  <Badge variant="outline" className="text-[9px] rounded-md shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/30">
                                    Aguardando gestor
                                  </Badge>
                                )}
                              </div>
                              {booking.status === "cancelled" && booking.cancelled_by_name && (
                                <p className="text-[10px] text-destructive/80 font-medium">
                                  ❌ Cancelado por: {booking.cancelled_by_name}
                                  {booking.cancelled_by_role && ` (${booking.cancelled_by_role.replace(/_/g, " ")})`}
                                </p>
                              )}
                              {booking.event_type === "evento_externo" &&
                                (booking.gestor_status === "denied" || booking.gestor_status === "approved") &&
                                booking.gestor_responded_at && (
                                  <div
                                    className={`rounded-md border px-2 py-1.5 mt-1 ${
                                      booking.gestor_status === "denied"
                                        ? "border-destructive/30 bg-destructive/5"
                                        : "border-emerald-500/30 bg-emerald-500/5"
                                    }`}
                                  >
                                    <p
                                      className={`text-[9px] uppercase tracking-wider font-bold mb-0.5 ${
                                        booking.gestor_status === "denied"
                                          ? "text-destructive"
                                          : "text-emerald-700 dark:text-emerald-400"
                                      }`}
                                    >
                                      {booking.gestor_status === "denied"
                                        ? "Justificativa do gestor"
                                        : "Aprovação do gestor"}
                                    </p>
                                    {booking.gestor_status === "denied" && booking.gestor_response && (
                                      <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words leading-snug mb-1">
                                        {booking.gestor_response}
                                      </p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground leading-snug">
                                      <span className="font-semibold">
                                        {booking.gestor_status === "denied" ? "Recusado" : "Aprovado"}
                                      </span>{" "}
                                      em{" "}
                                      {format(parseISO(booking.gestor_responded_at), "dd/MM/yyyy 'às' HH:mm", {
                                        locale: ptBR,
                                      })}
                                      {booking.gestor_responded_by && (
                                        <>
                                          {" "}
                                          por{" "}
                                          <span className="font-semibold">
                                            {gestorNames[booking.gestor_responded_by] ?? "gestor"}
                                          </span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                )}
                              {booking.event_type === "evento_externo" && (
                                <BookingGestorHistory bookingId={booking.id} />
                              )}

                              {(booking.discipline || booking.topic) && (
                                <p className="text-[11px] text-primary/80 font-medium truncate">
                                  📚 {booking.discipline}{booking.discipline && booking.topic ? " — " : ""}{booking.topic}
                                </p>
                              )}
                              {booking.resources && booking.resources.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(booking.resources as string[]).map((resId) => {
                                    const res = RESOURCES.find((r) => r.id === resId);
                                    return res ? (
                                      <span key={resId} className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                                        {res.label}
                                      </span>
                                    ) : null;
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-1">
                              {booking.status === "cancelled" && onRestoreBooking && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onRestoreBooking(booking.id); }}
                                  className="p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors flex items-center gap-1"
                                  title="Restaurar agendamento"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span className="text-[9px] font-bold">Restaurar</span>
                                </button>
                              )}
                              {booking.status === "confirmed" && canCancelBooking?.(booking) && onCancelBooking && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onCancelBooking(booking.id); }}
                                  className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Cancelar agendamento"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <Share2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receiptBooking} onOpenChange={(open) => !open && setReceiptBooking(null)}>
        <DialogContent className="rounded-2xl border-0 shadow-card-hover max-w-md">
          {receiptBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-base font-bold flex items-center gap-2">
                  📋 Comprovante de Agendamento
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-secondary/40 border border-border/50 space-y-2.5">
                  <div className="text-center pb-2 border-b border-border/50">
                    <p className="text-xs text-muted-foreground">{schoolName}</p>
                    <p className="text-sm font-bold mt-1">
                      {format(parseISO(receiptBooking.booking_date), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <span className="text-muted-foreground text-xs">Professor</span>
                    <span className="font-semibold text-xs">{receiptBooking.profiles?.full_name || "—"}</span>
                    <span className="text-muted-foreground text-xs">Horário</span>
                    <div className="font-semibold text-xs space-y-0.5">
                      {getTempoDetailsForPDF(receiptBooking.start_time, receiptBooking.end_time).map((t, i) => (
                        <p key={i}>{t}</p>
                      ))}
                    </div>
                    <span className="text-muted-foreground text-xs">Tipo</span>
                    <span className="font-semibold text-xs">{EVENT_TYPES.find((t) => t.id === receiptBooking.event_type)?.label}</span>
                    {receiptBooking.discipline && (
                      <>
                        <span className="text-muted-foreground text-xs">Disciplina</span>
                        <span className="font-semibold text-xs">{receiptBooking.discipline}</span>
                      </>
                    )}
                    {receiptBooking.topic && (
                      <>
                        <span className="text-muted-foreground text-xs">Tema</span>
                        <span className="font-semibold text-xs">{receiptBooking.topic}</span>
                      </>
                    )}
                    {receiptBooking.description && (
                      <>
                        <span className="text-muted-foreground text-xs">Descrição</span>
                        <span className="font-semibold text-xs">{receiptBooking.description}</span>
                      </>
                    )}
                    {receiptBooking.resources && receiptBooking.resources.length > 0 && (
                      <>
                        <span className="text-muted-foreground text-xs">Recursos</span>
                        <span className="font-semibold text-xs">
                          {(receiptBooking.resources as string[])
                            .map((r) => RESOURCES.find((res) => res.id === r)?.label || r)
                            .join(", ")}
                        </span>
                      </>
                    )}
                    {receiptBooking.visitor_name && (
                      <>
                        <span className="text-muted-foreground text-xs">Visitante</span>
                        <span className="font-semibold text-xs">
                          {receiptBooking.visitor_name}{receiptBooking.visitor_info ? ` (${receiptBooking.visitor_info})` : ""}
                        </span>
                      </>
                    )}
                  </div>
                  {receiptBooking.status === "cancelled" ? (
                    <div className="pt-2 border-t border-border/50 text-center space-y-1">
                      <Badge className="rounded-lg bg-destructive/15 text-destructive border-destructive/20 text-[10px]">
                        ✕ Cancelado
                      </Badge>
                      {receiptBooking.cancelled_by_name && (
                        <p className="text-[10px] text-destructive/80">
                          Por: {receiptBooking.cancelled_by_name}
                          {receiptBooking.cancelled_by_role && ` (${receiptBooking.cancelled_by_role.replace(/_/g, " ")})`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-border/50 text-center">
                      <Badge className="rounded-lg bg-accent/15 text-accent border-accent/20 text-[10px]">
                        ✓ Confirmado
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-xl gap-1.5 text-xs h-9"
                    onClick={() => generateReceiptPDF(receiptBooking)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Baixar PDF
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 rounded-xl gap-1.5 text-xs h-9 gradient-primary text-primary-foreground border-0"
                    onClick={() => shareBookingReceipt(receiptBooking)}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Compartilhar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
