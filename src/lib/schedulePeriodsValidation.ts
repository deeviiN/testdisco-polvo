// Validação de tempos do quadro de horários (schedule_periods / schedule_reduced_days)
export interface PeriodLike {
  shift: string;
  period_number: number;
  label?: string;
  start_time: string; // HH:MM ou HH:MM:SS
  end_time: string;
  _delete?: boolean;
}

const SHIFT_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const toMin = (t: string): number => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/**
 * Valida lista de tempos. Retorna mensagem de erro ou null se tudo ok.
 * - Formato HH:MM válido
 * - end > start (rejeita igual ou invertido)
 * - period_number entre 1 e 10 e único por turno
 * - sem sobreposição entre tempos do mesmo turno
 */
export function validateSchedulePeriods(rows: PeriodLike[]): string | null {
  const active = rows.filter((p) => !p._delete);
  if (active.length === 0) return "Adicione pelo menos um tempo.";

  for (const p of active) {
    const shiftLabel = SHIFT_LABEL[p.shift] ?? p.shift;
    const tag = `${shiftLabel} • ${p.period_number}º`;

    if (!HHMM_RE.test(p.start_time) || !HHMM_RE.test(p.end_time)) {
      return `${tag}: horário inválido. Use o formato HH:MM.`;
    }
    if (p.period_number < 1 || p.period_number > 10) {
      return `${tag}: número do tempo deve estar entre 1 e 10.`;
    }
    const s = toMin(p.start_time);
    const e = toMin(p.end_time);
    if (e <= s) {
      return `${tag}: o horário final precisa ser maior que o inicial.`;
    }
  }

  // Agrupa por turno para checar duplicidade e sobreposição
  const byShift = new Map<string, PeriodLike[]>();
  for (const p of active) {
    if (!byShift.has(p.shift)) byShift.set(p.shift, []);
    byShift.get(p.shift)!.push(p);
  }

  for (const [shift, items] of byShift) {
    const shiftLabel = SHIFT_LABEL[shift] ?? shift;

    // Duplicidade de period_number
    const numbers = new Set<number>();
    for (const p of items) {
      if (numbers.has(p.period_number)) {
        return `${shiftLabel}: há mais de um ${p.period_number}º tempo. Cada número deve ser único.`;
      }
      numbers.add(p.period_number);
    }

    // Sobreposição
    const sorted = [...items].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (toMin(cur.start_time) < toMin(prev.end_time)) {
        return `${shiftLabel}: ${prev.period_number}º e ${cur.period_number}º tempo se sobrepõem.`;
      }
    }
  }

  return null;
}
