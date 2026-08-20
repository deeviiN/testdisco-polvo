/**
 * Filtros puros usados pelo RemanejamentoModal para escolher substituto.
 * Extraídos em módulo próprio para facilitar teste unitário.
 */

export type RosterLike = {
  id: string;
  teacher_name: string;
  nickname?: string | null;
  class_name?: string | null;
  shift?: string | null;
  period_id?: string | null;
  start_time: string;
  end_time: string;
};

export type PeriodLike = {
  id: string;
  shift: string;
  period_number: number;
  start_time: string;
  end_time: string;
};

export const teacherKey = (r: RosterLike): string =>
  (r.teacher_name || r.nickname || "").trim().toLowerCase();

export const normClass = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export function periodOfRoster<R extends RosterLike, P extends PeriodLike>(
  r: R,
  periods: P[],
): P | null {
  if (r.period_id) {
    const p = periods.find((x) => x.id === r.period_id);
    if (p) return p;
  }
  return (
    periods.find((p) => p.start_time.slice(0, 5) === r.start_time.slice(0, 5)) ??
    null
  );
}

/** Professores marcados como ausente em QUALQUER linha do dia. */
export function buildAbsentTeacherKeys(
  dayRosters: RosterLike[],
  shiftPeriods: PeriodLike[],
  presence: Record<string, string>,
): Set<string> {
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
}

/** Professores com aula em OUTRA turma no mesmo tempo da falta. */
export function buildBusyAtPeriodKeys(
  dayRosters: RosterLike[],
  shiftPeriods: PeriodLike[],
  absentRoster: RosterLike | null,
  absentPeriod: PeriodLike | null,
): Set<string> {
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
}

/** Fila hierárquica (último → primeiro tempo) de candidatos válidos da mesma turma. */
export function buildHierarchyCandidates(params: {
  absentRoster: RosterLike | null;
  absentPeriod: PeriodLike | null;
  dayRosters: RosterLike[];
  shiftPeriods: PeriodLike[];
  presence: Record<string, string>;
  fullDayAbsence: boolean;
  busyCoveringIds?: Set<string>;
}): { roster: RosterLike; period: PeriodLike }[] {
  const {
    absentRoster,
    absentPeriod,
    dayRosters,
    shiftPeriods,
    presence,
    fullDayAbsence,
    busyCoveringIds,
  } = params;
  if (!absentRoster || !absentPeriod) return [];
  const absentKeys = buildAbsentTeacherKeys(dayRosters, shiftPeriods, presence);
  const targetClass = normClass(absentRoster.class_name);
  // Regra: varrer TODOS os tempos da turma no dia, do último ao primeiro,
  // pulando apenas o próprio tempo do ausente. Independe de 4 ou 5 tempos.
  // O candidato pode estar dando aula em outra turma no tempo da falta —
  // ele sobe o tempo e sai mais cedo. Só é excluído se estiver ausente
  // ou se já estiver cobrindo outra falta no dia.
  void fullDayAbsence;
  return dayRosters
    .filter((r) => r.id !== absentRoster.id && normClass(r.class_name) === targetClass)
    .map((r) => ({ roster: r, period: periodOfRoster(r, shiftPeriods) }))
    .filter((x): x is { roster: RosterLike; period: PeriodLike } => !!x.period)
    .filter(({ period }) => period.period_number !== absentPeriod.period_number)
    .filter(
      ({ roster, period }) =>
        (presence[`${roster.id}:${period.period_number}`] ?? "") !== "ausente",
    )
    .filter(({ roster }) => !absentKeys.has(teacherKey(roster)))
    .filter(({ roster }) => !busyCoveringIds?.has(roster.id))
    .sort((a, b) => b.period.period_number - a.period.period_number);
}

