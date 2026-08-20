import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSectorPreferences, type ColorOption } from "@/hooks/useSectorPreferences";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

// Mesma textura/cor dos botões de setor — respeita o estilo escolhido (glow/flat/neon)
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

export default function QuadraBookingTime() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();

  const sector = searchParams.get("sector") || "quadra";
  const eventType = searchParams.get("event") || "outros";
  const eventName = searchParams.get("name") || "";
  const audience = searchParams.get("audience") || "";
  const department = searchParams.get("department") || "";
  const mode = searchParams.get("mode") || "single";
  const dateParam = searchParams.get("date");
  const datesParam = searchParams.get("dates");
  const resourcesParam = searchParams.get("resources") || "";
  const selectedResources = resourcesParam ? resourcesParam.split(",").filter(Boolean) : [];

  const [timeRange, setTimeRange] = useState<number[]>([480, 600]);
  const [timeMode, setTimeMode] = useState<TimeMode>("avulso");
  const [turno, setTurno] = useState<Turno>("manha");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { color, glowEnabled, font } = useSectorPreferences();

  const MIN_MINUTES = 360;
  const MAX_MINUTES = 1380;

  // Datas selecionadas (para buscar agendamentos existentes)
  const selectedDates = useMemo(() => {
    const ds: string[] = [];
    if (mode === "single" && dateParam) ds.push(format(new Date(dateParam), "yyyy-MM-dd"));
    else if (mode === "multi" && datesParam) datesParam.split(",").forEach((d) => ds.push(format(new Date(d), "yyyy-MM-dd")));
    return ds;
  }, [mode, dateParam, datesParam]);

  // Busca agendamentos já existentes no setor/datas para sinalizar na barra e nos tempos
  const [busyRanges, setBusyRanges] = useState<Array<{ start: number; end: number }>>([]);
  useEffect(() => {
    if (!profile?.school_id || selectedDates.length === 0) { setBusyRanges([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("start_time,end_time,status")
        .eq("school_id", profile.school_id)
        .eq("sector", sector)
        .in("booking_date", selectedDates)
        .neq("status", "cancelled");
      if (error || cancelled || !data) return;
      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
      };
      setBusyRanges(data.map((b: any) => ({ start: toMin(b.start_time), end: toMin(b.end_time) })));
    })();
    return () => { cancelled = true; };
  }, [profile?.school_id, sector, selectedDates]);

  const busySlotValues = useMemo(() => {
    const occupied = new Set<string>();
    for (const slot of [...MORNING_SLOTS, ...AFTERNOON_SLOTS, ...NIGHT_SLOTS]) {
      const [sh, sm] = slot.value.split(":").map(Number);
      const sMin = sh * 60 + sm;
      const endStr = SLOT_END_MAP[slot.value] || slot.value;
      const [eh, em] = endStr.split(":").map(Number);
      const eMin = eh * 60 + em;
      if (busyRanges.some((r) => r.start < eMin && r.end > sMin)) occupied.add(slot.value);
    }
    return occupied;
  }, [busyRanges]);

  const currentSlots = turno === "manha" ? MORNING_SLOTS : turno === "tarde" ? AFTERNOON_SLOTS : NIGHT_SLOTS;

  const toggleSlot = (value: string) => {
    setSelectedSlots((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };

  const hasTime = timeMode === "avulso" || selectedSlots.length > 0;

  const handleConfirm = async () => {
    if (!user || !profile?.school_id) {
      toast.error("Você precisa estar logado.");
      return;
    }
    setSaving(true);

    // Collect dates
    const dates: string[] = [];
    if (mode === "single" && dateParam) {
      dates.push(format(new Date(dateParam), "yyyy-MM-dd"));
    } else if (mode === "multi" && datesParam) {
      datesParam.split(",").forEach((d) => dates.push(format(new Date(d), "yyyy-MM-dd")));
    }

    if (dates.length === 0) {
      toast.error("Nenhuma data selecionada.");
      setSaving(false);
      return;
    }

    // Collect time pairs
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

    // Build booking rows
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
        gestor_communique: gestorCommunique,
        resources: selectedResources,
      }))
    );

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
    
    // Forward all booking details to confirmation
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
    <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={() => navigate(`/booking/quadra/data?${searchParams.toString()}`)} className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold text-white tracking-tight">Selecionar Horário</h1>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-24 pt-2 flex flex-col gap-3">
        {/* Time mode toggle */}
        <div className="space-y-1.5 mt-1">
          <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">Modo de horário</p>
          <div className="flex gap-2">
            <button onClick={() => setTimeMode("avulso")}
              style={{ ...sectorBtnStyle(color, timeMode === "avulso", glowEnabled), borderRadius: 14, fontFamily: font.family }}
              className="flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 hover:brightness-125">
              Avulso
            </button>
            <button onClick={() => setTimeMode("padrao")}
              style={{ ...sectorBtnStyle(color, timeMode === "padrao", glowEnabled), borderRadius: 14, fontFamily: font.family }}
              className="flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 hover:brightness-125">
              Padrão
            </button>
          </div>
        </div>

        {/* Avulso mode */}
        {timeMode === "avulso" && (
          <div className="space-y-2 animate-fade-in">
            <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">Horário</p>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <p className="text-white/40 text-[9px] uppercase tracking-wider">Início</p>
                  <p className="text-white text-lg font-bold font-display">{minutesToTime(timeRange[0])}</p>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="h-px w-8 bg-white/20" />
                  <Users className="h-3.5 w-3.5 text-white/30 mx-1.5" />
                  <div className="h-px w-8 bg-white/20" />
                </div>
                <div className="text-center">
                  <p className="text-white/40 text-[9px] uppercase tracking-wider">Fim</p>
                  <p className="text-white text-lg font-bold font-display">{minutesToTime(timeRange[1])}</p>
                </div>
              </div>
              <div className="relative">
                <Slider value={timeRange} onValueChange={(val) => setTimeRange(val)} min={MIN_MINUTES} max={MAX_MINUTES} step={5} minStepsBetweenThumbs={6} className="w-full" />
                {/* Faixas ocupadas sobrepostas à trilha */}
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden">
                  {busyRanges.map((r, i) => {
                    const total = MAX_MINUTES - MIN_MINUTES;
                    const left = Math.max(0, (r.start - MIN_MINUTES) / total) * 100;
                    const right = Math.min(1, (r.end - MIN_MINUTES) / total) * 100;
                    const width = Math.max(0, right - left);
                    if (width <= 0) return null;
                    return (
                      <div
                        key={i}
                        title={`Ocupado ${minutesToTime(r.start)}–${minutesToTime(r.end)}`}
                        className="absolute top-0 bottom-0"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: "repeating-linear-gradient(45deg, hsla(0,85%,60%,0.85) 0 4px, hsla(0,85%,45%,0.85) 4px 8px)",
                          boxShadow: "0 0 6px hsla(0,90%,55%,0.6)",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between text-[8px] text-white/30 px-0.5">
                <span>06:00</span><span>10:00</span><span>14:00</span><span>18:00</span><span>23:00</span>
              </div>
              {busyRanges.length > 0 && (
                <p className="text-[9px] text-white/60 text-center">
                  <span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: "repeating-linear-gradient(45deg, hsla(0,85%,60%,1) 0 2px, hsla(0,85%,45%,1) 2px 4px)" }} />
                  Faixas em vermelho já estão agendadas
                </p>
              )}
            </div>
            <p className="text-white/40 text-[10px] text-center">Duração: <span className="text-white font-semibold">{minutesToTime(timeRange[1] - timeRange[0]).replace(":", "h ")}min</span></p>
          </div>
        )}

        {/* Padrão mode */}
        {timeMode === "padrao" && (
          <div className="space-y-2 animate-fade-in">
            <div className="flex gap-2">
              {([
                { key: "manha" as Turno, label: "Manhã" },
                { key: "tarde" as Turno, label: "Tarde" },
                { key: "noite" as Turno, label: "Noite" },
              ]).map((t) => (
                <button key={t.key} onClick={() => { setTurno(t.key); setSelectedSlots([]); }}
                  style={{ ...sectorBtnStyle(color, turno === t.key, glowEnabled), borderRadius: 14, fontFamily: font.family }}
                  className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 hover:brightness-125">
                  {t.label}
                </button>
              ))}
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-3 space-y-1.5">
              <div className={`grid gap-1 ${turno === "noite" ? "grid-cols-4" : "grid-cols-5"}`}>
                {currentSlots.map((slot) => {
                  const isSelected = selectedSlots.includes(slot.value);
                  const isBusy = busySlotValues.has(slot.value);
                  return (
                    <button key={slot.value} onClick={() => toggleSlot(slot.value)}
                      style={{ ...sectorBtnStyle(color, isSelected, glowEnabled), borderRadius: 12, fontFamily: font.family, position: "relative" }}
                      className="flex flex-col items-center gap-0.5 py-1.5 px-1 transition-all text-center active:scale-95 hover:brightness-125">
                      {isBusy && (
                        <span
                          className="pointer-events-none absolute inset-0 rounded-[12px]"
                          title="Já agendado"
                          style={{
                            background: "repeating-linear-gradient(45deg, hsla(0,85%,55%,0.55) 0 4px, hsla(0,85%,40%,0.55) 4px 8px)",
                            border: "1.5px solid hsla(0,90%,65%,0.9)",
                          }}
                        />
                      )}
                      <Checkbox checked={isSelected} className="h-3 w-3 border-white/40 data-[state=checked]:bg-white data-[state=checked]:border-white data-[state=checked]:text-black" />
                      <span className="text-[8px] font-bold whitespace-nowrap text-white relative">{slot.label}</span>
                      <span className="text-[6px] text-white/70 whitespace-nowrap relative">{slot.range}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom button */}
      {hasTime && (
        <div className="relative z-10 px-4 pb-4 pt-2 animate-fade-in">
          <Button
            size="lg"
            className="w-full rounded-2xl h-14 text-base font-bold bg-primary hover:bg-primary/90"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Confirmar Agendamento"}
          </Button>
        </div>
      )}
    </div>
  );
}
