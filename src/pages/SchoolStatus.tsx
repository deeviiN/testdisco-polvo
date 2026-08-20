import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, Search, Clock, Users, Monitor, GraduationCap, Dumbbell, TreePine, School, MapPin, Navigation, Phone, Info, ChevronDown, ChevronUp, X, BookOpen, FlaskConical, Lightbulb, Trophy as TrophyIcon, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { useSectorPreferences } from "@/hooks/useSectorPreferences";

type SchoolInfo = {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
  network: string;
  is_active: boolean;
  logo_url: string | null;
  address: string | null;
};

type BookingPublic = {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  sector: string;
  event_type: string;
  description: string | null;
  topic: string | null;
  discipline: string | null;
  status: string;
  user_full_name: string;
};

const NETWORK_OPTIONS = [
  { key: "estadual", label: "Estadual" },
  { key: "municipal", label: "Municipal" },
  { key: "federal", label: "Federal" },
  { key: "particular", label: "Particular" },
];

const ALL_SECTORS_FILTER: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "informatica", label: "Inform.", icon: Monitor },
  { key: "quadra", label: "Quadra", icon: TrophyIcon },
  { key: "patio", label: "Pátio", icon: TreePine },
  { key: "biblioteca", label: "Biblioteca", icon: BookOpen },
  { key: "lab_ciencias", label: "Lab. Ciên.", icon: FlaskConical },
  { key: "sala_professores", label: "Sala Prof.", icon: Users },
  { key: "projeto_vida", label: "Sala de Vídeo", icon: Lightbulb },
];

// Compat: usado em outros pontos da tela (modal de detalhes)
const SECTOR_TABS = ALL_SECTORS_FILTER;

const EVENT_LABELS: Record<string, string> = {
  aula: "Aula",
  palestra: "Palestra",
  reuniao: "Reunião",
  evento_externo: "Evento Externo",
  esportivo: "Evento Esportivo",
  outros: "Evento Escolar",
  externo: "Evento Externo",
};

const NETWORK_LABELS: Record<string, string> = {
  estadual: "Estadual",
  municipal: "Municipal",
  federal: "Federal",
  particular: "Particular",
};

const STATE_FULL_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "E. Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "M. G. do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "R. G. do Norte", RS: "R. G. do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "S. Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

type Step = "network" | "state" | "city" | "school" | "bookings";

export default function SchoolStatus() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { color, glowEnabled } = useSectorPreferences();
  const [step, setStep] = useState<Step>("network");
  const [network, setNetwork] = useState("");
  const [stateUF, setStateUF] = useState("");
  const [city, setCity] = useState("");
  const [states, setStates] = useState<{ state: string; school_count: number }[]>([]);
  const [cities, setCities] = useState<{ city: string; school_count: number }[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [schoolList, setSchoolList] = useState<SchoolInfo[]>([]);
  const [schoolFilter, setSchoolFilter] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<SchoolInfo | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [bookings, setBookings] = useState<BookingPublic[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingPublic | null>(null);
  const [gestors, setGestors] = useState<{ full_name: string; phone: string | null }[]>([]);
  const [showSchoolInfo, setShowSchoolInfo] = useState(false);
  const [inepQuery, setInepQuery] = useState("");
  const [inepLoading, setInepLoading] = useState(false);
  const [inepError, setInepError] = useState("");

  const searchByInep = async () => {
    const code = inepQuery.replace(/\D/g, "");
    if (code.length !== 8) {
      setInepError("O código INEP deve ter 8 dígitos");
      return;
    }
    setInepError("");
    setInepLoading(true);
    const { data } = await supabase.rpc("find_school_by_inep", { _inep_code: code });
    setInepLoading(false);
    const found = (data as any[])?.[0];
    if (!found) {
      setInepError("Nenhuma escola encontrada com este INEP");
      return;
    }
    // Fetch full public info to get logo/address
    const { data: pub } = await supabase.rpc("get_school_public_info", { _school_id: found.id });
    const info = (pub as any[])?.[0];
    setSelectedSchool({
      id: found.id,
      name: found.name,
      city: found.city,
      state: found.state,
      inep_code: found.inep_code,
      network: info?.network || "estadual",
      is_active: info?.is_active ?? true,
      logo_url: info?.logo_url || null,
      address: info?.address || null,
    });
    setActiveTab("all");
    setShowSchoolInfo(false);
    setStep("bookings");
    setInepQuery("");
  };

  // Load states when entering "state" step
  useEffect(() => {
    if (step !== "state" || !network) return;
    setLoadingList(true);
    supabase
      .rpc("list_school_states_public" as any, { _network: network })
      .then(({ data }) => {
        setStates((data as any[]) || []);
        setLoadingList(false);
      });
  }, [step, network]);

  // Load cities when entering "city" step
  useEffect(() => {
    if (step !== "city" || !network || !stateUF) return;
    setLoadingList(true);
    supabase
      .rpc("list_school_cities_public" as any, { _state: stateUF, _network: network })
      .then(({ data }) => {
        setCities((data as any[]) || []);
        setLoadingList(false);
      });
  }, [step, stateUF, network]);

  // Load schools when entering "school" step
  useEffect(() => {
    if (step !== "school" || !network || !stateUF || !city) return;
    setLoadingList(true);
    supabase
      .rpc("list_schools_by_location", { _state: stateUF, _city: city, _network: network })
      .then(({ data }) => {
        setSchoolList((data as unknown as SchoolInfo[]) || []);
        setLoadingList(false);
      });
  }, [step, network, stateUF, city]);

  const filteredStates = states.filter((s) =>
    !stateFilter.trim() || s.state.toLowerCase().includes(stateFilter.trim().toLowerCase())
  );
  const filteredCities = cities.filter((c) =>
    !cityFilter.trim() || c.city.toLowerCase().includes(cityFilter.trim().toLowerCase())
  );
  const filteredSchools = schoolList.filter((s) => {
    const q = schoolFilter.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.inep_code || "").includes(q);
  });

  const resetFlow = () => {
    setStep("network"); setNetwork(""); setStateUF(""); setCity("");
    setStates([]); setCities([]); setSchoolList([]);
    setStateFilter(""); setCityFilter(""); setSchoolFilter("");
  };

  const loadBookings = useCallback(async () => {
    if (!selectedSchool) return;
    setLoadingBookings(true);
    const [bookingsRes, gestorRes] = await Promise.all([
      supabase.rpc("get_school_bookings_public", { _school_id: selectedSchool.id }),
      supabase.rpc("get_school_gestor_public" as any, { _school_id: selectedSchool.id }),
    ]);
    setBookings((bookingsRes.data as unknown as BookingPublic[]) || []);
    setGestors((gestorRes.data as unknown as { full_name: string; phone: string | null }[]) || []);
    setLoadingBookings(false);
  }, [selectedSchool]);

  useEffect(() => {
    if (step === "bookings" && selectedSchool) loadBookings();
  }, [step, selectedSchool, loadBookings]);

  const filteredBookings = activeTab === "all" ? bookings : bookings.filter((b) => b.sector === activeTab);
  const ActiveIcon = SECTOR_TABS.find((t) => t.key === activeTab)?.icon || LayoutGrid;

  const sectorCounts: Record<string, number> = bookings.reduce((acc, b) => {
    acc[b.sector] = (acc[b.sector] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sectorOptions: { key: string; label: string; count: number; icon: LucideIcon }[] = [
    { key: "all", label: "Todos", count: bookings.length, icon: LayoutGrid },
    ...ALL_SECTORS_FILTER.map((s) => ({ key: s.key, label: s.label, count: sectorCounts[s.key] ?? 0, icon: s.icon })),
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

  const openMaps = () => {
    if (!selectedSchool) return;
    const query = encodeURIComponent(
      `${selectedSchool.name}, ${selectedSchool.address || ""}, ${selectedSchool.city}, ${selectedSchool.state}`
    );
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  };

  // Network selection step
  if (step === "network") {
    return (
      <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />
        <div className="relative z-10 flex items-center gap-3 px-4 pt-12 pb-2">
          <button onClick={goBack} className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <h1 className="text-lg font-display font-bold text-white tracking-tight flex-1">Status de Outra Escola</h1>
          <button onClick={() => navigate("/sectors")} className="w-9 h-9 rounded-xl bg-red-500/20 backdrop-blur-sm border border-red-400/30 flex items-center justify-center text-red-300 hover:text-white hover:bg-red-500/40 transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 px-6 overflow-y-auto py-6">
          <School className="h-14 w-14 text-amber-300/60" />

          {/* INEP shortcut */}
          <div className="w-full max-w-xs space-y-2">
            <p className="text-white/70 text-xs text-center font-semibold uppercase tracking-wider">Buscar por INEP</p>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                maxLength={8}
                placeholder="00000000"
                value={inepQuery}
                onChange={(e) => { setInepQuery(e.target.value.replace(/\D/g, "")); setInepError(""); }}
                onKeyDown={(e) => e.key === "Enter" && searchByInep()}
                className="h-11 rounded-xl bg-white/10 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-amber-400/30 text-center tracking-widest font-bold"
              />
              <Button
                onClick={searchByInep}
                disabled={inepLoading || inepQuery.length !== 8}
                className={`h-11 px-4 rounded-xl font-bold ${inepError ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-amber-400 text-amber-950 hover:bg-amber-300"}`}
              >
                {inepLoading ? "..." : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {inepError && <p className="text-red-300 text-xs text-center font-semibold">{inepError}</p>}
          </div>

          <div className="flex items-center gap-3 w-full max-w-xs my-1">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">ou pela rede</span>
            <div className="flex-1 h-px bg-white/15" />
          </div>

          {NETWORK_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setNetwork(opt.key); setStep("state"); setStateUF(""); setCity(""); setStateFilter(""); }}
              className="w-full max-w-xs py-3 rounded-2xl text-base font-bold text-white bg-white/10 border-2 border-white/15 hover:bg-amber-400/15 hover:border-amber-400/40 hover:text-amber-300 transition-all"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Generic header builder
  const renderHeader = (title: string, subtitle: string, onBack: () => void) => (
    <div className="relative z-10 flex items-center gap-3 px-4 pt-12 pb-2">
      <button onClick={onBack} className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-display font-bold text-white tracking-tight truncate">{title}</h1>
        <p className="text-xs text-amber-300/80 font-semibold truncate">{subtitle}</p>
      </div>
      <button onClick={() => navigate("/sectors")} className="w-9 h-9 rounded-xl bg-red-500/20 backdrop-blur-sm border border-red-400/30 flex items-center justify-center text-red-300 hover:text-white hover:bg-red-500/40 transition-all">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const networkLabel = NETWORK_OPTIONS.find(n => n.key === network)?.label || "";

  // State selection
  if (step === "state") {
    return (
      <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />
        {renderHeader("Selecione o Estado", `Rede ${networkLabel}`, () => { setStep("network"); setStateUF(""); setStateFilter(""); })}
        <div className="relative z-10 px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              placeholder="Buscar estado..."
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="pl-10 h-12 rounded-xl bg-white/10 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-amber-400/30"
            />
          </div>
        </div>
        <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            </div>
          ) : filteredStates.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-12">Nenhum estado encontrado</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredStates.map((s) => (
                <button
                  key={s.state}
                  onClick={() => { setStateUF(s.state); setStep("city"); setCityFilter(""); }}
                  className="rounded-2xl bg-white/[0.08] border border-white/10 p-4 hover:bg-amber-400/10 hover:border-amber-400/30 transition-all text-left"
                >
                  <p className="text-white font-bold text-lg leading-tight break-words">{STATE_FULL_NAMES[s.state] || s.state}</p>
                  <p className="text-white/50 text-sm mt-1">{s.school_count} escola{s.school_count !== 1 ? "s" : ""}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // City selection
  if (step === "city") {
    return (
      <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />
        {renderHeader("Selecione o Município", `${networkLabel} • ${stateUF}`, () => { setStep("state"); setCity(""); setCityFilter(""); })}
        <div className="relative z-10 px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              placeholder="Buscar município..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="pl-10 h-12 rounded-xl bg-white/10 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-amber-400/30"
            />
          </div>
        </div>
        <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            </div>
          ) : filteredCities.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-12">Nenhum município encontrado</p>
          ) : (
            <div className="space-y-2">
              {filteredCities.map((c) => (
                <button
                  key={c.city}
                  onClick={() => { setCity(c.city); setStep("school"); setSchoolFilter(""); }}
                  className="w-full text-left rounded-2xl bg-white/[0.08] border border-white/10 p-4 hover:bg-amber-400/10 hover:border-amber-400/30 transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-bold text-sm break-words">{c.city}</p>
                  </div>
                  <Badge className="text-[10px] px-2 py-0.5 bg-amber-400/20 text-amber-300 border-0 flex-shrink-0">
                    {c.school_count}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // School selection
  if (step === "school") {
    return (
      <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />
        {renderHeader("Selecione a Escola", `${networkLabel} • ${city} — ${stateUF}`, () => { setStep("city"); setSchoolFilter(""); })}
        <div className="relative z-10 px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              placeholder="Buscar por nome ou INEP..."
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              className="pl-10 h-12 rounded-xl bg-white/10 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-amber-400/30"
            />
          </div>
        </div>
        <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            </div>
          ) : filteredSchools.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-12">Nenhuma escola encontrada</p>
          ) : (
            filteredSchools.map((school) => (
              <button
                key={school.id}
                onClick={() => { setSelectedSchool(school); setStep("bookings"); setActiveTab("all"); setShowSchoolInfo(false); }}
                className="w-full text-left rounded-2xl bg-white/[0.08] border border-white/10 p-4 mb-3 hover:bg-amber-400/10 hover:border-amber-400/30 transition-all"
              >
                <p className="text-white font-bold text-sm break-words">{school.name}</p>
                <p className="text-white/50 text-xs mt-0.5">{school.city} — {school.state}</p>
                {school.inep_code && <p className="text-amber-300/60 text-[10px] mt-0.5">INEP: {school.inep_code}</p>}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Bookings view
  return (
    <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />

      {/* Booking detail modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsla(0,0%,0%,0.7)" }} onClick={() => setSelectedBooking(null)}>
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ background: "hsl(220, 50%, 18%)" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedBooking(null)} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:text-white">✕</button>
            <h2 className="text-white font-bold text-lg mb-4">Detalhes do Agendamento</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">Data</span>
                <span className="text-white font-bold">{format(parseISO(selectedBooking.booking_date), "dd/MM/yyyy")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Horário</span>
                <span className="text-white font-bold">{selectedBooking.start_time.slice(0, 5)} - {selectedBooking.end_time.slice(0, 5)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Tipo</span>
                <span className="text-amber-300 font-bold">{EVENT_LABELS[selectedBooking.event_type] || selectedBooking.event_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Setor</span>
                <span className="text-white font-bold">{SECTOR_TABS.find(t => t.key === selectedBooking.sector)?.label || selectedBooking.sector}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Professor</span>
                <span className="text-white font-bold">{selectedBooking.user_full_name}</span>
              </div>
              {selectedBooking.description && (
                <div>
                  <span className="text-white/50 block mb-1">Descrição</span>
                  <p className="text-white/90 bg-white/5 rounded-lg p-3">{selectedBooking.description}</p>
                </div>
              )}
              {selectedBooking.topic && (
                <div>
                  <span className="text-white/50 block mb-1">Assunto</span>
                  <p className="text-white/90 bg-white/5 rounded-lg p-3">{selectedBooking.topic}</p>
                </div>
              )}
              {selectedBooking.discipline && (
                <div>
                  <span className="text-white/50 block mb-1">Disciplina</span>
                  <p className="text-white/90 bg-white/5 rounded-lg p-3">{selectedBooking.discipline}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 px-4 pt-12 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={() => { setStep("school"); setSelectedSchool(null); setBookings([]); setGestors([]); setShowSchoolInfo(false); }} className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all flex-shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-white tracking-tight line-clamp-2 leading-tight">{selectedSchool?.name}</h1>
            <p className="text-[11px] text-amber-300/70 mt-0.5">{selectedSchool?.city} — {selectedSchool?.state}</p>
          </div>
          <button onClick={() => navigate("/sectors")} className="w-9 h-9 rounded-xl bg-red-500/20 backdrop-blur-sm border border-red-400/30 flex items-center justify-center text-red-300 hover:text-white hover:bg-red-500/40 transition-all flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setShowSchoolInfo(!showSchoolInfo)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              showSchoolInfo
                ? "bg-amber-400/20 border-amber-400/40 text-amber-300"
                : "bg-white/10 border-white/15 text-white/70 hover:text-white hover:bg-white/20"
            }`}
          >
            <Info className="h-3.5 w-3.5" />
            Informações
          </button>
          <button
            onClick={openMaps}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all"
          >
            <Navigation className="h-3.5 w-3.5" />
            Localização
          </button>
        </div>
      </div>

      {/* School Info Panel */}
      {showSchoolInfo && selectedSchool && (
        <div className="relative z-10 mx-4 mb-2 rounded-2xl bg-white/[0.08] border border-white/10 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <School className="h-4 w-4 text-amber-300" />
            Informações da Escola
          </h3>

          <div className="space-y-2.5 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-white/40 text-xs min-w-[70px]">Nome</span>
              <span className="text-white font-semibold text-xs leading-tight">{selectedSchool.name}</span>
            </div>

            {selectedSchool.inep_code && (
              <div className="flex items-start gap-2">
                <span className="text-white/40 text-xs min-w-[70px]">INEP</span>
                <span className="text-amber-300 font-bold text-xs">{selectedSchool.inep_code}</span>
              </div>
            )}

            <div className="flex items-start gap-2">
              <span className="text-white/40 text-xs min-w-[70px]">Rede</span>
              <Badge className="text-[10px] px-2 py-0.5 bg-amber-400/20 text-amber-300 border-0">
                {NETWORK_LABELS[selectedSchool.network] || selectedSchool.network}
              </Badge>
            </div>

            <div className="flex items-start gap-2">
              <span className="text-white/40 text-xs min-w-[70px]">Cidade</span>
              <span className="text-white/90 text-xs">{selectedSchool.city} — {selectedSchool.state}</span>
            </div>

            {selectedSchool.address && (
              <div className="flex items-start gap-2">
                <span className="text-white/40 text-xs min-w-[70px]">Endereço</span>
                <span className="text-white/90 text-xs leading-tight">{selectedSchool.address}</span>
              </div>
            )}

            {gestors.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                  Gestor{gestors.length > 1 ? "es" : ""} da Escola
                </span>
                {gestors.map((g, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/[0.06] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-amber-300/70" />
                      <span className="text-white font-semibold text-xs">{g.full_name}</span>
                    </div>
                    {g.phone && (
                      <a
                        href={`tel:${g.phone}`}
                        className="flex items-center gap-1 text-emerald-300 text-xs font-semibold hover:text-emerald-200 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {g.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {gestors.length === 0 && (
              <div className="pt-2 border-t border-white/10">
                <span className="text-white/30 text-xs italic">Nenhum gestor cadastrado</span>
              </div>
            )}
          </div>

          <button
            onClick={openMaps}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 font-bold text-sm hover:bg-emerald-500/25 transition-all"
          >
            <Navigation className="h-4 w-4" />
            Abrir no Google Maps
          </button>
        </div>
      )}

      {/* Filtro por setor — botão "Todos" + mini-cards estilo /sectors */}
      <div className="relative z-10 px-3 pb-2 space-y-1.5">
        {(() => {
          const todos = sectorOptions[0];
          const active = activeTab === "all";
          const Icon = todos.icon;
          return (
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className="relative w-full flex items-center justify-center gap-2 px-3 text-white text-xs font-bold uppercase tracking-wider hover:brightness-125 active:scale-[0.99] overflow-hidden transition-all"
              style={{
                background: glowEnabled ? cardGradient(active) : cardSolid(active),
                borderRadius: 12,
                minHeight: 44,
                border: active
                  ? `2px solid hsla(${color.hueA}, 95%, 78%, 0.95)`
                  : `1px solid hsla(${color.hueA}, 60%, 55%, 0.4)`,
                boxShadow: active
                  ? `0 0 0 2px hsla(${color.hueA}, 95%, 75%, 0.6), 0 0 18px hsla(${color.hueA}, 90%, 60%, 0.55)`
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
              <span className="relative z-10" style={{ textShadow: "0 1px 2px hsla(220,90%,5%,0.7)" }}>
                Todos os setores
              </span>
              <span className="relative z-10 min-w-[20px] h-[20px] px-1.5 rounded-full bg-white/95 text-[hsl(220,60%,12%)] text-[10px] font-black flex items-center justify-center shadow-sm">
                {todos.count}
              </span>
            </button>
          );
        })()}
        <div className="grid grid-cols-4 gap-1.5">
          {sectorOptions.slice(1).map((opt) => {
            const active = activeTab === opt.key;
            const empty = opt.count === 0;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setActiveTab(opt.key)}
                className="relative flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-white text-[9px] font-bold uppercase tracking-wider hover:brightness-125 active:scale-95 overflow-hidden transition-all"
                style={{
                  background: glowEnabled ? cardGradient(active) : cardSolid(active),
                  borderRadius: 12,
                  minHeight: 56,
                  opacity: empty && !active ? 0.55 : 1,
                  border: active
                    ? `2px solid hsla(${color.hueA}, 95%, 78%, 0.95)`
                    : `1px solid hsla(${color.hueA}, 60%, 55%, 0.4)`,
                  boxShadow: active
                    ? `0 0 0 2px hsla(${color.hueA}, 95%, 75%, 0.6), 0 0 18px hsla(${color.hueA}, 90%, 60%, 0.55)`
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
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-white/95 text-[hsl(220,60%,12%)] text-[9px] font-black flex items-center justify-center shadow-sm z-10">
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-6 pt-1">
        {loadingBookings ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ActiveIcon className="h-12 w-12 text-white/20" />
            <p className="text-white/40 text-sm text-center">
              Nenhum agendamento em <span className="font-bold text-white/60">{SECTOR_TABS.find(t => t.key === activeTab)?.label}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">
              {filteredBookings.length} agendamento{filteredBookings.length !== 1 ? "s" : ""}
            </p>
            {filteredBookings.map((booking, idx) => {
              const isEven = idx % 2 === 0;
              const parsedDate = parseISO(booking.booking_date);
              const dayNum = format(parsedDate, "dd");
              const monthShort = format(parsedDate, "MMM", { locale: ptBR }).replace(".", "").toUpperCase().slice(0, 3);
              const yearNum = format(parsedDate, "yyyy");
              return (
                <button
                  key={booking.id}
                  onClick={() => setSelectedBooking(booking)}
                  className={`w-full text-left rounded-2xl border border-white/10 p-4 transition-all hover:bg-white/[0.12] active:scale-[0.99] ${isEven ? "bg-white/[0.08]" : "bg-white/[0.05]"}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 rounded-xl bg-amber-400/20 border border-amber-400/30 flex flex-col items-center justify-center px-3 py-2" style={{ minWidth: "80px" }}>
                      <span className="text-amber-300 text-5xl font-black leading-none">{dayNum}</span>
                      <span className="text-amber-200 text-2xl font-black tracking-wide mt-0.5">{monthShort}</span>
                      <span className="text-amber-300/50 text-xs font-semibold">{yearNum}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white text-lg font-bold">
                          {booking.description || booking.topic || EVENT_LABELS[booking.event_type] || booking.event_type}
                        </span>
                        <Badge className="text-[10px] px-2 py-0.5 bg-amber-400/20 text-amber-300 border-0 flex-shrink-0">
                          {EVENT_LABELS[booking.event_type] || booking.event_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-lg text-white/80 mb-1.5">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Clock className="h-5 w-5" />
                          {booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-lg text-white/80">
                        <Users className="h-5 w-5 flex-shrink-0" />
                        <span className="font-bold break-words">{booking.user_full_name}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
