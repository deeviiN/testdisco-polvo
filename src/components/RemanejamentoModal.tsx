import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUp, Copy, Users, AlertTriangle, Search, MapPin } from "lucide-react";

const EXTRA_LOCATIONS = ["Pátio", "Quadra", "Sala de Vídeo", "Biblioteca"] as const;

export type RosterLite = {
  id: string;
  teacher_name: string;
  nickname: string | null;
  discipline: string | null;
  class_name: string | null;
  shift: string | null;
  period_id: string | null;
  start_time: string;
  end_time: string;
};

export type PeriodLite = {
  id: string;
  shift: string;
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  userId: string;
  today: string; // yyyy-MM-dd
  absentRoster: RosterLite | null;
  absentPeriod: PeriodLite | null;
  /** todos os rosters do dia (mesma weekday) */
  dayRosters: RosterLite[];
  /** todos os tempos do turno atual */
  shiftPeriods: PeriodLite[];
  /** presence map: `${roster.id}:${period_number}` -> status */
  presence: Record<string, string>;
  /** professores (chave por nome) já usados hoje para cobrir outra ausência — não podem ser sugeridos de novo, nem numa 2ª turma */
  busyCoveringTeacherKeys?: Set<string>;
  onDone: () => void;
};

function nameOf(r: RosterLite) {
  return (r.nickname?.trim() || r.teacher_name || "").trim();
}
function normClass(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function periodOfRoster(r: RosterLite, periods: PeriodLite[]): PeriodLite | null {
  if (r.period_id) {
    const p = periods.find((x) => x.id === r.period_id);
    if (p) return p;
  }
  return periods.find((p) => p.start_time.slice(0, 5) === r.start_time.slice(0, 5)) ?? null;
}

export default function RemanejamentoModal({
  open,
  onClose,
  schoolId,
  userId,
  today,
  absentRoster,
  absentPeriod,
  dayRosters,
  shiftPeriods,
  presence,
  busyCoveringTeacherKeys,
  onDone,
}: Props) {
  const [fullDayAbsence, setFullDayAbsence] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [showSchoolWide, setShowSchoolWide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastNotice, setLastNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [extraLocation, setExtraLocation] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFullDayAbsence(false);
      setSuggestionIndex(0);
      setShowManual(false);
      setShowSchoolWide(false);
      setLastNotice(null);
      setQ("");
      setShowExtra(false);
      setExtraLocation(null);
    }
  }, [open, absentRoster?.id, absentPeriod?.period_number]);

  // Chave de identidade do professor (nome/apelido normalizado) — mesmo
  // professor pode aparecer em várias linhas de roster (várias turmas).
  const teacherKey = (r: RosterLite) =>
    (r.teacher_name || r.nickname || "").trim().toLowerCase();

  // Professores marcados como AUSENTE em QUALQUER linha do dia (qualquer turma/tempo).
  // Se está ausente numa turma, está ausente da escola — não pode ser substituto.
  const absentTeacherKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of dayRosters) {
      for (const p of shiftPeriods) {
        if ((presence[`${r.id}:${p.period_number}`] ?? "") === "ausente") {
          set.add(teacherKey(r));
          break;
        }
      }
    }
    return set;
  }, [dayRosters, shiftPeriods, presence]);

  // Professores que já têm aula em OUTRA turma no mesmo tempo do ausente
  // (conflito de horário — não podem ser deslocados pra cobrir).
  const busyAtAbsentPeriodKeys = useMemo(() => {
    if (!absentPeriod) return new Set<string>();
    const set = new Set<string>();
    for (const r of dayRosters) {
      if (absentRoster && r.id === absentRoster.id) continue;
      const p = periodOfRoster(r, shiftPeriods);
      if (p && p.period_number === absentPeriod.period_number) {
        set.add(teacherKey(r));
      }
    }
    return set;
  }, [dayRosters, shiftPeriods, absentPeriod, absentRoster]);

  // Candidatos da MESMA turma, ordenados do último tempo para o primeiro,
  // que ainda não foram marcados como ausente e não são o próprio ausente.
  const hierarchyCandidates = useMemo(() => {
    if (!absentRoster || !absentPeriod) return [] as { roster: RosterLite; period: PeriodLite }[];
    const targetClass = normClass(absentRoster.class_name);
    // Fila: TODOS os tempos da turma no dia, do último → 1º, pulando o próprio tempo do ausente.
    // Vale igual pra Fundamental (4 tempos) e Médio (5 tempos).
    return dayRosters
      .filter((r) => r.id !== absentRoster.id && normClass(r.class_name) === targetClass)
      .map((r) => ({ roster: r, period: periodOfRoster(r, shiftPeriods) }))
      .filter((x): x is { roster: RosterLite; period: PeriodLite } => !!x.period)
      .filter(({ period }) => period.period_number !== absentPeriod.period_number)
      .filter(({ roster, period }) => (presence[`${roster.id}:${period.period_number}`] ?? "") !== "ausente")
      .filter(({ roster }) => !absentTeacherKeys.has(teacherKey(roster)))
      .filter(({ roster }) => !(busyCoveringTeacherKeys?.has(teacherKey(roster))))
      .sort((a, b) => b.period.period_number - a.period.period_number);
  }, [absentRoster, absentPeriod, dayRosters, shiftPeriods, presence, busyCoveringTeacherKeys, absentTeacherKeys]);

  const suggestion = hierarchyCandidates[suggestionIndex] ?? null;

  // Lista manual: professores da turma com status Aguardando naquele tempo do ausente
  // (ou vazio). Se não houver, oferece a escola toda.
  const manualClassCandidates = useMemo(() => {
    if (!absentRoster || !absentPeriod) return [] as { roster: RosterLite; period: PeriodLite }[];
    const targetClass = normClass(absentRoster.class_name);
    return dayRosters
      .filter((r) => r.id !== absentRoster.id && normClass(r.class_name) === targetClass)
      .filter((r) => !absentTeacherKeys.has(teacherKey(r)))
      .filter((r) => !(busyCoveringTeacherKeys?.has(teacherKey(r))))
      .map((r) => ({ roster: r, period: periodOfRoster(r, shiftPeriods) }))
      .filter((x): x is { roster: RosterLite; period: PeriodLite } => !!x.period)
      .filter(({ period }) => period.period_number !== absentPeriod.period_number)
      // Regra geral: sempre do ÚLTIMO tempo da turma para o primeiro.
      .sort((a, b) => b.period.period_number - a.period.period_number);
  }, [absentRoster, absentPeriod, dayRosters, shiftPeriods, busyCoveringTeacherKeys, absentTeacherKeys]);


  const schoolWideCandidates = useMemo(() => {
    if (!absentRoster || !absentPeriod) return [] as { roster: RosterLite; period: PeriodLite }[];
    return dayRosters
      .filter((r) => r.id !== absentRoster.id)
      .filter((r) => !absentTeacherKeys.has(teacherKey(r)))
      .filter((r) => !busyAtAbsentPeriodKeys.has(teacherKey(r)))
      .filter((r) => !(busyCoveringTeacherKeys?.has(teacherKey(r))))
      .map((r) => ({ roster: r, period: periodOfRoster(r, shiftPeriods) }))
      .filter((x): x is { roster: RosterLite; period: PeriodLite } => !!x.period)
      .filter(({ roster, period }) => {
        const st = presence[`${roster.id}:${period.period_number}`] ?? "";
        return st === "" || st === "pendente";
      })
      .filter(({ roster }) => {
        if (!q.trim()) return true;
        const s = (nameOf(roster) + " " + (roster.class_name ?? "") + " " + (roster.discipline ?? "")).toLowerCase();
        return s.includes(q.toLowerCase());
      })
      .sort((a, b) => b.period.period_number - a.period.period_number);
  }, [absentRoster, absentPeriod, dayRosters, shiftPeriods, presence, q, busyCoveringTeacherKeys, absentTeacherKeys, busyAtAbsentPeriodKeys]);


  const confirm = async (chosen: { roster: RosterLite; period: PeriodLite }) => {
    if (!absentRoster || !absentPeriod) return;
    setBusy(true);
    const payload = {
      school_id: schoolId,
      reassignment_date: today,
      class_name: absentRoster.class_name ?? "",
      shift: (absentRoster.shift ?? absentPeriod.shift ?? "").toString(),
      absent_roster_id: absentRoster.id,
      absent_teacher_name: absentRoster.teacher_name,
      absent_period_number: absentPeriod.period_number,
      covering_roster_id: chosen.roster.id,
      covering_teacher_name: chosen.roster.teacher_name,
      covering_original_period: chosen.period.period_number,
      vacated_period_number: chosen.period.period_number,
      vacated_end_time: chosen.period.end_time.slice(0, 5),
      reason: fullDayAbsence ? "falta_dia_todo" : "ausencia",
      created_by: userId,
    };
    const { error } = await supabase.from("room_reassignments" as any).insert(payload as any);
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao remanejar", description: error.message, variant: "destructive" });
      return;
    }
    try {
      const ch = supabase.channel(`painel_tv_${schoolId}`);
      await ch.subscribe();
      await ch.send({ type: "broadcast", event: "presence-refresh", payload: { at: Date.now() } });
      setTimeout(() => { supabase.removeChannel(ch); }, 500);
    } catch {}
    const notice =
      `AVISO: ${absentRoster.class_name ?? "Turma"} sairá às ${chosen.period.end_time.slice(0, 5)} hoje. ` +
      `Motivo: Antecipação de aula (${nameOf(chosen.roster)} cobriu o ${absentPeriod.period_number}º tempo).`;
    setLastNotice(notice);
    toast({ title: "Remanejamento confirmado", description: notice });
    onDone();
  };

  const confirmExtra = async () => {
    if (!absentRoster || !absentPeriod || !extraLocation) return;
    setBusy(true);
    const payload = {
      school_id: schoolId,
      reassignment_date: today,
      class_name: absentRoster.class_name ?? "",
      shift: (absentRoster.shift ?? absentPeriod.shift ?? "").toString(),
      absent_roster_id: absentRoster.id,
      absent_teacher_name: absentRoster.teacher_name,
      absent_period_number: absentPeriod.period_number,
      covering_roster_id: null,
      covering_teacher_name: `Atividade Extra Classe (${extraLocation})`,
      covering_original_period: absentPeriod.period_number,
      vacated_period_number: absentPeriod.period_number,
      vacated_end_time: absentPeriod.end_time.slice(0, 5),
      reason: "atividade_extra",
      note: extraLocation,
      created_by: userId,
    };
    const { error } = await supabase.from("room_reassignments" as any).insert(payload as any);
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao registrar", description: error.message, variant: "destructive" });
      return;
    }
    try {
      const ch = supabase.channel(`painel_tv_${schoolId}`);
      await ch.subscribe();
      await ch.send({ type: "broadcast", event: "presence-refresh", payload: { at: Date.now() } });
      setTimeout(() => { supabase.removeChannel(ch); }, 500);
    } catch {}
    toast({
      title: "Atividade Extra Classe registrada",
      description: `${absentRoster.class_name ?? "Turma"} — ${absentPeriod.period_number}º tempo em ${extraLocation}.`,
    });
    onDone();
    onClose();
  };

  const copyNotice = async () => {
    if (!lastNotice) return;
    try {
      await navigator.clipboard.writeText(lastNotice);
      toast({ title: "Aviso copiado", description: "Cole no grupo dos pais." });
    } catch {
      toast({ title: "Copie manualmente", description: lastNotice });
    }
  };

  const blockedFirstPeriod = !!absentPeriod && absentPeriod.period_number === 1 && !fullDayAbsence;

  // Design tokens locais — degradê azul-escuro + dourado, tipografia ampliada
  const goldText = "text-amber-300";
  const goldBorder = "border-amber-400/60";
  const glassCard = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 border-0 max-w-none w-screen h-[100dvh] sm:h-[92dvh] sm:w-[94vw] sm:max-w-2xl sm:rounded-3xl overflow-hidden flex flex-col text-white"
        style={{
          background:
            "linear-gradient(160deg, hsl(222 65% 14%) 0%, hsl(222 70% 10%) 45%, hsl(230 75% 8%) 100%)",
        }}
      >
        {/* Glow decorativo */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />

        {/* Header */}
        <DialogHeader className="relative px-5 pt-6 pb-4 border-b border-white/10 space-y-2 text-left">
          <div className="flex items-center gap-2">
            <span className={`h-9 w-9 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg shadow-amber-500/30`}>
              <AlertTriangle className="h-5 w-5 text-blue-950" />
            </span>
            <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${goldText}`}>Remanejamento</span>
          </div>
          <DialogTitle className="text-2xl sm:text-3xl font-black leading-tight text-white break-words">
            Prof. <span className={goldText}>{nameOf(absentRoster) || "—"}</span>
            {absentRoster?.discipline ? <span className="text-white/80"> de {absentRoster.discipline}</span> : null}
          </DialogTitle>
          <p className="text-base sm:text-lg text-white/90 font-semibold">
            Ausente no <span className={goldText}>{absentPeriod?.period_number}º tempo</span> — Turma {absentRoster?.class_name ?? "—"}
          </p>
          <DialogDescription className="text-sm sm:text-base text-white/70">
            {lastNotice
              ? "Remanejamento registrado. Copie o aviso e envie para os responsáveis."
              : "Deseja subir o tempo de um professor da turma para cobrir?"}
          </DialogDescription>
        </DialogHeader>

        {/* Corpo com scroll */}
        <div className="relative flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {!lastNotice && (
            <>
              {/* Toggle escopo da ausência */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFullDayAbsence(false)}
                  className={`h-14 rounded-2xl font-black text-sm sm:text-base border-2 transition-all ${
                    !fullDayAbsence
                      ? "bg-gradient-to-br from-amber-300 to-amber-500 text-blue-950 border-amber-200 shadow-lg shadow-amber-500/30"
                      : "bg-white/5 text-white/70 border-white/10"
                  }`}
                >
                  Somente este tempo
                </button>
                <button
                  type="button"
                  onClick={() => setFullDayAbsence(true)}
                  className={`h-14 rounded-2xl font-black text-sm sm:text-base border-2 transition-all ${
                    fullDayAbsence
                      ? "bg-gradient-to-br from-red-500 to-red-700 text-white border-red-400 shadow-lg shadow-red-500/30"
                      : "bg-white/5 text-white/70 border-white/10"
                  }`}
                >
                  Faltou todos os tempos
                </button>
              </div>

              {blockedFirstPeriod && (
                <div className="rounded-2xl bg-amber-400/10 border border-amber-400/40 p-3 text-sm text-amber-100 flex gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
                  <span>Em regra, o 1º tempo não é remanejado (professor pode estar atrasado). Se ainda assim decidir subir o tempo, a sugestão abaixo traz o professor do <b>último tempo</b> desta turma.</span>
                </div>
              )}

              {(
                <div className={`${glassCard} p-4 space-y-3`}>
                  <p className={`text-xs font-black uppercase tracking-widest ${goldText}`}>
                    Sugestão automática · Hierarquia
                  </p>
                  {suggestion ? (
                    <>
                      <div className="rounded-xl bg-blue-950/40 border border-white/10 p-3">
                        <p className="text-xl sm:text-2xl font-black text-white break-words">{nameOf(suggestion.roster)}</p>
                        <p className="text-sm sm:text-base text-white/70 mt-1">
                          {suggestion.roster.discipline ?? "—"} · <span className={goldText}>{suggestion.period.period_number}º tempo</span>
                          {" "}({suggestion.period.start_time.slice(0, 5)}–{suggestion.period.end_time.slice(0, 5)})
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={busy}
                          onClick={() => confirm(suggestion)}
                          className="h-14 rounded-2xl font-black text-base bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                        >
                          <ArrowUp className="h-5 w-5" /> Confirmar
                        </button>
                        <button
                          disabled={busy || hierarchyCandidates.length <= 1}
                          onClick={() => setSuggestionIndex((i) => (i + 1) % Math.max(1, hierarchyCandidates.length))}
                          className="h-14 rounded-2xl font-black text-sm bg-white/10 text-white border border-white/20 disabled:opacity-40 active:scale-[0.98]"
                        >
                          Próximo da fila
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-white/80">
                      Nenhum professor da turma disponível na hierarquia.
                      <button
                        className={`ml-1 underline font-black ${goldText}`}
                        onClick={() => { setShowSchoolWide(true); setShowManual(true); }}
                      >
                        Buscar na escola toda?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Escolha manual */}
              <div>
                {!showManual ? (
                  <button
                    className="w-full h-14 rounded-2xl border border-white/20 bg-white/5 hover:bg-white/10 text-white font-black text-base flex items-center justify-center gap-2"
                    onClick={() => setShowManual(true)}
                  >
                    <Users className="h-5 w-5" /> Escolher outro professor
                  </button>
                ) : (
                  <div className={`${glassCard} p-3 space-y-3`}>
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/70">
                      <span className={goldText}>{showSchoolWide ? "Toda a escola" : "Professores da turma"}</span>
                      <button
                        className={`ml-auto underline ${goldText}`}
                        onClick={() => setShowSchoolWide((v) => !v)}
                      >
                        {showSchoolWide ? "Só da turma" : "Escola toda"}
                      </button>
                    </div>
                    {showSchoolWide && (
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                        <input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Buscar por nome, turma ou disciplina"
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-white/15 bg-blue-950/40 text-white placeholder:text-white/40 text-sm outline-none focus:border-amber-300"
                        />
                      </div>
                    )}
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                      {(showSchoolWide ? schoolWideCandidates : manualClassCandidates).map(({ roster, period }) => (
                        <button
                          key={`${roster.id}:${period.period_number}`}
                          disabled={busy}
                          onClick={() => confirm({ roster, period })}
                          className="w-full text-left px-3 py-3 rounded-xl bg-blue-950/40 hover:bg-blue-900/60 border border-white/10 flex items-center gap-3 disabled:opacity-50"
                        >
                          <ArrowUp className={`h-5 w-5 ${goldText} shrink-0`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-black text-white break-words">{nameOf(roster)}</p>
                            <p className="text-xs text-white/60 break-words">
                              {roster.class_name} · {roster.discipline ?? "—"} · <span className={goldText}>{period.period_number}º tempo</span>
                            </p>
                          </div>
                        </button>
                      ))}
                      {(showSchoolWide ? schoolWideCandidates : manualClassCandidates).length === 0 && (
                        <p className="text-sm text-white/60 text-center py-6">
                          Nenhum professor disponível.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Atividade Extra Classe */}
              <div>
                {!showExtra ? (
                  <button
                    className={`w-full h-14 rounded-2xl border-2 ${goldBorder} bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 font-black text-base flex items-center justify-center gap-2`}
                    onClick={() => setShowExtra(true)}
                  >
                    <MapPin className="h-5 w-5" /> Atividade Extra Classe
                  </button>
                ) : (
                  <div className={`${glassCard} p-3 space-y-3`}>
                    <p className={`text-xs font-black uppercase tracking-widest ${goldText}`}>
                      Escolha o local
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {EXTRA_LOCATIONS.map((loc) => (
                        <button
                          key={loc}
                          onClick={() => setExtraLocation(loc)}
                          className={`h-14 rounded-2xl border-2 text-base font-black transition-all ${
                            extraLocation === loc
                              ? "bg-gradient-to-br from-amber-300 to-amber-500 text-blue-950 border-amber-200 shadow-lg shadow-amber-500/30"
                              : "bg-white/5 text-white/80 border-white/10"
                          }`}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={busy || !extraLocation}
                      onClick={confirmExtra}
                      className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/30 disabled:opacity-40 active:scale-[0.98]"
                    >
                      Confirmar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {lastNotice && (
            <div className={`rounded-2xl border-2 ${goldBorder} bg-amber-400/10 p-4 space-y-3`}>
              <p className={`text-xs font-black uppercase tracking-widest ${goldText}`}>Aviso para os pais</p>
              <p className="text-base sm:text-lg text-white leading-relaxed">{lastNotice}</p>
              <button onClick={copyNotice} className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-br from-amber-300 to-amber-500 text-blue-950 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 active:scale-[0.98]">
                <Copy className="h-5 w-5" /> Copiar Aviso
              </button>
              <button onClick={onClose} className="w-full h-12 rounded-2xl font-black text-sm bg-white/10 text-white border border-white/20">Fechar</button>
            </div>
          )}
        </div>

        {/* Footer fixo */}
        {!lastNotice && (
          <div className="relative px-5 py-3 border-t border-white/10 bg-blue-950/40 backdrop-blur-sm">
            <button onClick={onClose} className="w-full h-12 rounded-2xl font-black text-sm bg-white/5 hover:bg-white/10 text-white/80 border border-white/10">
              Cancelar
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
