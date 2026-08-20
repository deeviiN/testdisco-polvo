import { describe, it, expect } from "vitest";
import { resolveMyShift, filterTransferAssistants, buildTransferRoster } from "@/lib/transferScope";

const KATIA = "u-katia";       // tarde
const LUCIA = "u-lucia";       // tarde
const JOAO = "u-joao";         // manhã
const MARIA = "u-maria";       // manhã

const assistants = [
  { user_id: KATIA, full_name: "Kátia Souza" },
  { user_id: LUCIA, full_name: "Lúcia Prado" },
  { user_id: JOAO, full_name: "João Quevara" },
  { user_id: MARIA, full_name: "Maria Lima" },
];

const classAssignments = [
  { assistant_user_id: KATIA, class_label: "101", shift: "vespertino" },
  { assistant_user_id: LUCIA, class_label: "201", shift: "tarde" },
  { assistant_user_id: JOAO, class_label: "61", shift: "manha" },
  { assistant_user_id: MARIA, class_label: "71", shift: "matutino" },
];

const periods = [
  { id: "p-m1", shift: "manha" },
  { id: "p-t1", shift: "tarde" },
];

type R = {
  id: string;
  class_name: string | null;
  shift: string | null;
  start_time: string;
  period_id?: string | null;
  assistant_user_id: string;
};

const roster: R[] = [
  { id: "r1", class_name: "101", shift: "tarde", start_time: "13:00", period_id: "p-t1", assistant_user_id: KATIA },
  { id: "r2", class_name: "201", shift: "tarde", start_time: "13:00", period_id: "p-t1", assistant_user_id: LUCIA },
  { id: "r3", class_name: "61", shift: "manha", start_time: "07:00", period_id: "p-m1", assistant_user_id: JOAO },
  { id: "r4", class_name: "71", shift: "manha", start_time: "07:00", period_id: "p-m1", assistant_user_id: MARIA },
];

const resolve = (r: R) => r.assistant_user_id;
const cmp = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "pt-BR", { numeric: true });

describe("transferência de responsabilidade — escopo por turno", () => {
  it("Kátia (tarde) vê só assistentes e turmas da tarde", () => {
    const myShift = resolveMyShift(classAssignments, KATIA, "manha");
    expect(myShift).toBe("tarde");

    const targets = filterTransferAssistants(assistants, classAssignments, myShift, KATIA);
    expect(targets.map((a) => a.user_id)).toEqual([LUCIA]);

    const list = buildTransferRoster(roster, periods, myShift, KATIA, resolve, cmp);
    expect(list.map((x) => x.r.id)).toEqual(["r1", "r2"]);
    expect(list[0].mine).toBe(true);   // 101 dela: livre
    expect(list[1].mine).toBe(false);  // 201 de outra: travada/marcada
  });

  it("João (manhã) vê só assistentes e turmas da manhã", () => {
    const myShift = resolveMyShift(classAssignments, JOAO, "tarde");
    expect(myShift).toBe("manha");

    const targets = filterTransferAssistants(assistants, classAssignments, myShift, JOAO);
    expect(targets.map((a) => a.user_id)).toEqual([MARIA]);

    const list = buildTransferRoster(roster, periods, myShift, JOAO, resolve, cmp);
    expect(list.map((x) => x.r.id)).toEqual(["r3", "r4"]);
    expect(list[0].mine).toBe(true);
    expect(list[1].mine).toBe(false);
  });

  it("só as aulas próprias são transferíveis", () => {
    const list = buildTransferRoster(roster, periods, "tarde", KATIA, resolve, cmp);
    expect(list.filter((x) => x.mine).map((x) => x.r.id)).toEqual(["r1"]);
  });
});
