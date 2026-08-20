import { useState, useEffect } from "react";
import { toProperCase } from "@/lib/properCase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, CalendarDays, Globe, Handshake, UserCheck, GraduationCap, Users, Monitor, Tv, Volume2, Mic, Laptop, Laptop2, Info, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { validateSubject } from "@/lib/validateSubject";
import { supabase } from "@/integrations/supabase/client";
import { useSectorPreferences, type ColorOption } from "@/hooks/useSectorPreferences";

// Estilo de botão idêntico aos setores: gradiente radial + brilho/halo
function sectorButtonStyle(c: ColorOption, isSelected: boolean): React.CSSProperties {
  const background = isSelected
    ? `radial-gradient(circle at 30% 25%, hsla(${c.hueA}, ${c.satA + 10}%, ${c.lightA + 12}%, 1) 0%, hsla(${c.hueB}, ${c.satB + 5}%, ${c.lightB + 6}%, 1) 60%, hsla(${c.hueC}, ${c.satC + 10}%, ${c.lightC + 4}%, 1) 100%)`
    : `linear-gradient(145deg, hsla(${c.hueA}, ${c.satA}%, ${c.lightA}%, 1), hsla(${c.hueB}, ${c.satB}%, ${c.lightB}%, 1))`;
  const boxShadow = isSelected
    ? `0 0 0 3px hsla(${c.hueA}, 95%, 75%, 1), 0 0 30px hsla(${c.hueA}, 90%, 60%, 0.85), 0 0 60px hsla(${c.hueA}, 85%, 55%, 0.6), 0 6px 20px hsla(${c.hueC}, 70%, 10%, 0.6)`
    : `inset 0 1.5px 5px hsla(${c.hueA}, 90%, 75%, 0.35), inset 0 -2px 8px hsla(${c.hueC}, 85%, 5%, 0.55), 0 0 14px hsla(${c.hueA}, 80%, 50%, 0.35), 0 6px 18px hsla(${c.hueC}, 80%, 5%, 0.7)`;
  const border = isSelected
    ? `2.5px solid hsla(${c.hueA}, 95%, 75%, 0.9)`
    : `1.5px solid hsla(${c.hueA}, 90%, 70%, 0.55)`;
  return { background, boxShadow, border, color: "white", textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" };
}

const eventTypes = [
  { key: "outros", label: "Evento Escolar", icon: CalendarDays },
  { key: "evento_externo", label: "Evento Externo", icon: Globe },
  { key: "reuniao", label: "Reuniões", icon: Handshake },
  { key: "aula", label: "Aula", icon: GraduationCap },
  { key: "palestra", label: "Palestra", icon: Users },
];

// Conjunto unificado: mesmos botões para Evento Escolar e Evento Externo
const unifiedEventSet = {
  main: "Palestra",
  main2: "Evento esportivo",
  grid: [
    "Reuniões",
    "Aula",
    "Prova / Avaliação",
    "Evento\ncultural",
    "Apresentação",
    "Treinamento",
    "Workshop",
    "Seminário",
    "Congresso",
    "Oficina",
  ],
  extra: "Outros",
} as const;

const eventOptions = {
  escolar: unifiedEventSet,
  externo: unifiedEventSet,
} as const;

const reuniaoAudiences = [
  { key: "funcionarios", label: "Funcionários / Servidores", icon: UserCheck },
  { key: "alunos", label: "Alunos", icon: GraduationCap },
  { key: "pais", label: "Pais / Responsáveis", icon: Users },
];

const schoolDepartments = [
  "Gestão", "Secretaria", "Coordenação", "Multifuncional", "Orientação",
  "Fanfarra", "Biblioteca", "Lab de Ciências", "Sala dos Professores",
  "Sala de Vídeo", "Limpeza", "Copa", "Corpo de Alunos", "Professores", "Porteiros",
];

const shiftOptions = [
  { key: "manha", label: "Manhã" },
  { key: "tarde", label: "Tarde" },
  { key: "noite", label: "Noite" },
];

const RESOURCES = [
  { id: "data_show", label: "Data Show", icon: Monitor },
  { id: "tv", label: "TV", icon: Tv },
  { id: "caixa_som", label: "Caixa de Som", icon: Volume2 },
  { id: "microfone", label: "Microfone", icon: Mic },
  { id: "notebook_escola", label: "Notebook da Escola", icon: Laptop },
  { id: "notebook_professor", label: "Notebook do Professor", icon: Laptop2 },
];
const ensinoOptions = [
  { key: "fundamental", label: "Ensino Fundamental" },
  { key: "medio", label: "Ensino Médio" },
  { key: "eja", label: "EJA" },
];

const seriesFundamental = ["6º ano", "7º ano", "8º ano", "9º ano"];
const seriesMedio = ["1º ano", "2º ano", "3º ano"];
const seriesEja = ["EJA 1", "EJA 2", "EJA 3", "EJA 4"];

export default function QuadraBooking() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const [searchParams] = useSearchParams();
  const { color } = useSectorPreferences();
  const bookingMode = searchParams.get("mode") === "multi" ? "multi" : "single";
  const sector = searchParams.get("sector") || "quadra";

  // Restore selections from URL params
  const initEvent = searchParams.get("event");
  const initAudience = searchParams.get("audience");
  const initDepartment = searchParams.get("department") || "";
  const initName = searchParams.get("name") || "";
  const initDepts = initDepartment === "Todos" ? [...schoolDepartments] : initDepartment ? initDepartment.split(",") : [];
  const initEnsino = searchParams.get("ensino") || "";
  const initEnsinoList = initEnsino === "Todos" ? ensinoOptions.map(e => e.key) : initEnsino ? initEnsino.split(",") : [];
  const initSeries = searchParams.get("series") || "";
  const initSeriesList = initSeries ? initSeries.split(",") : [];
  const initTurmas = searchParams.get("turmas") || "";

  const [selectedEvent, setSelectedEvent] = useState<string | null>(initEvent);
  const [showExternoDialog, setShowExternoDialog] = useState(false);
  const [subOptionsCategory, setSubOptionsCategory] = useState<"escolar" | "externo" | null>(null);
  const initSubOption = searchParams.get("subOption") || "";
  const [selectedSubOption, setSelectedSubOption] = useState<string>(initSubOption);
  const [selectedAudience, setSelectedAudience] = useState<string | null>(initAudience);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(initDepts);
  const [allDepartments, setAllDepartments] = useState(initDepartment === "Todos");
  const [eventName, setEventName] = useState(initName);

  // Alunos state
  const [selectedEnsino, setSelectedEnsino] = useState<string[]>(initEnsinoList);
  const [allEnsino, setAllEnsino] = useState(initEnsino === "Todos");
  const [selectedSeries, setSelectedSeries] = useState<string[]>(initSeriesList);
  const [turmas, setTurmas] = useState(initTurmas);

  // Resources state
  const initResources = searchParams.get("resources") || "";
  const initResourcesList = initResources ? initResources.split(",") : [];
  const [selectedResources, setSelectedResources] = useState<string[]>(initResourcesList);

  // Shift state
  const initShift = searchParams.get("shift") || "";
  const initShiftList = initShift ? initShift.split(",") : [];
  const [selectedShifts, setSelectedShifts] = useState<string[]>(initShiftList);

  // Today's bookings alert
  const [todayCount, setTodayCount] = useState(0);
  const [showTodayDialog, setShowTodayDialog] = useState(false);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);

  useEffect(() => {
    const fetchToday = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("bookings")
        .select("id, start_time, end_time, description, event_type, topic, sector, status")
        .eq("booking_date", today)
        .eq("sector", sector)
        .eq("status", "confirmed");
      if (data) {
        setTodayCount(data.length);
        setTodayBookings(data);
      }
    };
    fetchToday();
  }, [sector]);

  const needsDepartment = (selectedEvent === "reuniao" || selectedEvent === "outros" || selectedEvent === "aula" || selectedEvent === "palestra") && selectedAudience === "funcionarios";
  const needsAlunos = (selectedEvent === "reuniao" || selectedEvent === "outros" || selectedEvent === "aula" || selectedEvent === "palestra") && selectedAudience === "alunos";
  const hasDepartment = allDepartments || selectedDepartments.length > 0;
  const hasAlunos = allEnsino || selectedEnsino.length > 0;

  const sectorDisplayName = sector === "quadra" ? "Quadra Escolar" : sector === "informatica" ? "Informática" : sector === "patio" ? "Pátio" : sector === "sala_professores" ? "Sala dos Professores" : sector === "projeto_vida" ? "Sala de Vídeo" : "este espaço";

  const handleSelectEvent = (key: string) => {
    setSelectedEvent(key);
    if (key === "evento_externo") {
      setShowExternoDialog(true);
      setSubOptionsCategory("externo");
    } else if (key === "outros") {
      setSubOptionsCategory("escolar");
    } else {
      setSubOptionsCategory(null);
    }
    setSelectedSubOption("");
    if (key !== "reuniao" && key !== "outros" && key !== "aula" && key !== "palestra") {
      setSelectedAudience(null); setSelectedDepartments([]); setAllDepartments(false); setSelectedEnsino([]); setAllEnsino(false); setSelectedSeries([]); setTurmas("");
    }
  };

  const isReadyToShow = selectedEvent && ((selectedEvent !== "reuniao" && selectedEvent !== "outros" && selectedEvent !== "aula" && selectedEvent !== "palestra") || selectedAudience) && (!needsDepartment || hasDepartment) && (!needsAlunos || hasAlunos);

  const getNamePlaceholder = () => {
    switch (selectedEvent) {
      case "esportivo": return "Ex: Campeonato de Futsal";
      case "outros": return "Ex: Feira de Ciências";
      case "evento_externo": return "Ex: Palestra sobre saúde";
      case "reuniao": return "Ex: Reunião de pais do 9º ano";
      default: return "Nome do evento";
    }
  };

  const getNameLabel = () => {
    switch (selectedEvent) {
      case "esportivo": return "Nome do evento esportivo";
      case "outros": return "Nome do evento";
      case "evento_externo": return "Nome do evento externo";
      case "reuniao": return "Assunto da reunião";
      default: return "Nome do assunto";
    }
  };

  const getAvailableSeries = () => {
    if (allEnsino || selectedEnsino.length > 1) return [];
    if (selectedEnsino.includes("fundamental")) return seriesFundamental;
    if (selectedEnsino.includes("medio")) return seriesMedio;
    if (selectedEnsino.includes("eja")) return seriesEja;
    return [];
  };

  const subjectCheck = validateSubject(eventName);

  const handleAdvance = () => {
    if (!subjectCheck.valid) {
      toast.error(subjectCheck.message);
      return;
    }
    const params = new URLSearchParams();
    params.set("mode", bookingMode);
    params.set("sector", sector);
    if (selectedEvent) params.set("event", selectedEvent);
    if (selectedSubOption) params.set("subOption", selectedSubOption);
    if (selectedAudience) params.set("audience", selectedAudience);
    if (allDepartments) {
      params.set("department", "Todos");
    } else if (selectedDepartments.length > 0) {
      params.set("department", selectedDepartments.join(","));
    }
    if (allEnsino) {
      params.set("ensino", "Todos");
    } else if (selectedEnsino.length > 0) {
      params.set("ensino", selectedEnsino.join(","));
    }
    if (selectedSeries.length > 0) params.set("series", selectedSeries.join(","));
    if (turmas) params.set("turmas", turmas);
    if (eventName) params.set("name", eventName);
    if (selectedShifts.length > 0) params.set("shift", selectedShifts.join(","));
    if (selectedResources.length > 0) params.set("resources", selectedResources.join(","));
    console.log("[QuadraBooking] avançando com recursos:", selectedResources, "URL:", params.toString());
    navigate(`/booking/quadra/data?${params.toString()}`);
  };

  return (
    <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 60%, 8%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(220, 70%, 20%, 0.6) 0%, hsla(215, 65%, 28%, 0.55) 40%, hsla(225, 60%, 25%, 0.6) 100%)" }} />

      {/* Header */}
      <div className="relative z-10 flex flex-col gap-2 px-4 pt-3 pb-2 mx-auto w-full max-w-md">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-base font-display font-bold text-white tracking-tight break-words">
              {sector === "quadra" ? "Quadra Escolar" : sector === "informatica" ? "Informática" : sector === "patio" ? "Pátio" : sector === "sala_professores" ? "Sala dos Professores" : sector === "projeto_vida" ? "Sala de Vídeo" : "Agendamento"}
            </h1>
            <p className="text-white/40 text-[10px]">{bookingMode === "single" ? "Agendamento Único" : "Agendamento Múltiplo"}</p>
          </div>
          {/* Blinking red alert button for today's bookings */}
          <button
            onClick={() => setShowTodayDialog(true)}
            className="relative w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all"
          >
            <Bell className="h-5 w-5" />
            {todayCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse shadow-lg shadow-destructive/50">
                {todayCount}
              </span>
            )}
            {todayCount > 0 && (
              <span className="absolute inset-0 rounded-xl border-2 border-destructive animate-pulse opacity-60" />
            )}
          </button>
        </div>
      </div>

      {/* Today's bookings dialog */}
      <Dialog open={showTodayDialog} onOpenChange={setShowTodayDialog}>
        <DialogContent className="max-w-sm [&>button.absolute]:bg-red-500 [&>button.absolute]:hover:bg-red-400 [&>button.absolute]:rounded-lg [&>button.absolute]:w-11 [&>button.absolute]:h-11 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:opacity-100 [&>button.absolute]:border [&>button.absolute]:border-white/30 [&>button.absolute]:shadow-[0_0_12px_hsla(0,90%,60%,0.55)] [&>button.absolute]:!right-0 [&>button.absolute]:!top-0 [&>button.absolute>svg]:!h-7 [&>button.absolute>svg]:!w-7 [&>button.absolute>svg]:text-white [&>button.absolute>svg]:stroke-[3]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-destructive" />
              Agendamentos de Hoje ({todayCount})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {todayBookings.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum agendamento para hoje neste setor.</p>
            ) : (
              todayBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
                  <div className="w-[60px] text-xs font-bold text-primary shrink-0">
                    {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{b.topic || b.description || b.event_type}</p>
                    <p className="text-xs text-muted-foreground capitalize">{b.event_type?.replace("_", " ")}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTodayDialog(false)} className="w-full">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-24 flex flex-col gap-3">
        {/* Event type */}
        <div className="space-y-2 -mx-2 mt-6">
          <p className="text-white text-lg font-semibold uppercase tracking-wider px-2">Tipo de evento</p>
          <div className="relative">
            {/* 2x2 grid - tight gaps, rectangular shape preserved */}
            <div className="grid grid-cols-2 gap-2">
              {[eventTypes[3], eventTypes[4], eventTypes[0], eventTypes[1]].map((evt, idx) => {
                const Icon = evt.icon;
                const isSelected = selectedEvent === evt.key;
                // Circular cutout on the inner corner matching the center button
                const cutRadius = 56; // 48px circle radius + 8px spacing
                const maskPositions = [
                  `at calc(100% + 4px) calc(100% + 4px)`,
                  `at calc(0% - 4px) calc(100% + 4px)`,
                  `at calc(100% + 4px) calc(0% - 4px)`,
                  `at calc(0% - 4px) calc(0% - 4px)`,
                ];
                const maskStyle = {
                  WebkitMask: `radial-gradient(circle ${cutRadius}px ${maskPositions[idx]}, transparent 100%, black 100%)`,
                  mask: `radial-gradient(circle ${cutRadius}px ${maskPositions[idx]}, transparent 100%, black 100%)`,
                };
                return (
                  <button key={evt.key} onClick={() => handleSelectEvent(evt.key)}
                    style={{ ...maskStyle, ...sectorButtonStyle(color, isSelected), borderRadius: 18 }}
                    className={`flex flex-col items-center justify-center gap-1.5 p-2 min-h-[80px] transition-all active:scale-95 hover:brightness-125`}>
                    <Icon className="h-10 w-10" style={{ filter: `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))` }} />
                    <span
                      className="text-sm font-bold uppercase tracking-wider text-center leading-tight break-words"
                      style={{
                        transform: idx === 0 ? "translateX(-14px)" : idx === 1 ? "translateX(14px)" : undefined,
                      }}
                    >{evt.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Reuniões - small circle centered at the intersection of the 4 buttons */}
            {(() => {
              const evt = eventTypes[2];
              const Icon = evt.icon;
              const isSelected = selectedEvent === evt.key;
              return (
                <button onClick={() => handleSelectEvent(evt.key)}
                  style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 9999 }}
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center gap-1 w-[104px] h-[104px] transition-all active:scale-95 hover:brightness-125`}>
                  <Icon className="h-9 w-9" style={{ filter: `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))` }} />
                   <span className="text-xs font-bold uppercase tracking-wider text-center leading-none">{evt.label}</span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Sub-opção escolhida (chip + trocar) */}
        {selectedSubOption && (selectedEvent === "outros" || selectedEvent === "evento_externo") && (
          <button
            onClick={() => setSubOptionsCategory(selectedEvent === "outros" ? "escolar" : "externo")}
            className="self-start inline-flex items-center gap-2 rounded-full bg-amber-400/15 border border-amber-300/40 px-3 py-1.5 text-amber-100 text-xs font-bold uppercase tracking-wider hover:bg-amber-400/25 transition animate-fade-in"
          >
            <span>{selectedSubOption}</span>
            <span className="text-amber-200/70 text-[10px] normal-case font-semibold">trocar</span>
          </button>
        )}

        {/* Audience selector for Reunião and Evento Escolar */}
        {(selectedEvent === "reuniao" || selectedEvent === "outros" || selectedEvent === "aula" || selectedEvent === "palestra") && (
          <div className="space-y-1.5 animate-fade-in -mx-2 mt-4">
            <p className="text-white text-lg font-semibold uppercase tracking-wider">{selectedEvent === "reuniao" ? "Reunião com quem?" : selectedEvent === "aula" ? "Aula com quem?" : selectedEvent === "palestra" ? "Palestra com quem?" : "Evento com quem?"}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {reuniaoAudiences.map((aud) => {
                const AudIcon = aud.icon;
                const isSelected = selectedAudience === aud.key;
                return (
                  <button key={aud.key} onClick={() => { setSelectedAudience(aud.key); setSelectedDepartments([]); setAllDepartments(false); setSelectedEnsino([]); setAllEnsino(false); setSelectedSeries([]); setTurmas(""); }}
                    style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 14 }}
                    className={`flex flex-col items-center justify-center gap-1 p-2 min-h-[56px] transition-all active:scale-95 hover:brightness-125`}>
                    <AudIcon className="h-9 w-9" style={{ filter: `drop-shadow(0 0 5px hsla(${color.hueA}, 95%, 70%, 0.6))` }} />
                    <span className="text-sm font-bold uppercase tracking-wider text-center leading-tight break-words">{aud.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Department selector for Funcionários */}
        {needsDepartment && (
          <div className="space-y-2 animate-fade-in -mx-2 mt-4">
            <p className="text-white text-lg font-semibold uppercase tracking-wider">Setor da escola</p>
            
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2.5 mt-2">
              <span className="text-xs font-semibold text-white/80">Todos os setores</span>
              <button
                onClick={() => {
                  const next = !allDepartments;
                  setAllDepartments(next);
                  if (next) setSelectedDepartments([...schoolDepartments]);
                  else setSelectedDepartments([]);
                }}
                className="relative w-11 h-6 rounded-full transition-colors duration-300"
                style={{ background: allDepartments ? "hsl(142, 71%, 45%)" : "hsla(0,0%,100%,0.25)" }}
              >
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300" style={{ transform: allDepartments ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {schoolDepartments.map((dept) => {
                const isSelected = allDepartments || selectedDepartments.includes(dept);
                return (
                  <button key={dept} onClick={() => {
                    if (allDepartments) { setAllDepartments(false); setSelectedDepartments(schoolDepartments.filter((d) => d !== dept)); }
                    else {
                      setSelectedDepartments((prev) => {
                        const next = prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept];
                        if (next.length === schoolDepartments.length) setAllDepartments(true);
                        return next;
                      });
                    }
                  }}
                    style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 14 }}
                    className={`flex items-center justify-center p-2.5 min-h-[48px] transition-all active:scale-95 hover:brightness-125`}>
                    <span className="text-xs font-bold uppercase tracking-wider text-center leading-tight">{dept}</span>
                  </button>
                );
              })}
            </div>
            {/* Shift selector */}
            <div className="space-y-1.5 mt-6">
              <p className="text-white text-lg font-semibold uppercase tracking-wider">Turno</p>
              <div className="grid grid-cols-3 gap-1.5">
                {shiftOptions.map((shift) => {
                  const isSelected = selectedShifts.includes(shift.key);
                  return (
                    <button key={shift.key} onClick={() => {
                      setSelectedShifts((prev) => prev.includes(shift.key) ? prev.filter(k => k !== shift.key) : [...prev, shift.key]);
                    }}
                      style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 14 }}
                      className={`flex items-center justify-center p-2.5 min-h-[48px] transition-all active:scale-95 hover:brightness-125`}>
                      <span className="text-sm font-bold uppercase tracking-wider text-center leading-tight">{shift.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Ensino selector for Alunos */}
        {needsAlunos && (
          <div className="space-y-2 animate-fade-in -mx-2">
            <p className="text-white text-lg font-semibold uppercase tracking-wider">Nível de ensino</p>

            {/* Toggle "Todos" */}
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2.5">
              <span className="text-xs font-semibold text-white/80">Todos os níveis</span>
              <button
                onClick={() => {
                  const next = !allEnsino;
                  setAllEnsino(next);
                  if (next) { setSelectedEnsino(ensinoOptions.map(e => e.key)); setSelectedSeries([]); setTurmas(""); }
                  else { setSelectedEnsino([]); }
                }}
                className="relative w-11 h-6 rounded-full transition-colors duration-300"
                style={{ background: allEnsino ? "hsl(142, 71%, 45%)" : "hsla(0,0%,100%,0.25)" }}
              >
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300" style={{ transform: allEnsino ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            {/* Ensino buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              {ensinoOptions.map((opt) => {
                const isSelected = allEnsino || selectedEnsino.includes(opt.key);
                return (
                  <button key={opt.key} onClick={() => {
                    if (allEnsino) { setAllEnsino(false); setSelectedEnsino(ensinoOptions.map(e => e.key).filter(k => k !== opt.key)); }
                    else {
                      setSelectedEnsino((prev) => {
                        const next = prev.includes(opt.key) ? prev.filter(k => k !== opt.key) : [...prev, opt.key];
                        if (next.length === ensinoOptions.length) { setAllEnsino(true); setSelectedSeries([]); setTurmas(""); }
                        return next;
                      });
                    }
                    setSelectedSeries([]);
                    setTurmas("");
                  }}
                    style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 14 }}
                    className={`flex items-center justify-center p-2.5 min-h-[52px] transition-all active:scale-95 hover:brightness-125`}>
                    <span className="text-xs font-bold uppercase tracking-wider text-center leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Series + Turmas — only when exactly 1 ensino selected */}
            {!allEnsino && selectedEnsino.length === 1 && getAvailableSeries().length > 0 && (
              <div className="space-y-2 animate-fade-in mt-6">
                <p className="text-white text-lg font-semibold uppercase tracking-wider">Série</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {getAvailableSeries().map((serie) => {
                    const isSelected = selectedSeries.includes(serie);
                    return (
                      <button key={serie} onClick={() => {
                        setSelectedSeries((prev) => prev.includes(serie) ? prev.filter(s => s !== serie) : [...prev, serie]);
                      }}
                        style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 12 }}
                        className={`flex items-center justify-center p-2 min-h-[44px] transition-all active:scale-95 hover:brightness-125`}>
                        <span className="text-xs font-bold uppercase tracking-wider text-center leading-tight">{serie}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedSeries.length > 0 && (
                  <div className="space-y-1.5 animate-fade-in mt-6">
                    <p className="text-white text-lg font-semibold uppercase tracking-wider">Turma(s)</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9\-]*"
                      value={turmas}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const groupSize = selectedEnsino[0] === "fundamental" ? 2 : 3;
                        const maxGroups = 10;
                        const limited = raw.slice(0, groupSize * maxGroups);
                        const groups: string[] = [];
                        for (let i = 0; i < limited.length; i += groupSize) {
                          groups.push(limited.slice(i, i + groupSize));
                        }
                        setTurmas(groups.join("-"));
                      }}
                      placeholder={selectedEnsino[0] === "fundamental" ? "Ex: 01-02-03" : "Ex: 001-002-003"}
                      className="w-full rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                    />
                    <p className="text-white/30 text-[9px]">
                      {selectedEnsino[0] === "fundamental" ? "Digite 2 dígitos por turma (separados por traço)" : "Digite 3 dígitos por turma (separados por traço)"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Event name */}
        {isReadyToShow && (
          <div className="space-y-2 -mx-2 mt-4 animate-fade-in">
            <p className="text-white text-lg font-semibold uppercase tracking-wider px-2">{getNameLabel()} <span className="text-red-400">*</span></p>
            <input type="text" value={eventName} onChange={(e) => setEventName(toProperCase(e.target.value.slice(0, 100)))} placeholder={getNamePlaceholder()} required
              className={`w-full rounded-xl bg-white/10 backdrop-blur-sm border px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all ${!subjectCheck.valid && eventName.length > 0 ? "border-red-400/40" : !eventName.trim() ? "border-red-400/40" : "border-white/15"}`} />
            {!subjectCheck.valid && (
              <p className="text-red-400 text-sm font-semibold px-2">{subjectCheck.message}</p>
            )}
          </div>
        )}

        {/* Resources selector */}
        {isReadyToShow && (
          <div className="space-y-2 -mx-2 mt-4 animate-fade-in">
            <p className="text-white text-lg font-semibold uppercase tracking-wider px-2">Recursos utilizados</p>
            <div className="grid grid-cols-3 gap-1.5">
              {RESOURCES.map((resource) => {
                const ResIcon = resource.icon;
                const isSelected = selectedResources.includes(resource.id);
                return (
                  <button key={resource.id} onClick={() => {
                    setSelectedResources((prev) => prev.includes(resource.id) ? prev.filter(r => r !== resource.id) : [...prev, resource.id]);
                  }}
                    style={{ ...sectorButtonStyle(color, isSelected), borderRadius: 14 }}
                    className={`flex flex-col items-center justify-center gap-1.5 p-2.5 min-h-[54px] transition-all active:scale-95 hover:brightness-125`}>
                    <ResIcon className="h-5 w-5" style={{ filter: `drop-shadow(0 0 5px hsla(${color.hueA}, 95%, 70%, 0.6))` }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">{resource.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom button */}
      {isReadyToShow && (
        <div className="relative z-10 px-4 pb-4 pt-2 animate-fade-in" style={{ background: "linear-gradient(to top, hsl(220, 60%, 8%) 60%, transparent)" }}>
          <Button size="lg" className="w-full rounded-2xl h-14 text-base font-bold bg-primary hover:bg-primary/90" onClick={handleAdvance}>
            Avançar →
          </Button>
        </div>
      )}

      {/* Dialog de sub-opções (Escolar / Externo) */}
      <Dialog
        open={subOptionsCategory !== null && !showExternoDialog}
        onOpenChange={(open) => { if (!open) setSubOptionsCategory(null); }}
      >
        <DialogContent className="bg-[hsl(220,50%,20%)] border-white/20 text-white w-[calc(100vw-0.25rem)] max-w-[640px] rounded-2xl p-1.5 sm:p-2 [&>button.absolute]:!bg-[linear-gradient(145deg,hsl(0,85%,58%),hsl(0,90%,48%))] [&>button.absolute]:rounded-full [&>button.absolute]:w-8 [&>button.absolute]:h-8 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:opacity-100 [&>button.absolute]:border-[1.5px] [&>button.absolute]:border-[hsl(0,95%,72%)] [&>button.absolute]:shadow-[inset_0_1px_2px_hsla(0,100%,85%,0.5),inset_0_-2px_4px_hsla(0,90%,25%,0.6),0_4px_12px_hsla(0,85%,35%,0.5)] [&>button.absolute]:!right-1.5 [&>button.absolute]:!top-1.5 [&>button.absolute>svg]:!h-4 [&>button.absolute>svg]:!w-4 [&>button.absolute>svg]:text-white [&>button.absolute>svg]:stroke-[3] [&>button.absolute>svg]:drop-shadow-[0_1px_2px_hsla(0,90%,15%,0.7)]">
          <DialogHeader className="mb-1 text-center sm:text-center">
            <DialogTitle className="text-white text-sm sm:text-base text-center font-bold uppercase tracking-wider px-10">
              {subOptionsCategory === "escolar" ? "Tipo de Evento Escolar" : "Tipo de Evento Externo"}
            </DialogTitle>
          </DialogHeader>
          {subOptionsCategory && (() => {
            const cfg = eventOptions[subOptionsCategory];
            const pick = (label: string) => {
              setSelectedSubOption(label);
              setSubOptionsCategory(null);
            };
            // Posicionamento do rótulo para "fugir" do círculo central
            const labelOffsets = [
              "translate(-10px,-8px)",  // 0 top-left → empurra p/ canto sup-esq
              "translate(10px,-8px)",   // 1 top-right
              "translate(-14px,0)",     // 2 mid-left → empurra p/ esquerda
              "translate(14px,0)",      // 3 mid-right
              "translate(-10px,8px)",   // 4 bottom-left
              "translate(10px,8px)",    // 5 bottom-right
            ];
             // Estilo unificado: usar o MESMO estilo dos botões de setor (cor, brilho, halo)
             const baseRest = sectorButtonStyle(color, false);
             const baseSelected = sectorButtonStyle(color, true);
            return (
              <div className="space-y-3">
                {/* Grid 2x3 com botão principal circular ao centro */}
                <div className="relative">
                  <div className="grid grid-cols-2 gap-2.5">
                     {cfg.grid.map((opt, idx) => {
                       const isSelected = selectedSubOption === opt;
                       // Botão central Palestra (120px, raio 60). Posicionado entre a linha 0 (Reuniões/Aula) e a linha 1 (Prova/Treinamento). Recorte angular nos 4 botões ao redor para encaixar sem sobrepor.
                       const cutRadius = 70;
                       const maskPositions: Record<number, string> = {
                          0: `at calc(100% + 5px) calc(100% + 5px)`, // Reuniões → corta canto inf-dir
                          1: `at calc(0% - 5px) calc(100% + 5px)`,   // Aula → corta canto inf-esq
                          2: `at calc(100% + 5px) calc(0% - 5px)`,   // Prova → corta canto sup-dir
                          3: `at calc(0% - 5px) calc(0% - 5px)`,     // Treinamento → corta canto sup-esq
                          6: `at calc(100% + 5px) calc(100% + 5px)`, // Workshop → corta canto inf-dir
                          7: `at calc(0% - 5px) calc(100% + 5px)`,   // Seminário → corta canto inf-esq
                          8: `at calc(100% + 5px) calc(0% - 5px)`,   // Congresso → corta canto sup-dir
                          9: `at calc(0% - 5px) calc(0% - 5px)`,     // Evento cultural → corta canto sup-esq
                       };
                        const maskStyle = maskPositions[idx]
                         ? {
                             WebkitMask: `radial-gradient(circle ${cutRadius}px ${maskPositions[idx]}, transparent 100%, black 100%)`,
                             mask: `radial-gradient(circle ${cutRadius}px ${maskPositions[idx]}, transparent 100%, black 100%)`,
                           }
                         : {};
                       return (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={opt}
                          onClick={() => pick(opt)}
                          style={{
                            ...maskStyle,
                            ...(isSelected ? baseSelected : baseRest),
                            borderRadius: 16,
                          }}
                           className="relative min-h-[84px] px-2 py-2 transition-all duration-150 active:scale-95 hover:brightness-110 hover:-translate-y-[1px] flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220,50%,20%)]"
                         >
                           <span
                             aria-hidden
                             className="absolute inset-x-2 top-1 h-3 rounded-full pointer-events-none"
                             style={{ background: "linear-gradient(180deg, hsla(0,0%,100%,0.30) 0%, transparent 100%)", filter: "blur(2px)" }}
                           />
                               <span
                                 className="relative z-10 text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-center leading-tight break-words whitespace-pre-line max-w-[85%]"
                                  style={{ transform: [0, 2, 6, 8].includes(idx) ? "translate(-8%, 0)" : undefined, textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}
                               >
                               {opt}
                           </span>
                         </button>
                      );
                    })}
                  </div>
                  {/* Botão principal — círculo central na interseção */}
                   {(() => {
                     const isSelected = selectedSubOption === cfg.main;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={cfg.main}
                        onClick={() => pick(cfg.main)}
                         style={{
                           ...(isSelected ? baseSelected : baseRest),
                           borderRadius: "50%",
                           transform: "translate(-50%, -50%) scale(1.05)",
                         }}
                          className="absolute top-[89px] left-1/2 z-10 w-[120px] h-[120px] flex items-center justify-center overflow-hidden transition-all duration-150 active:!scale-100 hover:brightness-110 focus:outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220,50%,20%)]"
                       >
                         <span
                           aria-hidden
                           className="absolute inset-x-3 top-2 h-3 rounded-full pointer-events-none"
                           style={{ background: "linear-gradient(180deg, hsla(0,0%,100%,0.32) 0%, transparent 100%)", filter: "blur(2px)" }}
                         />
                          <span className="relative z-10 text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-center leading-tight px-1" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>
                           {cfg.main}
                         </span>
                       </button>
                    );
                  })()}
                  {/* Segundo botão principal — círculo central entre Workshop/Seminário e Congresso/Evento cultural */}
                  {(() => {
                    const isSelected = selectedSubOption === cfg.main2;
                    // Cada linha tem min-h 84px + gap 10px. Linhas 0..3 ocupam até y=366. Centro entre row 3 e row 4: y ≈ 371.
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={cfg.main2}
                        onClick={() => pick(cfg.main2)}
                        style={{
                          ...(isSelected ? baseSelected : baseRest),
                          borderRadius: "50%",
                          transform: "translate(-50%, -50%) scale(1.05)",
                        }}
                        className="absolute top-[371px] left-1/2 z-10 w-[120px] h-[120px] flex items-center justify-center overflow-hidden transition-all duration-150 active:!scale-100 hover:brightness-110 focus:outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220,50%,20%)]"
                      >
                        <span
                          aria-hidden
                          className="absolute inset-x-3 top-2 h-3 rounded-full pointer-events-none"
                          style={{ background: "linear-gradient(180deg, hsla(0,0%,100%,0.32) 0%, transparent 100%)", filter: "blur(2px)" }}
                        />
                        <span className="relative z-10 text-[13px] sm:text-sm font-bold uppercase tracking-wider text-center leading-tight px-1" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>
                          {cfg.main2}
                        </span>
                      </button>
                    );
                  })()}
                </div>

                {/* Outros */}
                {(() => {
                  const isSelected = selectedSubOption === cfg.extra;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={cfg.extra}
                      onClick={() => pick(cfg.extra)}
                      style={{
                        ...(isSelected ? baseSelected : baseRest),
                        borderRadius: 16,
                      }}
                      className="relative w-full min-h-[52px] px-3 py-2 overflow-hidden transition-all duration-150 active:scale-95 hover:brightness-110 hover:-translate-y-[1px] flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220,50%,20%)]"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-x-2 top-1 h-3 rounded-full pointer-events-none"
                        style={{ background: "linear-gradient(180deg, hsla(0,0%,100%,0.30) 0%, transparent 100%)", filter: "blur(2px)" }}
                      />
                      <span className="relative z-10 text-base font-bold uppercase tracking-wider" style={{ textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" }}>{cfg.extra}</span>
                    </button>
                  );
                })()}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>


      <Dialog open={showExternoDialog} onOpenChange={setShowExternoDialog}>
        <DialogContent className="bg-[hsl(220,50%,20%)] border-white/20 text-white max-w-[90vw] rounded-2xl [&>button.absolute]:!bg-[linear-gradient(145deg,hsl(0,85%,58%),hsl(0,90%,48%))] [&>button.absolute]:rounded-full [&>button.absolute]:w-10 [&>button.absolute]:h-10 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:opacity-100 [&>button.absolute]:border-[1.5px] [&>button.absolute]:border-[hsl(0,95%,72%)] [&>button.absolute]:shadow-[inset_0_1px_2px_hsla(0,100%,85%,0.5),inset_0_-2px_4px_hsla(0,90%,25%,0.6),0_4px_12px_hsla(0,85%,35%,0.5)] [&>button.absolute]:!right-3 [&>button.absolute]:!top-3 [&>button.absolute>svg]:!h-5 [&>button.absolute>svg]:!w-5 [&>button.absolute>svg]:text-white [&>button.absolute>svg]:stroke-[3] [&>button.absolute>svg]:drop-shadow-[0_1px_2px_hsla(0,90%,15%,0.7)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-base pr-12 break-words">
              <Info className="h-5 w-5 shrink-0 text-amber-400" />
              <span className="flex-1 min-w-0 break-words">Evento Externo — Aprovação Necessária</span>
            </DialogTitle>
          </DialogHeader>
          <div className="text-white/80 text-sm leading-relaxed space-y-3">
            <p>
              Todo e qualquer <strong className="text-white">Evento Externo</strong> para liberação do espaço <strong className="text-amber-400">{sectorDisplayName}</strong> deverá passar por aprovação prévia do <strong className="text-white">Gestor</strong> da escola.
            </p>
            <p>
              A comunicação será feita <strong className="text-white">automaticamente pelo aplicativo</strong>. O Gestor receberá uma notificação para <strong className="text-emerald-400">deferir</strong> ou <strong className="text-red-400">indeferir</strong> a solicitação.
            </p>
            <p>
              Você será notificado automaticamente sobre a decisão do Gestor diretamente no seu aplicativo.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowExternoDialog(false)} className="w-full rounded-xl h-12 font-bold bg-primary hover:bg-primary/90">
              Entendi, continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
