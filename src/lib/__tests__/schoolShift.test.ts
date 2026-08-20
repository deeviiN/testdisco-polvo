import { describe, expect, it } from "vitest";
import { currentSchoolPeriod, schoolTimeShift } from "@/lib/schoolShift";

const at = (time: string) => new Date(`2026-07-08T${time}`);

const periods = [
  { period_number: 1, shift: "manha", start_time: "07:30:00", end_time: "08:25:00" },
  { period_number: 2, shift: "manha", start_time: "08:25:00", end_time: "09:20:00" },
  { period_number: 3, shift: "manha", start_time: "09:40:00", end_time: "10:35:00" },
  { period_number: 4, shift: "manha", start_time: "10:35:00", end_time: "11:30:00" },
  { period_number: 5, shift: "manha", start_time: "11:30:00", end_time: "12:45:00" },
  { period_number: 1, shift: "tarde", start_time: "13:00:00", end_time: "13:55:00" },
  { period_number: 2, shift: "tarde", start_time: "13:55:00", end_time: "14:50:00" },
  { period_number: 3, shift: "tarde", start_time: "15:10:00", end_time: "16:05:00" },
  { period_number: 4, shift: "tarde", start_time: "16:05:00", end_time: "17:00:00" },
  { period_number: 5, shift: "tarde", start_time: "17:00:00", end_time: "17:55:00" },
  { period_number: 1, shift: "noite", start_time: "18:45:00", end_time: "19:40:00" },
];

describe("turno escolar por horários cadastrados", () => {
  it("mantém manhã até encerrar o quinto tempo da manhã", () => {
    expect(schoolTimeShift(periods, at("11:31:00"))).toBe("manha");
    expect(schoolTimeShift(periods, at("12:00:00"))).toBe("manha");
    expect(schoolTimeShift(periods, at("12:44:59"))).toBe("manha");
    expect(schoolTimeShift(periods, at("12:45:00"))).toBe("manha");
    expect(currentSchoolPeriod(periods, "manha", at("12:00:00"))?.period_number).toBe(5);
  });

  it("não sai do quarto tempo direto para a tarde; primeiro entra no quinto da manhã", () => {
    expect(schoolTimeShift(periods, at("11:30:00"))).toBe("manha");
    expect(currentSchoolPeriod(periods, "manha", at("11:30:00"))?.period_number).toBe(5);
    expect(currentSchoolPeriod(periods, "manha", at("12:44:59"))?.period_number).toBe(5);
  });

  it("não pula para noite antes do fim do último tempo da tarde", () => {
    expect(schoolTimeShift(periods, at("17:30:00"))).toBe("tarde");
    expect(schoolTimeShift(periods, at("17:55:00"))).toBe("tarde");
    expect(schoolTimeShift(periods, at("18:45:00"))).toBe("noite");
  });
});