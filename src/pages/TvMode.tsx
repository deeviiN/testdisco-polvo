import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock, Monitor, Tv, Volume2, Mic, Laptop, Laptop2, ArrowLeft, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { getHolidayForDate, isWeekend, getAllHolidaysForYear, loadCustomHolidays } from "@/lib/holidays";

type Booking = Tables<"bookings"> & { profiles?: { full_name: string } | null };

const MORNING_SLOTS = [
  { value: "07:20", end: "08:20", label: "1º Tempo", range: "07:20 - 08:20" },
  { value: "08:20", end: "09:20", label: "2º Tempo", range: "08:20 - 09:20" },
  { value: "09:45", end: "10:45", label: "3º Tempo", range: "09:45 - 10:45" },
  { value: "10:45", end: "11:45", label: "4º Tempo", range: "10:45 - 11:45" },
  { value: "11:45", end: "12:45", label: "5º Tempo", range: "11:45 - 12:45" },
];

const AFTERNOON_SLOTS = [
  { value: "13:20", end: "14:20", label: "1º Tempo", range: "13:20 - 14:20" },
  { value: "14:20", end: "15:20", label: "2º Tempo", range: "14:20 - 15:20" },
  { value: "15:45", end: "16:45", label: "3º Tempo", range: "15:45 - 16:45" },
  { value: "16:45", end: "17:45", label: "4º Tempo", range: "16:45 - 17:45" },
  { value: "17:45", end: "18:45", label: "5º Tempo", range: "17:45 - 18:45" },
];

const NIGHT_SLOTS = [
  { value: "18:45", end: "19:40", label: "1º Tempo", range: "18:45 - 19:40" },
  { value: "19:40", end: "20:35", label: "2º Tempo", range: "19:40 - 20:35" },
  { value: "20:45", end: "21:40", label: "3º Tempo", range: "20:45 - 21:40" },
  { value: "21:40", end: "22:35", label: "4º Tempo", range: "21:40 - 22:35" },
];

const RESOURCE_ICONS: Record<string, typeof Monitor> = {
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
  notebook_professor: "Notebook Prof.",
};

export default function TvMode() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const schoolId = searchParams.get("school");
  const [school, setSchool] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [phaseBlocked, setPhaseBlocked] = useState<null | "restricted" | "blocked">(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const loadData = useCallback(async () => {
    if (!schoolId) return;

    // Bloqueia o Painel TV quando a escola está em carência (>=10d) ou bloqueada (>=15d)
    const { data: phaseData } = await supabase.rpc("get_school_trial_phase" as any, { _school_id: schoolId });
    const phaseRow: any = Array.isArray(phaseData) ? phaseData[0] : phaseData;
    const phase = phaseRow?.phase as string | undefined;
    const blocked = phase === "restricted" || phase === "blocked";
    setPhaseBlocked(blocked ? (phase as any) : null);

    const schoolRes = await supabase.rpc("get_school_public_info", { _school_id: schoolId });
    if (schoolRes.data && schoolRes.data.length > 0) setSchool(schoolRes.data[0]);

    if (blocked) {
      setBookings([]);
      setLastRefresh(new Date());
      return;
    }

    const bookingsRes = await supabase
      .from("bookings")
      .select("*, profiles(full_name)")
      .eq("school_id", schoolId)
      .eq("booking_date", today)
      .eq("status", "confirmed")
      .order("start_time");
    if (bookingsRes.data) setBookings(bookingsRes.data as unknown as Booking[]);
    setLastRefresh(new Date());
  }, [schoolId, today]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const getBookingForSlot = (slotValue: string) => {
    return bookings.find((b) => b.start_time.slice(0, 5) === slotValue);
  };

  const isCurrentSlot = (start: string, end: string) => {
    const now = format(currentTime, "HH:mm");
    return now >= start && now < end;
  };

  const allSlots = [
    { turno: "☀️ Matutino", slots: MORNING_SLOTS },
    { turno: "🌤️ Vespertino", slots: AFTERNOON_SLOTS },
    { turno: "🌙 Noturno", slots: NIGHT_SLOTS },
  ];

  const totalSlots = MORNING_SLOTS.length + AFTERNOON_SLOTS.length + NIGHT_SLOTS.length;
  const occupiedSlots = bookings.length;
  const freeSlots = totalSlots - occupiedSlots;
  const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);

  if (!schoolId) {
    return (
      <div className="h-screen w-screen bg-[hsl(230,25%,7%)] text-white flex items-center justify-center flex-col gap-4">
        <Tv className="h-16 w-16 text-primary opacity-60" />
        <h1 className="text-2xl font-bold">Modo TV</h1>
        <p className="text-white/60">Parâmetro "school" não informado na URL.</p>
        <p className="text-white/40 text-sm">Use: /tv?school=ID_DA_ESCOLA</p>
        <button onClick={() => navigate("/home")} className="mt-4 px-6 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition">
          Voltar
        </button>
      </div>
    );
  }

  // Quando bloqueado: renderiza a estrutura padrão em escala de cinza total.
  // Números viram "—", cards ficam neutros, mensagem discreta no rodapé.
  const isBlocked = !!phaseBlocked;


  return (
    <div className={`h-screen w-screen bg-[hsl(230,25%,7%)] text-white overflow-hidden flex flex-col ${isBlocked ? "grayscale contrast-75 brightness-75" : ""}`}>
      {isBlocked && (
        <div className="bg-neutral-800 text-neutral-300 text-center text-sm py-1.5 border-b border-neutral-700">
          Painel indisponível — Procure a <strong>gestão escolar</strong> para regularizar a assinatura.
        </div>
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[hsl(230,20%,10%)] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          {school?.logo_url && (
            <img src={school.logo_url} alt="Logo" className="h-12 w-12 rounded-xl object-cover border-2 border-primary/30" />
          )}
          <div>
            <h1 className="text-xl font-black tracking-tight">{school?.name || "Carregando..."}</h1>
            <p className="text-white/50 text-sm capitalize">{todayDisplay}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Stats */}
          <div className="flex gap-3">
            <div className="text-center px-4 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/20">
              <p className="text-2xl font-black text-emerald-400">{freeSlots}</p>
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/70">Livres</p>
            </div>
            <div className="text-center px-4 py-1.5 rounded-xl bg-red-500/15 border border-red-500/20">
              <p className="text-2xl font-black text-red-400">{occupiedSlots}</p>
              <p className="text-[10px] uppercase tracking-wider text-red-400/70">Ocupados</p>
            </div>
            <div className="text-center px-4 py-1.5 rounded-xl bg-primary/15 border border-primary/20">
              <p className="text-2xl font-black text-primary">{occupancyRate}%</p>
              <p className="text-[10px] uppercase tracking-wider text-primary/70">Ocupação</p>
            </div>
          </div>

          {/* Clock */}
          <div className="text-right">
            <p className="text-4xl font-black tabular-nums tracking-tight text-primary">
              {format(currentTime, "HH:mm")}
              <span className="text-lg text-primary/50">:{format(currentTime, "ss")}</span>
            </p>
            <p className="text-[10px] text-white/30 flex items-center gap-1 justify-end">
              <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: "3s" }} />
              Atualiza a cada 30s
            </p>
          </div>
        </div>
      </header>

      {/* Main grid */}
      <main className="flex-1 grid grid-cols-3 gap-4 p-4 overflow-hidden">
        {allSlots.map(({ turno, slots }) => (
          <div key={turno} className="flex flex-col bg-[hsl(230,20%,10%)] rounded-2xl border border-white/5 overflow-hidden">
            {/* Turno header */}
            <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 shrink-0">
              <h2 className="text-lg font-bold">{turno}</h2>
            </div>

            {/* Slots */}
            <div className="flex-1 flex flex-col gap-2 p-3 overflow-auto">
              {slots.map((slot) => {
                const booking = getBookingForSlot(slot.value);
                const isCurrent = isCurrentSlot(slot.value, slot.end);
                const isFree = !booking;

                return (
                  <div
                    key={slot.value}
                    className={`relative rounded-xl p-3 transition-all ${
                      isCurrent
                        ? "ring-2 ring-primary shadow-[0_0_20px_hsl(250,84%,54%,0.3)] bg-primary/10"
                        : isFree
                        ? "bg-emerald-500/5 border border-emerald-500/10"
                        : "bg-white/5 border border-white/5"
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                      </span>
                    )}

                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold">{slot.label}</span>
                      <span className="text-xs text-white/40">{slot.range}</span>
                    </div>

                    {booking ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          <span className="text-sm font-semibold text-red-300">Ocupado</span>
                        </div>
                        <p className="text-sm text-white/80 truncate">
                          👤 {booking.profiles?.full_name || "—"}
                        </p>
                        {booking.discipline && (
                          <p className="text-xs text-white/50 truncate">📚 {booking.discipline}</p>
                        )}
                        {booking.topic && (
                          <p className="text-xs text-white/40 truncate">📝 {booking.topic}</p>
                        )}
                        {booking.resources && booking.resources.length > 0 && (
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {booking.resources.map((r) => {
                              const Icon = RESOURCE_ICONS[r] || Monitor;
                              return (
                                <span key={r} className="flex items-center gap-1 text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                                  <Icon className="h-3 w-3" />
                                  {RESOURCE_LABELS[r] || r}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-semibold text-emerald-400">Disponível</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {/* Footer */}
      <footer className="px-6 py-2 bg-[hsl(230,20%,10%)] border-t border-white/5 flex items-center justify-between text-white/30 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Tv className="h-4 w-4" />
          <span>Modo TV — Atualização automática</span>
        </div>
        <span>Última atualização: {format(lastRefresh, "HH:mm:ss")}</span>
      </footer>

      {/* Back button (subtle, top-left corner) */}
      <button
        onClick={() => navigate("/home")}
        className="fixed top-4 left-4 z-50 p-2 rounded-full bg-white/5 hover:bg-white/10 transition opacity-0 hover:opacity-100"
        title="Voltar"
      >
        <ArrowLeft className="h-4 w-4 text-white/50" />
      </button>
    </div>
  );
}
