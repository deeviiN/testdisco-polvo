import { describe, it, expect } from "vitest";
import {
  buildHierarchyCandidates,
  buildAbsentTeacherKeys,
  buildBusyAtPeriodKeys,
  type PeriodLike,
  type RosterLike,
} from "@/lib/substituteFilters";

const periods: PeriodLike[] = [
  { id: "p1", shift: "matutino", period_number: 1, start_time: "07:00", end_time: "07:50" },
  { id: "p2", shift: "matutino", period_number: 2, start_time: "07:50", end_time: "08:40" },
  { id: "p3", shift: "matutino", period_number: 3, start_time: "08:40", end_time: "09:30" },
  { id: "p4", shift: "matutino", period_number: 4, start_time: "09:50", end_time: "10:40" },
];

const mk = (o: Partial<RosterLike> & { id: string; teacher_name: string; start_time: string; end_time: string }): RosterLike => ({
  nickname: null,
  class_name: null,
  shift: "matutino",
  period_id: null,
  ...o,
});

// Cenário reportado: Adele falta 1º/92. Cláudio dá 4º/92 mas também 1º/85
// e foi marcado ausente na 85 → NÃO pode ser sugerido como substituto.
describe("buildHierarchyCandidates — regra de ausência cross-turma", () => {
  const adeleAbs = mk({ id: "r_adele_1_92", teacher_name: "Adele", class_name: "92", start_time: "07:00", end_time: "07:50" });
  const claudio4_92 = mk({ id: "r_claudio_4_92", teacher_name: "Cláudio", class_name: "92", start_time: "09:50", end_time: "10:40" });
  const claudio1_85 = mk({ id: "r_claudio_1_85", teacher_name: "Cláudio", class_name: "85", start_time: "07:00", end_time: "07:50" });
  const maria3_92 = mk({ id: "r_maria_3_92", teacher_name: "Maria", class_name: "92", start_time: "08:40", end_time: "09:30" });
  const joao2_92 = mk({ id: "r_joao_2_92", teacher_name: "João", class_name: "92", start_time: "07:50", end_time: "08:40" });

  const dayRosters = [adeleAbs, claudio4_92, claudio1_85, maria3_92, joao2_92];

  it("exclui Cláudio quando ele está ausente em outra turma", () => {
    const presence = {
      "r_adele_1_92:1": "ausente",
      "r_claudio_1_85:1": "ausente", // Cláudio faltou na 85
    };
    const result = buildHierarchyCandidates({
      absentRoster: adeleAbs,
      absentPeriod: periods[0],
      dayRosters,
      shiftPeriods: periods,
      presence,
      fullDayAbsence: true,
    });
    const names = result.map((c) => c.roster.teacher_name);
    expect(names).not.toContain("Cláudio");
    // fila do último→primeiro: Maria(3º) depois João(2º)
    expect(names).toEqual(["Maria", "João"]);
  });

  it("inclui Cláudio quando ele não tem conflito no tempo alvo", () => {
    // Removemos claudio1_85 → Cláudio só dá 4º/92, sem conflito no 1º tempo.
    const presence: Record<string, string> = { "r_adele_1_92:1": "ausente" };
    const result = buildHierarchyCandidates({
      absentRoster: adeleAbs,
      absentPeriod: periods[0],
      dayRosters: [adeleAbs, claudio4_92, maria3_92, joao2_92],
      shiftPeriods: periods,
      presence,
      fullDayAbsence: true,
    });
    expect(result.map((c) => c.roster.teacher_name)).toEqual(["Cláudio", "Maria", "João"]);
  });


  it("mantém candidato que dá aula em outra turma no mesmo tempo da falta (sobe o tempo)", () => {
    const claudio1_85Present = { ...claudio1_85 };
    const presence = { "r_adele_1_92:1": "ausente" };
    const result = buildHierarchyCandidates({
      absentRoster: adeleAbs,
      absentPeriod: periods[0],
      dayRosters: [adeleAbs, claudio4_92, claudio1_85Present, maria3_92, joao2_92],
      shiftPeriods: periods,
      presence,
      fullDayAbsence: true,
    });
    // Regra do último tempo: Cláudio (4º na 92) vem primeiro mesmo dando aula na 85.
    expect(result.map((c) => c.roster.teacher_name)).toEqual(["Cláudio", "Maria", "João"]);
  });


  it("respeita busyCoveringIds (já cobrindo outra ausência)", () => {
    const presence = { "r_adele_1_92:1": "ausente" };
    const result = buildHierarchyCandidates({
      absentRoster: adeleAbs,
      absentPeriod: periods[0],
      dayRosters: [adeleAbs, claudio4_92, maria3_92, joao2_92],
      shiftPeriods: periods,
      presence,
      fullDayAbsence: true,
      busyCoveringIds: new Set(["r_claudio_4_92"]),
    });
    expect(result.map((c) => c.roster.teacher_name)).not.toContain("Cláudio");
  });

  it("buildAbsentTeacherKeys agrega ausência em qualquer tempo/turma", () => {
    const keys = buildAbsentTeacherKeys(
      [claudio4_92, claudio1_85, maria3_92],
      periods,
      { "r_claudio_1_85:1": "ausente" },
    );
    expect(keys.has("cláudio")).toBe(true);
    expect(keys.has("maria")).toBe(false);
  });

  it("buildBusyAtPeriodKeys detecta conflito no tempo alvo", () => {
    const keys = buildBusyAtPeriodKeys(
      [adeleAbs, claudio1_85, maria3_92],
      periods,
      adeleAbs,
      periods[0],
    );
    expect(keys.has("cláudio")).toBe(true);
    expect(keys.has("maria")).toBe(false);
  });
});
