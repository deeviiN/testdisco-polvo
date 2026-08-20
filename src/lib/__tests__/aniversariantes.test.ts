import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Supabase mock ----
type Row = Record<string, unknown>;

const state: {
  aniversariantes: Row[];
  panelSettings: Row | null;
  panelError: { message: string } | null;
} = {
  aniversariantes: [],
  panelSettings: null,
  panelError: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const fromPanelSettings = () => {
    const builder: any = {
      select() { return builder; },
      eq() { return builder; },
      maybeSingle() {
        return Promise.resolve({
          data: state.panelSettings,
          error: state.panelError,
        });
      },
    };
    return builder;
  };

  return {
    supabase: {
      rpc: (fn: string, args: any) => {
        if (fn !== "get_painel_aniversariantes") {
          throw new Error(`RPC não mockada: ${fn}`);
        }
        const [y, m, d] = String(args._ref_date).split("-").map(Number);
        const ref = new Date(y, m - 1, d);
        const span = ref.getDay() === 5 ? 3 : 0;
        const pairs: { dia: number; mes: number }[] = [];
        for (let i = 0; i <= span; i++) {
          const nd = new Date(ref);
          nd.setDate(nd.getDate() + i);
          pairs.push({ dia: nd.getDate(), mes: nd.getMonth() + 1 });
        }
        const data = state.aniversariantes.filter(
          (r) =>
            r.school_id === args._school_id &&
            pairs.some((p) => p.dia === r.dia && p.mes === r.mes),
        );
        return Promise.resolve({ data, error: null });
      },
      from: (table: string) => {
        if (table === "panel_settings") return fromPanelSettings();
        throw new Error(`Tabela não mockada: ${table}`);
      },
    },
  };
});


// Evita depender de localStorage nos testes
vi.mock("@/lib/holidays", async () => {
  const actual = await vi.importActual<typeof import("@/lib/holidays")>("@/lib/holidays");
  return { ...actual, loadCustomHolidays: () => [] };
});

import {
  getAniversariantesDoDia,
  isPanelAniversariantesEnabled,
} from "@/lib/aniversariantes";

const SCHOOL = "school-1";
const mk = (nome: string, dia: number, mes: number): Row => ({
  id: `${nome}-${dia}-${mes}`,
  school_id: SCHOOL,
  nome,
  dia,
  mes,
  cargo: null,
  setor: null,
  foto_url: null,
});

describe("getAniversariantesDoDia", () => {
  beforeEach(() => {
    state.aniversariantes = [];
    state.panelSettings = null;
    state.panelError = null;
  });

  it("em dia útil (quarta) retorna apenas quem faz aniversário no próprio dia — sem antecipar feriado à frente", async () => {
    // 2025-11-19 = quarta. 2025-11-20 (Consciência Negra) é feriado nacional.
    const wednesday = new Date(2025, 10, 19);
    state.aniversariantes = [
      mk("Ana", 19, 11),   // hoje
      mk("Bruno", 20, 11), // amanhã, feriado — não deve antecipar (não é sexta)
    ];
    const result = await getAniversariantesDoDia(SCHOOL, wednesday);
    expect(result.map((r) => r.nome).sort()).toEqual(["Ana"]);
  });

  it("na sexta antecipa aniversários de sábado, domingo e feriado do fim de semana", async () => {
    // 2025-10-03 = sexta. 04 sáb, 05 dom + Criação de Roraima (feriado estadual).
    const friday = new Date(2025, 9, 3);
    state.aniversariantes = [
      mk("Carla", 3, 10),   // hoje
      mk("Diego", 4, 10),   // sábado — antecipa
      mk("Eva", 5, 10),     // domingo (e feriado RR) — antecipa
      mk("Fábio", 6, 10),   // segunda útil — NÃO antecipa
    ];
    const result = await getAniversariantesDoDia(SCHOOL, friday);
    expect(result.map((r) => r.nome).sort()).toEqual(["Carla", "Diego", "Eva"]);
  });

  it("na sexta antecipa também para segunda-feira quando ela é feriado", async () => {
    // Carnaval 2025: segunda 03/03 e terça 04/03. A sexta anterior é 28/02/2025.
    const friday = new Date(2025, 1, 28);
    state.aniversariantes = [
      mk("Gabi", 3, 3),   // segunda de Carnaval — antecipa
      mk("Hugo", 4, 3),   // terça de Carnaval — fora da janela (+1..+3 = sáb 1, dom 2, seg 3)
    ];
    const result = await getAniversariantesDoDia(SCHOOL, friday);
    expect(result.map((r) => r.nome).sort()).toEqual(["Gabi"]);
  });

  it("retorna lista vazia quando não há registros no dia", async () => {
    const wednesday = new Date(2025, 10, 19);
    state.aniversariantes = [mk("Zeca", 1, 1)];
    const result = await getAniversariantesDoDia(SCHOOL, wednesday);
    expect(result).toEqual([]);
  });
});

describe("isPanelAniversariantesEnabled (toggle panel_settings.mostrar_aniv_servidores)", () => {
  beforeEach(() => {
    state.panelSettings = null;
    state.panelError = null;
  });

  it("retorna true quando o toggle está ligado", async () => {
    state.panelSettings = { mostrar_aniv_servidores: true };
    expect(await isPanelAniversariantesEnabled(SCHOOL)).toBe(true);
  });

  it("retorna false quando o toggle está desligado", async () => {
    state.panelSettings = { mostrar_aniv_servidores: false };
    expect(await isPanelAniversariantesEnabled(SCHOOL)).toBe(false);
  });

  it("retorna false quando não existe registro de panel_settings", async () => {
    state.panelSettings = null;
    expect(await isPanelAniversariantesEnabled(SCHOOL)).toBe(false);
  });

  it("retorna false quando a consulta falha", async () => {
    state.panelSettings = null;
    state.panelError = { message: "boom" };
    expect(await isPanelAniversariantesEnabled(SCHOOL)).toBe(false);
  });
});
