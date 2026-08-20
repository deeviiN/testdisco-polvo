import { useState, useEffect } from "react";
import { toProperCase } from "@/lib/properCase";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { validateSubject } from "@/lib/validateSubject";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, CalendarRange, Search, Monitor, Tv, Volume2, Mic, Laptop, Laptop2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllHolidaysForYear, getHolidayForDate, isWeekend, loadCustomHolidays } from "@/lib/holidays";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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

const DISCIPLINAS_FUNDAMENTAL = [
  "Língua Portuguesa", "Matemática", "Ciências", "História", "Geografia",
  "Arte", "Educação Física", "Ensino Religioso", "Língua Inglesa",
  "Sala de Vídeo", "Eletiva", "Redação",
];
const DISCIPLINAS_MEDIO = [
  "Língua Portuguesa", "Matemática", "Física", "Química", "Biologia",
  "História", "Geografia", "Filosofia", "Sociologia", "Língua Inglesa",
  "Língua Espanhola", "Arte", "Educação Física", "Sala de Vídeo",
  "Eletiva", "Redação", "Literatura",
];
const SERIES_FUNDAMENTAL = ["6º ano", "7º ano", "8º ano", "9º ano"];
const SERIES_MEDIO = ["1º ano", "2º ano", "3º ano"];

const EVENT_TYPES = [
  { id: "aula", label: "Aula" },
  { id: "palestra", label: "Palestra" },
  { id: "reuniao", label: "Reunião" },
  { id: "evento_externo", label: "Evento Externo" },
];

const RESOURCES = [
  { id: "data_show", label: "Data Show", icon: Monitor },
  { id: "tv", label: "TV", icon: Tv },
  { id: "caixa_som", label: "Caixa de Som", icon: Volume2 },
  { id: "microfone", label: "Microfone", icon: Mic },
  { id: "notebook_escola", label: "Notebook da Escola", icon: Laptop },
  { id: "notebook_professor", label: "Notebook do Professor", icon: Laptop2 },
];

type Turno = "manha" | "tarde" | "noite";
type SchoolLevel = "fundamental" | "medio";
type Step = "select-days" | "select-times" | "details" | "confirm";

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function MultiBooking() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { user, profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [step, setStep] = useState<Step>("select-days");

  // Per-day time selections: Map<dateStr, string[]>
  const [dayTimes, setDayTimes] = useState<Record<string, string[]>>({});
  const [turno, setTurno] = useState<Turno>("manha");

  // Booking details (same for all days)
  const [eventType, setEventType] = useState("aula");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("fundamental");
  const [discipline, setDiscipline] = useState("");
  const [disciplineOpen, setDisciplineOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [grade, setGrade] = useState("");
  const [gradeOpen, setGradeOpen] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [description, setDescription] = useState("");
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [visitorName, setVisitorName] = useState("");
  const [visitorInfo, setVisitorInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [schoolName, setSchoolName] = useState("");

  const customHolidays = loadCustomHolidays();
  const allHolidays = getAllHolidaysForYear(currentMonth.getFullYear(), customHolidays);

  useEffect(() => {
    if (!profile?.school_id) return;
    supabase.from("schools").select("name").eq("id", profile.school_id).single().then(({ data }) => {
      if (data) setSchoolName(data.name);
    });
  }, [profile?.school_id]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = (getDay(monthStart) + 6) % 7;
  const paddedDays: (Date | null)[] = [...Array(startDow).fill(null), ...daysInMonth];
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);

  const toggleDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setSelectedDates(prev => {
      const exists = prev.some(d => format(d, "yyyy-MM-dd") === dateStr);
      if (exists) {
        const newDayTimes = { ...dayTimes };
        delete newDayTimes[dateStr];
        setDayTimes(newDayTimes);
        return prev.filter(d => format(d, "yyyy-MM-dd") !== dateStr);
      }
      return [...prev, date].sort((a, b) => a.getTime() - b.getTime());
    });
  };

  const isSelected = (date: Date) => selectedDates.some(d => format(d, "yyyy-MM-dd") === format(date, "yyyy-MM-dd"));

  const getSlots = () => {
    if (turno === "manha") return MORNING_SLOTS;
    if (turno === "tarde") return AFTERNOON_SLOTS;
    return NIGHT_SLOTS;
  };

  const toggleDayTime = (dateStr: string, timeValue: string) => {
    setDayTimes(prev => {
      const current = prev[dateStr] || [];
      const exists = current.includes(timeValue);
      return {
        ...prev,
        [dateStr]: exists ? current.filter(t => t !== timeValue) : [...current, timeValue],
      };
    });
  };

  const allDaysHaveTimes = selectedDates.every(d => (dayTimes[format(d, "yyyy-MM-dd")] || []).length > 0);

  const topicCheck = validateSubject(topic);

  const handleSubmit = async () => {
    if (!profile || !user) return;

    if (!topicCheck.valid) {
      toast.error(topicCheck.message);
      return;
    }
    setLoading(true);

    let gestorCommunique: string | null = null;
    if (eventType === "evento_externo" && selectedDates.length > 0) {
      const firstDate = format(selectedDates[0], "yyyy-MM-dd");
      const firstTimes = (dayTimes[firstDate] || []).sort();
      if (firstTimes.length > 0) {
        const { generateGestorCommunique } = await import("@/lib/generateGestorCommunique");
        gestorCommunique = await generateGestorCommunique({
          topic, description, visitorName, visitorInfo,
          sector: "projeto_vida",
          bookingDate: firstDate,
          startTime: firstTimes[0],
          endTime: firstTimes[firstTimes.length - 1],
          requesterName: profile?.full_name || "",
        });
      }
    }

    const bookings = selectedDates.flatMap(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const times = (dayTimes[dateStr] || []).sort();
      if (times.length === 0) return [];
      return [{
        school_id: profile.school_id,
        user_id: user.id,
        booking_date: dateStr,
        start_time: times[0],
        end_time: times[times.length - 1],
        description: description || null,
        discipline: discipline || null,
        topic: topic || null,
        event_type: eventType,
        visitor_name: visitorName || null,
        visitor_info: visitorInfo || null,
        resources: selectedResources.length > 0 ? selectedResources : [],
        gestor_communique: gestorCommunique,
      }];
    });

    if (bookings.length === 0) {
      toast.error("Nenhum agendamento para criar");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("bookings").insert(bookings as any);
    if (error) {
      toast.error("Erro ao agendar: " + error.message);
    } else {
      toast.success(`${bookings.length} agendamento(s) criado(s)! 🎉`);
      navigate("/home");
    }
    setLoading(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b shrink-0">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-3">
          <button onClick={goBack} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-sm font-bold font-display leading-tight">Agendamento Múltiplo</h1>
              <p className="text-[9px] text-muted-foreground">{schoolName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-3 flex flex-col">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5">
          {["Dias", "Tempos", "Detalhes", "Confirmar"].map((label, i) => {
            const stepKeys: Step[] = ["select-days", "select-times", "details", "confirm"];
            const isActive = stepKeys.indexOf(step) >= i;
            return (
              <div key={label} className="flex items-center gap-1">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}
                </div>
                <span className={cn("text-[9px] font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                {i < 3 && <div className={cn("w-4 h-0.5 rounded-full", isActive ? "bg-primary" : "bg-muted")} />}
              </div>
            );
          })}
        </div>

        {/* ========== STEP 1: Select days ========== */}
        {step === "select-days" && (
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-bold font-display">
                  {MONTHS_PT[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h2>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {paddedDays.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />;
                  const isPast = day < today;
                  const isHoliday = !!getHolidayForDate(day, allHolidays);
                  const isWknd = isWeekend(day);
                  const selected = isSelected(day);

                  return (
                    <button
                      key={format(day, "yyyy-MM-dd")}
                      onClick={() => !isPast && toggleDate(day)}
                      disabled={isPast}
                      className={cn(
                        "w-full aspect-square rounded-lg text-xs font-semibold transition-all relative",
                        isPast && "opacity-30 cursor-not-allowed",
                        !isPast && !selected && "hover:bg-primary/10",
                        selected && "bg-primary text-primary-foreground shadow-md",
                        !selected && isHoliday && "text-destructive bg-destructive/10",
                        !selected && isWknd && !isHoliday && "text-[hsl(30,90%,65%)]",
                      )}
                    >
                      {day.getDate()}
                      {selected && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary-foreground flex items-center justify-center">
                          <Check className="h-2 w-2 text-primary" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                <span className="font-bold text-primary">{selectedDates.length}</span> dia{selectedDates.length !== 1 ? "s" : ""} selecionado{selectedDates.length !== 1 ? "s" : ""}
              </p>

              <Button
                onClick={() => setStep("select-times")}
                disabled={selectedDates.length === 0}
                className="w-full rounded-xl gradient-primary text-primary-foreground border-0 h-11 font-bold"
              >
                Avançar — Escolher Tempos
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ========== STEP 2: Per-day time selection ========== */}
        {step === "select-times" && (
          <div className="flex flex-col flex-1 min-h-0">
            <Card className="border-0 shadow-card flex-1 min-h-0 flex flex-col">
              <CardContent className="p-3 flex flex-col flex-1 min-h-0 gap-2">
                {/* Turno selector */}
                <div className="shrink-0">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Turno</Label>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {([["manha", "☀️ Manhã"], ["tarde", "🌤️ Tarde"], ["noite", "🌙 Noite"]] as [Turno, string][]).map(([t, label]) => (
                      <Button
                        key={t}
                        type="button"
                        variant={turno === t ? "default" : "outline"}
                        size="sm"
                        className={cn("rounded-xl text-xs h-9", turno === t && "gradient-primary text-primary-foreground border-0")}
                        onClick={() => { setTurno(t); setDayTimes({}); }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Days with time columns — fills remaining space */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  <div className="space-y-2">
                    {selectedDates.map(date => {
                      const dateStr = format(date, "yyyy-MM-dd");
                      const dateTimes = dayTimes[dateStr] || [];
                      return (
                        <div key={dateStr} className="bg-muted/30 rounded-xl p-2">
                          <p className="text-xs font-bold text-center mb-1.5">
                            📅 {format(date, "dd/MM (EEEE)", { locale: ptBR })}
                          </p>
                          <div className="flex gap-1 justify-center">
                            {getSlots().map(slot => {
                              const isActive = dateTimes.includes(slot.value);
                              return (
                                <label
                                  key={slot.value}
                                  className={`flex flex-col items-center justify-center gap-0 p-1 rounded-lg cursor-pointer transition-all text-center flex-1 min-w-0 ${
                                    isActive
                                      ? "bg-primary/15 border-2 border-primary/40 shadow-sm"
                                      : "bg-secondary/50 border-2 border-transparent hover:bg-secondary/80"
                                  }`}
                                >
                                  <Checkbox
                                    checked={isActive}
                                    onCheckedChange={() => toggleDayTime(dateStr, slot.value)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="text-[10px] font-bold leading-tight whitespace-nowrap">{slot.label}</span>
                                  <span className="text-[8px] text-muted-foreground font-medium leading-tight whitespace-nowrap">{slot.range}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Buttons fixed at bottom */}
            <div className="shrink-0 flex gap-2 pt-2 pb-1">
              <Button variant="outline" onClick={() => setStep("select-days")} className="flex-1 rounded-xl h-11">
                Voltar
              </Button>
              <Button
                onClick={() => setStep("details")}
                disabled={!allDaysHaveTimes}
                className="flex-1 rounded-xl gradient-primary text-primary-foreground border-0 h-11 font-bold"
              >
                Avançar — Detalhes
              </Button>
            </div>
          </div>
        )}

        {/* ========== STEP 3: Full booking details (same as Dashboard) ========== */}
        {step === "details" && (
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 space-y-2">
              <h3 className="text-sm font-bold font-display text-center">Detalhes do Agendamento</h3>

              {/* Event type */}
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo de Evento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full h-9 justify-between rounded-xl border-0 text-xs font-medium transition-all duration-300 mt-0.5",
                        eventType ? "gradient-primary text-primary-foreground shadow-glow" : "bg-accent text-accent-foreground"
                      )}
                    >
                      {EVENT_TYPES.find(t => t.id === eventType)?.label || "Selecione o tipo"}
                      <Search className={cn("ml-2 h-3 w-3 shrink-0", eventType ? "opacity-80" : "opacity-50")} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandList>
                        <CommandGroup>
                          {EVENT_TYPES.map((t) => (
                            <CommandItem key={t.id} value={t.label} onSelect={() => setEventType(t.id)}>
                              {t.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Visitor fields for palestra/evento_externo */}
              {(eventType === "palestra" || eventType === "evento_externo") && (
                <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-accent/10 border border-accent/20">
                  <div>
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> Visitante
                    </Label>
                    <input type="text" value={visitorName} onChange={(e) => setVisitorName(toProperCase(e.target.value))} placeholder="Ex: João Silva"
                      className="flex h-8 w-full rounded-lg bg-background border-0 px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Instituição</Label>
                    <input type="text" value={visitorInfo} onChange={(e) => setVisitorInfo(toProperCase(e.target.value))} placeholder="Ex: Empresa XYZ"
                      className="flex h-8 w-full rounded-lg bg-background border-0 px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-0.5" />
                  </div>
                </div>
              )}

              {/* School level */}
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nível de Ensino</Label>
                <div className="flex gap-1.5 mt-0.5">
                  <Button type="button" variant={schoolLevel === "fundamental" ? "default" : "outline"}
                    className={`flex-1 h-8 rounded-xl text-xs font-semibold transition-all ${schoolLevel === "fundamental" ? "gradient-primary text-primary-foreground shadow-glow border-0" : ""}`}
                    onClick={() => { setSchoolLevel("fundamental"); setDiscipline(""); setGrade(""); setClassCode(""); }}>
                    Fundamental
                  </Button>
                  <Button type="button" variant={schoolLevel === "medio" ? "default" : "outline"}
                    className={`flex-1 h-8 rounded-xl text-xs font-semibold transition-all ${schoolLevel === "medio" ? "gradient-primary text-primary-foreground shadow-glow border-0" : ""}`}
                    onClick={() => { setSchoolLevel("medio"); setDiscipline(""); setGrade(""); setClassCode(""); }}>
                    Médio
                  </Button>
                </div>
              </div>

              {/* Discipline + Topic */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Disciplina</Label>
                  <Popover open={disciplineOpen} onOpenChange={setDisciplineOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox"
                        className={cn("w-full h-8 justify-between rounded-xl border-0 text-xs font-medium transition-all duration-300 mt-0.5",
                          discipline ? "gradient-primary text-primary-foreground shadow-glow" : "bg-secondary/50 text-muted-foreground font-normal")}>
                        <span className="truncate">{discipline || "Selecione"}</span>
                        <Search className={cn("ml-1 h-3 w-3 shrink-0", discipline ? "opacity-80" : "opacity-50")} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar disciplina..." />
                        <CommandList className="max-h-[200px] overflow-y-auto overscroll-contain touch-pan-y">
                          <CommandEmpty>Nenhuma disciplina encontrada.</CommandEmpty>
                          <CommandGroup>
                            {(schoolLevel === "fundamental" ? DISCIPLINAS_FUNDAMENTAL : DISCIPLINAS_MEDIO).map((d) => (
                              <CommandItem key={d} value={d} onSelect={() => { setDiscipline(d); setDisciplineOpen(false); }}>
                                {d}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tema / Assunto <span className="text-destructive">*</span></Label>
                  <input type="text" value={topic} onChange={(e) => setTopic(toProperCase(e.target.value))} placeholder="Ex: Autoconhecimento"
                    className={`flex h-8 w-full rounded-lg border px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-0.5 ${!topicCheck.valid && topic.length > 0 ? "border-destructive bg-destructive/5" : "bg-secondary/50 border-0"}`} />
                  {!topicCheck.valid && topic.length > 0 && (
                    <p className="text-destructive text-[9px] mt-0.5">{topicCheck.message}</p>
                  )}
                </div>
              </div>

              {/* Grade + Class */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Série / Ano</Label>
                  <Popover open={gradeOpen} onOpenChange={setGradeOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox"
                        className={cn("w-full h-8 justify-between rounded-xl border-0 text-xs font-medium transition-all duration-300 mt-0.5",
                          grade ? "gradient-primary text-primary-foreground shadow-glow" : "bg-secondary/50 text-muted-foreground font-normal")}>
                        {grade || "Selecione"}
                        <Search className={cn("ml-1 h-3 w-3 shrink-0", grade ? "opacity-80" : "opacity-50")} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[220px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar série..." />
                        <CommandList className="max-h-[200px] overflow-y-auto overscroll-contain touch-pan-y">
                          <CommandEmpty>Nenhuma série encontrada.</CommandEmpty>
                          <CommandGroup>
                            {(schoolLevel === "fundamental" ? SERIES_FUNDAMENTAL : SERIES_MEDIO).map((s) => (
                              <CommandItem key={s} value={s} onSelect={() => { setGrade(s); setGradeOpen(false); }}>
                                {s}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Turma</Label>
                  <input type="text" value={classCode}
                    onChange={(e) => {
                      const digits = schoolLevel === "fundamental" ? 2 : 3;
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      const groups: string[] = [];
                      for (let i = 0; i < raw.length; i += digits) groups.push(raw.slice(i, i + digits));
                      setClassCode(groups.join(", "));
                    }}
                    placeholder={schoolLevel === "fundamental" ? "Ex: 81, 82" : "Ex: 101, 102"}
                    className="flex h-8 w-full rounded-lg bg-secondary/50 border-0 px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-0.5" />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Descrição <span className="font-normal normal-case">(opcional)</span>
                </Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Empréstimo de furadeira - Sala 9"
                  className="rounded-lg bg-secondary/50 border-0 resize-none text-xs mt-0.5 min-h-0" rows={1} />
              </div>

              {/* Resources */}
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recursos</Label>
                <div className="grid grid-cols-3 gap-1 mt-0.5">
                  {RESOURCES.map((resource) => {
                    const Icon = resource.icon;
                    const isChecked = selectedResources.includes(resource.id);
                    return (
                      <label key={resource.id}
                        className={`flex flex-col items-center gap-0 p-1 rounded-lg cursor-pointer transition-all text-center ${
                          isChecked ? "bg-primary/10 ring-1 ring-primary/30" : "bg-secondary/50 hover:bg-secondary/80"
                        }`}>
                        <Checkbox checked={isChecked}
                          onCheckedChange={(checked) => {
                            setSelectedResources(prev => checked ? [...prev, resource.id] : prev.filter(r => r !== resource.id));
                          }}
                          className="h-3 w-3" />
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-[9px] font-medium leading-tight">{resource.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("select-times")} className="flex-1 rounded-xl h-11">Voltar</Button>
                <Button onClick={() => setStep("confirm")} className="flex-1 rounded-xl gradient-primary text-primary-foreground border-0 h-11 font-bold">
                  Revisar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========== STEP 4: Confirm ========== */}
        {step === "confirm" && (
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 space-y-3">
              <h3 className="text-sm font-bold font-display text-center">Resumo do Agendamento</h3>

              <ScrollArea className="max-h-[40dvh]">
                <div className="space-y-2">
                  {selectedDates.map(date => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const times = (dayTimes[dateStr] || []).sort();
                    return (
                      <div key={dateStr} className="bg-primary/5 rounded-xl p-2">
                        <p className="text-[11px] font-bold">📅 {format(date, "dd/MM (EEEE)", { locale: ptBR })}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {times.map(time => {
                            const slot = getSlots().find(s => s.value === time);
                            return (
                              <span key={time} className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                {slot?.label} ({slot?.range})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Details summary */}
              <div className="bg-muted/30 rounded-xl p-2 space-y-0.5 text-[11px]">
                <p><span className="font-bold">Evento:</span> {EVENT_TYPES.find(t => t.id === eventType)?.label}</p>
                {discipline && <p><span className="font-bold">Disciplina:</span> {discipline}</p>}
                {topic && <p><span className="font-bold">Tema:</span> {topic}</p>}
                {grade && <p><span className="font-bold">Série:</span> {grade}</p>}
                {classCode && <p><span className="font-bold">Turma:</span> {classCode}</p>}
                {selectedResources.length > 0 && (
                  <p><span className="font-bold">Recursos:</span> {selectedResources.map(r => RESOURCES.find(res => res.id === r)?.label).join(", ")}</p>
                )}
              </div>

              <div className="text-center py-1">
                <p className="text-lg font-bold text-primary font-display">{selectedDates.length}</p>
                <p className="text-[10px] text-muted-foreground">agendamento{selectedDates.length !== 1 ? "s" : ""} {selectedDates.length !== 1 ? "serão criados" : "será criado"}</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("details")} className="flex-1 rounded-xl h-11">Voltar</Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1 rounded-xl gradient-primary text-primary-foreground border-0 h-11 font-bold">
                  {loading ? "Agendando..." : "Confirmar Agendamentos"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
