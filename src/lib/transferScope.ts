/**
 * Escopo por turno da "Transferência de responsabilidade" do Assistente de Aluno.
 * Regras:
 *  - o turno do assistente vem das turmas atribuídas a ele (assistant_classes);
 *  - só aparecem assistentes destino do MESMO turno;
 *  - a lista de aulas mostra todas as aulas do turno: as dele (livres) primeiro
 *    e as de outros assistentes (travadas / não transferíveis) depois.
 */

export type TransferShift = "manha" | "tarde" | "noite";

export function normalizeShiftValue(value: string | null | undefined): TransferShift {
  const v = (value ?? "").toLowerCase().trim();
  if (v === "vespertino" || v === "tarde") return "tarde";
  if (v === "noturno" || v === "noite") return "noite";
  return "manha";
}

export type ClassAssignment = { assistant_user_id: string; class_label?: string | null; shift: string | null };
export type AssistantOption = { user_id: string; full_name: string };
export type RosterLike = {
  id: string;
  class_name: string | null;
  shift: string | null;
  start_time: string;
  period_id?: string | null;
};
export type PeriodLike = { id: string; shift: string };

/** Turno predominante do assistente logado; fallback = turno em exibição. */
export function resolveMyShift(
  classAssignments: ClassAssignment[],
  myUserId: string | undefined,
  fallbackShift: TransferShift,
): TransferShift {
  const counts: Record<string, number> = {};
  classAssignments
    .filter((c) => c.assistant_user_id === myUserId)
    .forEach((c) => {
      const s = normalizeShiftValue(c.shift);
      counts[s] = (counts[s] ?? 0) + 1;
    });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (top?.[0] as TransferShift) ?? fallbackShift;
}

/** Assistentes destino: mesmo turno, exceto eu. */
export function filterTransferAssistants(
  assistants: AssistantOption[],
  classAssignments: ClassAssignment[],
  myShift: TransferShift,
  myUserId: string | undefined,
): AssistantOption[] {
  const sameShift = new Set(
    classAssignments.filter((c) => normalizeShiftValue(c.shift) === myShift).map((c) => c.assistant_user_id),
  );
  return assistants.filter((a) => a.user_id !== myUserId && sameShift.has(a.user_id));
}

/** Aulas do turno com o dono resolvido; minhas primeiro. */
export function buildTransferRoster<R extends RosterLike>(
  roster: R[],
  periods: PeriodLike[],
  myShift: TransferShift,
  myUserId: string | undefined,
  resolveAssistantId: (r: R) => string,
  compareClassNames: (a: string | null, b: string | null) => number,
): { r: R; ownerId: string; mine: boolean }[] {
  return roster
    .filter((r) => {
      const p = r.period_id ? periods.find((x) => x.id === r.period_id) : undefined;
      return normalizeShiftValue(p?.shift ?? r.shift) === myShift;
    })
    .map((r) => {
      const ownerId = resolveAssistantId(r);
      return { r, ownerId, mine: ownerId === myUserId };
    })
    .sort((a, b) => {
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      const c = compareClassNames(a.r.class_name, b.r.class_name);
      if (c !== 0) return c;
      return a.r.start_time.localeCompare(b.r.start_time);
    });
}
