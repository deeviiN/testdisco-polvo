import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, Users } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadableOnPrimary } from "@/hooks/useReadableOnPrimary";
import { useSectorPreferences, type ColorOption } from "@/hooks/useSectorPreferences";
import { toast } from "sonner";
import GestorRequestPreview from "@/components/GestorRequestPreview";

// Mesma paleta dos botões de setor
function sectorBtnStyle(color: ColorOption, selected: boolean, glowEnabled: boolean) {
  const gradSel = `radial-gradient(circle at 30% 25%, hsla(${color.hueA}, ${color.satA + 10}%, ${color.lightA + 12}%, 1) 0%, hsla(${color.hueB}, ${color.satB + 5}%, ${color.lightB + 6}%, 1) 60%, hsla(${color.hueC}, ${color.satC + 10}%, ${color.lightC + 4}%, 1) 100%)`;
  const grad = `linear-gradient(145deg, hsla(${color.hueA}, ${color.satA}%, ${color.lightA}%, 1), hsla(${color.hueB}, ${color.satB}%, ${color.lightB}%, 1))`;
  const solid = `hsl(${selected ? color.hueA : color.hueB}, ${selected ? color.satA : color.satB}%, ${selected ? color.lightA + 8 : color.lightB}%)`;
  return {
    background: glowEnabled ? (selected ? gradSel : grad) : solid,
    boxShadow: glowEnabled
      ? (selected
          ? `0 0 0 2px hsla(${color.hueA}, 95%, 75%, 0.95), 0 0 16px hsla(${color.hueA}, 90%, 65%, 0.85), 0 0 32px hsla(${color.hueA}, 85%, 60%, 0.55)`
          : `inset 0 1px 4px hsla(${color.hueA}, 90%, 75%, 0.3), 0 0 8px hsla(${color.hueA}, 80%, 50%, 0.25)`)
      : "none",
    border: glowEnabled
      ? (selected ? `2px solid hsla(${color.hueA}, 95%, 75%, 0.9)` : `1px solid hsla(${color.hueA}, 90%, 70%, 0.45)`)
      : (selected ? `2px solid hsla(${color.hueA}, 80%, 70%, 0.9)` : `1px solid hsla(${color.hueA}, 30%, 45%, 0.35)`),
    color: "white",
  } as React.CSSProperties;
}

type Turno = "manha" | "tarde" | "noite";
type TimeMode = "avulso" | "padrao";

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const SLOT_END_MAP: Record<string, string> = {
  "07:20": "08:20", "08:20": "09:20", "09:45": "10:45", "10:45": "11:45", "11:45": "12:45",
  "13:20": "14:20", "14:20": "15:20", "15:45": "16:45", "16:45": "17:45", "17:45": "18:45",
  "18:45": "19:40", "19:40": "20:35", "20:45": "21:40", "21:40": "22:35",
};

const MORNING_SLOTS = [
  { value: "07:20", label: "1º Tempo", range: "07:20 - 08:20" },
  { value: "08:20", label: "2º Tempo", range: "08:20 - 09:20" },
  { value: "09:45", label: "3º Tempo", range: "09:45 - 10:45" },
  { value: "10:45", label: "4º Tempo", range: "10:45 - 11:45" },
  { value: "11:45", label: "5º Tempo", range: "11:45 - 12:45" },
];
const AFTERNOON_SLOTS = [
  { value: "13:20", label: "1º Tempo", range: "13:20 - 14:20" },
  { value: "14:20", label: "2º Tempo", range: "14:20 - 15:20" },
  { value: "15:45", label: "3º Tempo", range: "15:45 - 16:45" },
  { value: "16:45", label: "4º Tempo", range: "16:45 - 17:45" },
  { value: "17:45", label: "5º Tempo", range: "17:45 - 18:45" },
];
const NIGHT_SLOTS = [
  { value: "18:45", label: "1º Tempo", range: "18:45 - 19:40" },
  { value: "19:40", label: "2º Tempo", range: "19:40 - 20:35" },
  { value: "20:45", label: "3º Tempo", range: "20:45 - 21:40" },
  { value: "21:40", label: "4º Tempo", range: "21:40 - 22:35" },
];

export default function QuadraBookingDate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goBack = useSmartBack(`/booking/quadra?${searchParams.toString()}`);
  const { user, profile } = useAuth();
  const readable = useReadableOnPrimary();
  const { color, glowEnabled } = useSectorPreferences();

  const bookingMode = searchParams.get("mode") === "multi" ? "multi" : "single";
  const sector = searchParams.get("sector") || "quadra";
  const eventType = searchParams.get("event") || "outros";
  const eventName = searchParams.get("name") || "";
  const audience = searchParams.get("audience") || "";
  const department = searchParams.get("department") || "";
  const dateParam = searchParams.get("date");
  const datesParam = searchParams.get("dates");
  const resourcesParam = searchParams.get("resources") || "";
  const selectedResources = resourcesParam ? resourcesParam.split(",").filter(Boolean) : [];

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(dateParam ? new Date(dateParam) : undefined);
  const [selectedDates, setSelectedDates] = useState<Date[]>(datesParam ? datesParam.split(",").map((d) => new Date(d)) : []);

  const [timeRange, setTimeRange] = useState<number[]>([480, 600]);
  const [timeMode, setTimeMode] = useState<TimeMode>("avulso");
  const [turno, setTurno] = useState<Turno>("manha");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [turnoMissing, setTurnoMissing] = useState<Turno | null>(null);
  const [occupied, setOccupied] = useState<Array<{ start: string; end: string }>>([]);
  const [loadingOccupied, setLoadingOccupied] = useState(false);

  // Busca horários já ocupados no dia/setor selecionado
  useEffect(() => {
    const dateToCheck = bookingMode === "single"
      ? selectedDate
      : selectedDates[selectedDates.length - 1];
    if (!dateToCheck || !profile?.school_id || !sector) {
      setOccupied([]);
      return;
    }
    const dateStr = format(dateToCheck, "yyyy-MM-dd");
    setLoadingOccupied(true);
    supabase
      .from("bookings")
      .select("start_time,end_time")
      .eq("school_id", profile.school_id)
      .eq("sector", sector)
      .eq("booking_date", dateStr)
      .neq("status", "cancelled")
      .order("start_time")
      .then(({ data }) => {
        setOccupied((data || []).map((r: any) => ({ start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5) })));
        setLoadingOccupied(false);
      });
  }, [selectedDate, selectedDates, sector, profile?.school_id, bookingMode]);


  const BASE_MIN_MINUTES = 360;
  const MAX_MINUTES = 1380;
  const dateForSlider = bookingMode === "single" ? selectedDate : selectedDates[selectedDates.length - 1];
  const sliderIsToday = !!dateForSlider && dateForSlider.toDateString() === new Date().toDateString();
  const nowMinutes = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const MIN_MINUTES = sliderIsToday ? Math.min(MAX_MINUTES - 30, Math.max(BASE_MIN_MINUTES, Math.ceil(nowMinutes / 5) * 5)) : BASE_MIN_MINUTES;

  // Garante que o intervalo avulso não fique no passado quando a data é hoje
  useEffect(() => {
    if (!sliderIsToday) return;
    setTimeRange(([start, end]) => {
      const newStart = Math.max(start, MIN_MINUTES);
      const newEnd = Math.max(end, newStart + 30);
      return (newStart !== start || newEnd !== end) ? [newStart, newEnd] : [start, end];
    });
  }, [sliderIsToday, MIN_MINUTES]);

  const currentSlots = turno === "manha" ? MORNING_SLOTS : turno === "tarde" ? AFTERNOON_SLOTS : NIGHT_SLOTS;

  const hasDate = bookingMode === "single" ? !!selectedDate : selectedDates.length > 0;
  const hasTime = timeMode === "avulso" || selectedSlots.length > 0;
  const canConfirm = hasDate && hasTime;

  const HOLIDAYS: Record<string, string> = {
    "01-01": "Confraternização Universal",
    "02-16": "Carnaval",
    "02-17": "Carnaval",
    "02-18": "Quarta-feira de Cinzas",
    "04-03": "Sexta-feira Santa",
    "04-21": "Tiradentes",
    "05-01": "Dia do Trabalho",
    "06-04": "Corpus Christi",
    "09-07": "Independência do Brasil",
    "10-12": "Nossa Sra. Aparecida",
    "11-02": "Finados",
    "11-15": "Proclamação da República",
    "11-20": "Consciência Negra",
    "12-25": "Natal",
  };
  const getHolidayName = (d: Date) => HOLIDAYS[format(d, "MM-dd")];
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  const confirmIfRestricted = (date: Date) => {
    const holiday = getHolidayName(date);
    const weekend = isWeekend(date);
    if (!holiday && !weekend) return true;
    const dayName = format(date, "EEEE", { locale: ptBR });
    const motivo = holiday ? `feriado (${holiday})` : dayName;
    return window.confirm(`${format(date, "dd/MM/yyyy")} é ${motivo}. Deseja agendar mesmo assim?`);
  };

  const handleSingleDateSelect = (date: Date | undefined) => {
    if (!date) { setSelectedDate(undefined); return; }
    if (!confirmIfRestricted(date)) return;
    setSelectedDate(date);
  };

  const handleMultiDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const exists = selectedDates.find((d) => d.toDateString() === date.toDateString());
    if (!exists && !confirmIfRestricted(date)) return;
    setSelectedDates((prev) => {
      if (exists) return prev.filter((d) => d.toDateString() !== date.toDateString());
      return [...prev, date];
    });
  };


  const isSlotPast = (value: string) => {
    if (!sliderIsToday) return false;
    const endTime = SLOT_END_MAP[value] || value;
    const [h, m] = endTime.split(":").map(Number);
    return h * 60 + m <= nowMinutes;
  };

  const toggleSlot = (value: string) => {
    if (isSlotPast(value)) return;
    setSelectedSlots((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };


  const sectorLabel = sector === "quadra" ? "Quadra Escolar" : sector === "informatica" ? "Informática" : sector === "patio" ? "Pátio" : sector === "sala_professores" ? "Sala dos Professores" : sector === "biblioteca" ? "Biblioteca" : sector === "lab_ciencias" ? "Lab. de Ciências" : "Agendamento";

  const handleConfirm = async () => {
    if (!user || !profile?.school_id) {
      toast.error("Você precisa estar logado.");
      return;
    }
    // Validação de campos essenciais
    const missing: string[] = [];
    if (!sector) missing.push("setor");
    if (!eventType) missing.push("tipo de evento");
    const hasAnyDate = bookingMode === "single" ? !!selectedDate : selectedDates.length > 0;
    if (!hasAnyDate) missing.push("data");
    if (missing.length > 0) {
      toast.error(`Não é possível agendar: ${missing.join(", ")} ${missing.length > 1 ? "estão" : "está"} faltando. Volte e preencha antes de confirmar.`);
      return;
    }
    if (timeMode === "padrao" && selectedSlots.length === 0) {
      const turnoLabel = turno === "manha" ? "Manhã" : turno === "tarde" ? "Tarde" : "Noite";
      setTurnoMissing(turno);
      window.setTimeout(() => setTurnoMissing(null), 2400);
      toast.error(`Nenhum tempo selecionado no turno ${turnoLabel}. Escolha pelo menos um tempo antes de confirmar.`);
      return;
    }
    setSaving(true);

    const dates: string[] = [];
    if (bookingMode === "single" && selectedDate) {
      dates.push(format(selectedDate, "yyyy-MM-dd"));
    } else if (bookingMode === "multi") {
      selectedDates.forEach((d) => dates.push(format(d, "yyyy-MM-dd")));
    }

    if (dates.length === 0) {
      toast.error("Nenhuma data selecionada.");
      setSaving(false);
      return;
    }

    type TimePair = { start: string; end: string };
    const timePairs: TimePair[] = [];
    if (timeMode === "avulso") {
      timePairs.push({ start: minutesToTime(timeRange[0]), end: minutesToTime(timeRange[1]) });
    } else {
      const sorted = [...selectedSlots].sort();
      for (const slot of sorted) {
        timePairs.push({ start: slot, end: SLOT_END_MAP[slot] || slot });
      }
    }

    let gestorCommunique: string | null = null;
    if (eventType === "evento_externo" && dates.length > 0 && timePairs.length > 0) {
      const { generateGestorCommunique } = await import("@/lib/generateGestorCommunique");
      gestorCommunique = await generateGestorCommunique({
        topic: eventName,
        description: audience,
        visitorName: null,
        visitorInfo: department,
        sector,
        bookingDate: dates[0],
        startTime: timePairs[0].start,
        endTime: timePairs[timePairs.length - 1].end,
        requesterName: profile?.full_name || "",
      });
    }

    const rows = dates.flatMap((date) =>
      timePairs.map((tp) => ({
        booking_date: date,
        start_time: tp.start,
        end_time: tp.end,
        sector,
        event_type: eventType,
        topic: eventName || null,
        description: audience || null,
        discipline: department || null,
        user_id: user.id,
        school_id: profile.school_id,
        status: "confirmed",
        resources: selectedResources,
        gestor_communique: gestorCommunique,
      }))
    );

    console.log("[QuadraBookingDate] salvando bookings, recursos:", selectedResources, "rows:", rows);
    const { error } = await supabase.from("bookings").insert(rows);
    setSaving(false);

    if (error) {
      if (error.message?.includes("no_overlap") || error.code === "23P01") {
        toast.error("Já existe um agendamento nesse horário para este setor.");
      } else {
        toast.error("Erro ao salvar agendamento.");
      }
      console.error(error);
      return;
    }

    toast.success("Agendamento criado com sucesso!");

    const confirmParams = new URLSearchParams();
    confirmParams.set("sector", sector);
    confirmParams.set("event", eventType);
    if (eventName) confirmParams.set("name", eventName);
    if (audience) confirmParams.set("audience", audience);
    if (department) confirmParams.set("department", department);
    const ensino = searchParams.get("ensino") || "";
    const series = searchParams.get("series") || "";
    const turmas = searchParams.get("turmas") || "";
    if (ensino) confirmParams.set("ensino", ensino);
    if (series) confirmParams.set("series", series);
    if (turmas) confirmParams.set("turmas", turmas);
    confirmParams.set("dates", dates.join(","));
    const timeStr = timePairs.map(tp => `${tp.start}-${tp.end}`).join(",");
    confirmParams.set("times", timeStr);
    navigate(`/booking/confirmacao?${confirmParams.toString()}`);
  };

  return (
    <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 60%, 8%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(220, 70%, 20%, 0.6) 0%, hsla(215, 65%, 28%, 0.55) 40%, hsla(225, 60%, 25%, 0.6) 100%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 px-3 pt-20 pb-1">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold text-white tracking-tight leading-tight truncate">{sectorLabel}</h1>
          <p className="text-white/40 text-xs leading-tight">Data e horário</p>
        </div>
      </div>


      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-16 flex flex-col gap-1.5">
        {/* Calendar */}
        <div className="space-y-1.5 animate-fade-in mt-4">
          <p className="text-white text-lg font-semibold uppercase tracking-wider text-center">{bookingMode === "single" ? "Selecione a data" : "Selecione as datas"}</p>
          <div data-sector-themed="calendar" className="backdrop-blur-sm rounded-2xl -mx-3 px-1 py-1 w-[calc(100%+1.5rem)]">
            {(() => {
              const calendarClasses = cn(
                "p-0 w-full pointer-events-auto text-white",
                "[&_.rdp]:w-full [&_.rdp-months]:w-full [&_.rdp-month]:w-full",
                "[&_.rdp-table]:w-full [&_.rdp-table]:!table-fixed [&_.rdp-table]:border-collapse",
                "[&_.rdp-caption]:text-white [&_.rdp-caption_label]:text-lg [&_.rdp-caption_label]:font-bold [&_.rdp-caption_label]:uppercase [&_.rdp-caption_label]:tracking-wider",
                "[&_.rdp-nav_button]:!text-white [&_.rdp-nav_button]:!opacity-100 [&_.rdp-nav_button]:h-11 [&_.rdp-nav_button]:w-11 [&_.rdp-nav_button]:bg-white/30 [&_.rdp-nav_button]:border-2 [&_.rdp-nav_button]:border-white/70 [&_.rdp-nav_button]:rounded-lg [&_.rdp-nav_button]:shadow-lg [&_.rdp-nav_button:hover]:bg-white/45 [&_.rdp-nav_button_svg]:h-7 [&_.rdp-nav_button_svg]:w-7 [&_.rdp-nav_button_svg]:stroke-[3]",
                "[&_.rdp-day_today]:bg-white/15"
              );
              const calendarClassNames = {
                table: "w-full border-collapse table-fixed",
                head_row: "flex w-full",
                head_cell: "flex-1 text-white/60 font-bold text-[0.8rem] text-center min-w-0 w-auto",
                row: "flex w-full mt-0",
                cell: "flex-1 min-w-0 w-auto h-10 p-0 text-center align-middle relative",
                day: "w-full h-10 max-w-none p-0 mx-auto flex items-center justify-center rounded-lg text-base font-semibold text-white hover:bg-white/15 aria-selected:opacity-100",
                day_selected: "bg-primary text-white hover:bg-primary",
                day_today: "bg-white/15 text-white font-bold",
                day_outside: "text-white/30 opacity-50",
                day_disabled: "text-white/30 opacity-40",
                day_hidden: "invisible",
              };
              return bookingMode === "single" ? (
                <Calendar mode="single" selected={selectedDate} onSelect={handleSingleDateSelect} locale={ptBR}
                  weekStartsOn={1}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className={calendarClasses}
                  classNames={calendarClassNames} />
              ) : (
                <Calendar mode="single" selected={undefined} onSelect={handleMultiDateSelect} locale={ptBR}
                  weekStartsOn={1}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  modifiers={{ selected: selectedDates }} modifiersClassNames={{ selected: "bg-primary text-white" }}
                  className={calendarClasses}
                  classNames={calendarClassNames} />
              );
            })()}
          </div>
          {bookingMode === "multi" && selectedDates.length > 0 && (
            <p className="text-white/40 text-[10px] text-center">{selectedDates.length} data{selectedDates.length > 1 ? "s" : ""} selecionada{selectedDates.length > 1 ? "s" : ""}</p>
          )}
          {bookingMode === "single" && selectedDate && (
            <p className="text-white/40 text-[10px] text-center">
              {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              {getHolidayName(selectedDate) && (
                <span className="ml-1 text-amber-300 font-semibold">· {getHolidayName(selectedDate)}</span>
              )}
              {isWeekend(selectedDate) && !getHolidayName(selectedDate) && (
                <span className="ml-1 text-amber-300 font-semibold">· {format(selectedDate, "EEEE", { locale: ptBR })}</span>
              )}
            </p>
          )}
        </div>

        {/* Disponibilidade do dia/setor */}
        {(bookingMode === "single" ? selectedDate : selectedDates.length > 0) && (() => {
          const allSlots = [...MORNING_SLOTS, ...AFTERNOON_SLOTS, ...NIGHT_SLOTS];
          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const isOccupied = (slot: { value: string }) => {
            const sStart = toMin(slot.value);
            const sEnd = toMin(SLOT_END_MAP[slot.value] || slot.value);
            return occupied.some((o) => {
              const oStart = toMin(o.start);
              const oEnd = toMin(o.end);
              return sStart < oEnd && sEnd > oStart;
            });
          };
          const dateRef = bookingMode === "single" ? selectedDate! : selectedDates[selectedDates.length - 1];
          const now = new Date();
          const isToday = dateRef.toDateString() === now.toDateString();
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const isPast = (slot: { value: string }) => {
            if (!isToday) return false;
            return toMin(SLOT_END_MAP[slot.value] || slot.value) <= nowMin;
          };
          const dateLabel = format(dateRef, "dd/MM", { locale: ptBR });
          return (
            <div className="space-y-1 animate-fade-in">
              <p className="text-white/80 text-sm font-bold uppercase tracking-wider">
                Disponibilidade · {sectorLabel} · {dateLabel}
              </p>
              <div className="backdrop-blur-sm rounded-xl bg-white/5 border border-white/15 px-2 py-1.5">
                {loadingOccupied ? (
                  <p className="text-white/60 text-[11px] text-center py-1">Carregando…</p>
                ) : (
                  <>
                    {occupied.length > 0 && (
                      <div className="mb-1.5 pb-1.5 border-b border-white/10">
                        <p className="text-[9px] uppercase tracking-wider text-destructive/90 font-bold mb-0.5">Ocupado</p>
                        <div className="flex flex-wrap gap-1">
                          {occupied.map((o, i) => (
                            <span key={i} className="text-[10px] font-semibold bg-destructive/25 border border-destructive/50 text-white rounded px-1.5 py-0 tabular-nums">
                              {o.start.slice(0, 5)} – {o.end.slice(0, 5)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[9px] uppercase tracking-wider text-emerald-300/90 font-bold mb-0.5">
                      Tempos livres
                      {timeMode === "avulso" && (
                        <span className="ml-1 text-amber-300 normal-case tracking-normal font-normal">
                          (faixa avulsa: {minutesToTime(timeRange[0])}–{minutesToTime(timeRange[1])})
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      {allSlots.map((s) => {
                        const past = isPast(s);
                        const busy = isOccupied(s);
                        const sStart = toMin(s.value);
                        const sEnd = toMin(SLOT_END_MAP[s.value] || s.value);
                        const inAvulso = timeMode === "avulso" && sStart < timeRange[1] && sEnd > timeRange[0];
                        const inPadrao = timeMode === "padrao" && selectedSlots.includes(s.value);
                        const picked = !past && !busy && (inAvulso || inPadrao);
                        return (
                          <div
                            key={s.value}
                            className={`text-[10px] text-center rounded px-1 py-0.5 border tabular-nums ${
                              past
                                ? "bg-white/5 border-white/15 text-white/30 line-through"
                                : busy
                                  ? "bg-destructive/15 border-destructive/30 text-white/40 line-through"
                                  : picked
                                    ? "bg-amber-400/30 border-amber-300 text-white font-bold ring-1 ring-amber-300/60"
                                    : "bg-emerald-500/20 border-emerald-400/50 text-white"
                            }`}
                          >
                            {s.range}
                          </div>
                        );
                      })}
                    </div>

                  </>
                )}
              </div>
            </div>
          );
        })()}



        {/* Time mode toggle */}
        <div className="space-y-1 mt-6">
          <p className="text-white text-lg font-semibold uppercase tracking-wider">Modo de horário</p>
          <div className="flex gap-1.5">
            <button onClick={() => setTimeMode("avulso")}
              data-sector-toggle={timeMode === "avulso" ? "on" : "off"}
              style={timeMode === "avulso" ? { ...sectorBtnStyle(color, true, glowEnabled), borderRadius: 8 } : undefined}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${timeMode === "avulso" ? "text-white shadow-lg" : "bg-white/10 text-white/50 border border-white/15 hover:bg-white/15"}`}>
              Avulso
            </button>
            <button onClick={() => setTimeMode("padrao")}
              data-sector-toggle={timeMode === "padrao" ? "on" : "off"}
              style={timeMode === "padrao" ? { ...sectorBtnStyle(color, true, glowEnabled), borderRadius: 8 } : undefined}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${timeMode === "padrao" ? "text-white shadow-lg" : "bg-white/10 text-white/50 border border-white/15 hover:bg-white/15"}`}>
              Padrão
            </button>
          </div>
        </div>

        {/* Avulso mode */}
        {timeMode === "avulso" && (
          <div className="space-y-1 animate-fade-in mt-6">
            <p className="text-white text-lg font-semibold uppercase tracking-wider">Horário</p>
            <div
              className="backdrop-blur-sm rounded-xl px-3 py-2 space-y-2 border"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary) / 0.08))",
                borderColor: "hsl(var(--primary) / 0.45)",
                boxShadow: "0 0 18px hsl(var(--primary) / 0.35), inset 0 0 12px hsl(var(--primary) / 0.15)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <p className="text-[8px] uppercase tracking-wider leading-none opacity-90" style={{ color: readable.textColor, textShadow: readable.textShadow }}>Início</p>
                  <p className="text-base font-bold font-display leading-tight" style={{ color: readable.textColor, textShadow: readable.textShadow }}>
                    {minutesToTime(timeRange[0])}
                  </p>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="h-px w-6" style={{ background: "hsl(var(--primary) / 0.5)" }} />
                  <Users className="h-3 w-3 mx-1" style={{ color: readable.textColor, opacity: 0.85, filter: `drop-shadow(${readable.textShadow})` }} />
                  <div className="h-px w-6" style={{ background: "hsl(var(--primary) / 0.5)" }} />
                </div>
                <div className="text-center">
                  <p className="text-[8px] uppercase tracking-wider leading-none opacity-90" style={{ color: readable.textColor, textShadow: readable.textShadow }}>Fim</p>
                  <p className="text-base font-bold font-display leading-tight" style={{ color: readable.textColor, textShadow: readable.textShadow }}>
                    {minutesToTime(timeRange[1])}
                  </p>
                </div>
              </div>
              <Slider value={timeRange} onValueChange={(val) => setTimeRange(val)} min={MIN_MINUTES} max={MAX_MINUTES} step={5} minStepsBetweenThumbs={6} className="w-full" />
              <div className="flex justify-between text-[8px] px-0.5 opacity-80" style={{ color: readable.textColor, textShadow: readable.textShadow }}>
                <span>06:00</span><span>10:00</span><span>14:00</span><span>18:00</span><span>23:00</span>
              </div>
            </div>
            <p className="text-[10px] text-center opacity-90" style={{ color: readable.textColor, textShadow: readable.textShadow }}>
              Duração:{" "}
              <span className="font-semibold" style={{ color: readable.textColor, textShadow: readable.textShadow }}>
                {minutesToTime(timeRange[1] - timeRange[0]).replace(":", "h ")}min
              </span>
            </p>
          </div>
        )}

        {/* Padrão mode */}
        {timeMode === "padrao" && (
          <div className="space-y-2 animate-fade-in">
            <div className="flex gap-2">
              {([
                { key: "manha" as Turno, label: "Manhã", slots: MORNING_SLOTS },
                { key: "tarde" as Turno, label: "Tarde", slots: AFTERNOON_SLOTS },
                { key: "noite" as Turno, label: "Noite", slots: NIGHT_SLOTS },
              ]).map((t) => {
                const isMissing = turnoMissing === t.key;
                const allPast = sliderIsToday && t.slots.every((s) => isSlotPast(s.value));
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      if (allPast) {
                        toast.error("Não há disponibilidade para este turno hoje");
                        return;
                      }
                      setTurno(t.key); setSelectedSlots([]); setTurnoMissing(null);
                    }}
                    aria-disabled={allPast}
                    title={allPast ? "Não há disponibilidade para este turno hoje" : undefined}
                    data-sector-toggle={!isMissing && !allPast && turno === t.key ? "on" : "off"}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                      allPast
                        ? "bg-white/5 text-white/30 border border-white/10 line-through cursor-not-allowed opacity-60"
                        : isMissing
                          ? "bg-destructive/30 text-white border-2 border-destructive animate-pulse"
                          : turno === t.key
                            ? "bg-white/20 text-white border border-white/30"
                            : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {t.label}
                    {allPast && <span className="block text-[8px] mt-0.5 normal-case tracking-normal no-underline">indisponível</span>}
                    {!allPast && isMissing && <span className="block text-[8px] mt-0.5 text-destructive-foreground/90 normal-case tracking-normal">sem seleção</span>}
                  </button>
                );
              })}

            </div>
            <div
              className={`bg-white/10 backdrop-blur-sm rounded-2xl p-2 transition-all ${
                turnoMissing === turno ? "border-2 border-destructive ring-2 ring-destructive/40" : "border border-white/15"
              }`}
            >
              {currentSlots.length === 5 ? (
                (() => {
                  const middleSlot = currentSlots[2];
                  const isMiddleSelected = selectedSlots.includes(middleSlot.value);
                  const cornerSlots = currentSlots.filter((_, idx) => idx !== 2);
                  // Mesma técnica dos botões "Tipo de evento": círculo central de 96px
                  // recortado nos 4 retângulos via radial-gradient mask.
                  const cutRadius = 44; // 36 (raio do círculo) + 8 (folga)
                  const maskPositions = [
                    `at calc(100% + 4px) calc(100% + 4px)`, // TL → recorta canto inferior-direito
                    `at calc(0% - 4px) calc(100% + 4px)`,   // TR → recorta canto inferior-esquerdo
                    `at calc(100% + 4px) calc(0% - 4px)`,   // BL → recorta canto superior-direito
                    `at calc(0% - 4px) calc(0% - 4px)`,     // BR → recorta canto superior-esquerdo
                  ];

                  return (
                    <div className="relative">
                      <div className="grid grid-cols-2 gap-2">
                        {cornerSlots.map((slot, i) => {
                          const isSelected = selectedSlots.includes(slot.value);
                          const past = isSlotPast(slot.value);
                          const maskStyle = {
                            WebkitMask: `radial-gradient(circle ${cutRadius}px ${maskPositions[i]}, transparent 100%, black 100%)`,
                            mask: `radial-gradient(circle ${cutRadius}px ${maskPositions[i]}, transparent 100%, black 100%)`,
                          };
                          return (
                            <button
                              key={slot.value}
                              onClick={() => { toggleSlot(slot.value); setTurnoMissing(null); }}
                              disabled={past}
                              style={isSelected ? { ...maskStyle, ...sectorBtnStyle(color, true, glowEnabled), borderRadius: 16 } : maskStyle}
                              data-sector-toggle={isSelected ? "on" : "off"}
                              className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-2xl transition-all text-center min-h-[72px] overflow-hidden ${past ? "bg-white/5 border border-white/10 text-white/30 line-through cursor-not-allowed opacity-60" : isSelected ? "text-white shadow-lg" : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"}`}
                            >
                              <Checkbox checked={isSelected} disabled={past} className="h-4 w-4 border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                              <span className="text-sm font-bold whitespace-nowrap leading-tight">{slot.label}</span>
                              <span className={`text-[11px] whitespace-nowrap leading-tight ${past ? "text-white/30" : "text-white/60"}`}>{slot.range}</span>
                            </button>
                          );
                        })}
                      </div>

                      {(() => {
                        const middlePast = isSlotPast(middleSlot.value);
                        return (
                      <button
                        key={middleSlot.value}
                        onClick={() => { toggleSlot(middleSlot.value); setTurnoMissing(null); }}
                        disabled={middlePast}
                        data-sector-toggle={isMiddleSelected ? "on" : "off"}
                        style={isMiddleSelected ? { ...sectorBtnStyle(color, true, glowEnabled), borderRadius: 9999 } : undefined}
                        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center gap-0.5 w-[72px] h-[72px] rounded-full transition-all ${middlePast ? "bg-white/5 border border-white/10 text-white/30 line-through cursor-not-allowed opacity-60" : isMiddleSelected ? "text-white shadow-lg" : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"}`}
                      >
                        <Checkbox checked={isMiddleSelected} disabled={middlePast} className="h-3.5 w-3.5 border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                        <span className="text-[11px] font-bold whitespace-nowrap leading-tight">{middleSlot.label}</span>
                        <span className={`text-[9px] whitespace-nowrap leading-tight ${middlePast ? "text-white/30" : "text-white/60"}`}>{middleSlot.range}</span>
                      </button>
                        );
                      })()}
                    </div>
                  );
                })()
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {currentSlots.map((slot) => {
                    const isSelected = selectedSlots.includes(slot.value);
                    const past = isSlotPast(slot.value);
                    return (
                      <button
                        key={slot.value}
                        onClick={() => { toggleSlot(slot.value); setTurnoMissing(null); }}
                        disabled={past}
                        data-sector-toggle={isSelected ? "on" : "off"}
                        style={isSelected ? { ...sectorBtnStyle(color, true, glowEnabled), borderRadius: 12 } : undefined}
                        className={`flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-xl transition-all text-center min-h-[96px] ${past ? "bg-white/5 border border-white/10 text-white/30 line-through cursor-not-allowed opacity-60" : isSelected ? "text-white shadow-lg" : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"}`}
                      >
                        <Checkbox checked={isSelected} disabled={past} className="h-4 w-4 border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                        <span className="text-sm font-bold whitespace-nowrap leading-tight">{slot.label}</span>
                        <span className={`text-[11px] whitespace-nowrap leading-tight ${past ? "text-white/30" : "text-white/60"}`}>{slot.range}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resumo */}
        {canConfirm && (() => {
          const dateLabels = bookingMode === "single" && selectedDate
            ? [format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })]
            : [...selectedDates]
                .sort((a, b) => a.getTime() - b.getTime())
                .map((d) => format(d, "dd/MM/yyyy", { locale: ptBR }));
          const timeLabels = timeMode === "avulso"
            ? [`${minutesToTime(timeRange[0])} - ${minutesToTime(timeRange[1])}`]
            : [...selectedSlots].sort().map((s) => `${s} - ${SLOT_END_MAP[s] || s}`);
          return (
            <div className="space-y-1 animate-fade-in">
              <p className="text-white/80 text-sm font-bold uppercase tracking-wider">Resumo</p>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-2.5 py-1.5 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white/40 text-[9px] uppercase tracking-wider shrink-0">
                    {dateLabels.length > 1 ? `Datas (${dateLabels.length})` : "Data"}
                  </span>
                  {dateLabels.map((d) => (
                    <span key={d} className="text-white text-[10px] font-semibold bg-white/10 border border-white/15 rounded-md px-1.5 py-0">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white/40 text-[9px] uppercase tracking-wider shrink-0">
                    {timeMode === "avulso" ? "Horário" : `Tempos · ${turno === "manha" ? "Manhã" : turno === "tarde" ? "Tarde" : "Noite"}`}
                  </span>
                  {timeLabels.map((t) => (
                    <span key={t} className="text-white text-[10px] font-semibold bg-primary/25 border border-primary/40 rounded-md px-1.5 py-0">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Prévia da solicitação ao gestor (apenas evento externo) */}
        {canConfirm && eventType === "evento_externo" && (() => {
          const firstDateObj = bookingMode === "single"
            ? selectedDate
            : [...selectedDates].sort((a, b) => a.getTime() - b.getTime())[0];
          if (!firstDateObj) return null;
          const firstDate = format(firstDateObj, "yyyy-MM-dd");
          const startT = timeMode === "avulso"
            ? minutesToTime(timeRange[0])
            : [...selectedSlots].sort()[0];
          const endT = timeMode === "avulso"
            ? minutesToTime(timeRange[1])
            : (() => {
                const sorted = [...selectedSlots].sort();
                const last = sorted[sorted.length - 1];
                return SLOT_END_MAP[last] || last;
              })();
          if (!startT || !endT) return null;
          return (
            <GestorRequestPreview
              topic={eventName}
              description={audience}
              visitorName={null}
              visitorInfo={department}
              sectorLabel={sectorLabel}
              sectorKey={sector}
              bookingDate={firstDate}
              startTime={startT}
              endTime={endT}
              requesterName={profile?.full_name || ""}
            />
          );
        })()}
      </div>

      {/* Fixed bottom button */}
      {canConfirm && (
        <div className="relative z-10 px-3 pb-2 pt-1.5 animate-fade-in" style={{ background: "linear-gradient(to top, hsl(220, 60%, 8%) 60%, transparent)" }}>
          <Button size="lg" className="w-full rounded-xl h-11 text-sm font-bold bg-primary hover:bg-primary/90" onClick={handleConfirm} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar Agendamento"}
          </Button>
        </div>
      )}
    </div>
  );
}
