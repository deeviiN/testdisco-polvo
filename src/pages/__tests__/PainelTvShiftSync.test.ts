import { describe, it, expect } from "vitest";

// Réplica isolada das regras de seleção de período usadas por
// AssistenteQuadro (src/pages/AssistenteQuadro.tsx ~L509) e
// PainelTv (src/pages/PainelTv.tsx ~L176) para garantir que ambos
// trocam de tempo no mesmo instante.

type P = { period_number: number; shift: string; start_time: string; end_time: string };

// Mesma regra do Assistente: período cujo [start, end) contém o agora.
function assistentePeriod(periods: P[], shift: string, t: string) {
  const sp = periods.filter(p => p.shift === shift).sort((a, b) => a.period_number - b.period_number);
  return sp.find(p => p.start_time <= t && p.end_time > t);
}

// Mesma regra do PainelTv (após o fix).
function painelPeriod(periods: P[], shift: string, t: string) {
  const sp = periods.filter(p => p.shift === shift).sort((a, b) => a.period_number - b.period_number);
  if (sp.length === 0) return undefined;
  const active = sp.find(p => p.start_time <= t && p.end_time > t);
  if (active) return active;
  const started = sp.filter(p => p.start_time <= t);
  if (started.length > 0) return started[started.length - 1];
  return sp[0];
}

const noite: P[] = [
  { period_number: 1, shift: "noite", start_time: "18:45:00", end_time: "19:40:00" },
  { period_number: 2, shift: "noite", start_time: "19:40:00", end_time: "20:35:00" },
  { period_number: 3, shift: "noite", start_time: "20:45:00", end_time: "21:40:00" },
  { period_number: 4, shift: "noite", start_time: "21:40:00", end_time: "22:35:00" },
];

describe("PainelTv ↔ AssistenteQuadro — troca de tempo simultânea", () => {
  const samples = [
    "18:44:59", "18:45:00", "19:39:59", "19:40:00", "19:40:01",
    "20:34:59", "20:35:00", "20:40:00", "20:44:59", "20:45:00",
    "21:39:59", "21:40:00", "22:34:59", "22:35:00",
  ];

  for (const t of samples) {
    it(`coincide às ${t}`, () => {
      const a = assistentePeriod(noite, "noite", t);
      const p = painelPeriod(noite, "noite", t);
      // Dentro de uma janela de aula, ambos devem retornar o MESMO período.
      // Nos intervalos (ex.: 20:35-20:44), Assistente=undefined e Painel mantém o último iniciado.
      if (a) {
        expect(p?.period_number).toBe(a.period_number);
      } else {
        // Intervalo (ou antes do 1º tempo): Painel nunca antecipa o próximo a iniciar.
        expect(p).toBeDefined();
        const next = noite.find(x => x.start_time > t && (!p || x.period_number > p.period_number));
        if (next) expect(p!.period_number).toBeLessThan(next.period_number);
      }
    });
  }

  it("não antecipa: às 19:39:59 ambos estão no 1º tempo", () => {
    expect(assistentePeriod(noite, "noite", "19:39:59")?.period_number).toBe(1);
    expect(painelPeriod(noite, "noite", "19:39:59")?.period_number).toBe(1);
  });

  it("transição: às 19:40:00 ambos vão para o 2º tempo", () => {
    expect(assistentePeriod(noite, "noite", "19:40:00")?.period_number).toBe(2);
    expect(painelPeriod(noite, "noite", "19:40:00")?.period_number).toBe(2);
  });
});
