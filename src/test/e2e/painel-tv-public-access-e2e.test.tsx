/**
 * E2E — PainelTv abre e renderiza dados sem sessão autenticada.
 *
 * Simula um dispositivo (TV/tablet) sem login: nenhum usuário ativo
 * no client supabase. O painel deve carregar:
 *  - Nome da escola via get_school_public_info (RPC pública)
 *  - Períodos, escala e presenças via get_painel_tv_data (RPC pública)
 *
 * Garante que nenhuma leitura direta de tabelas (que exigiria RLS
 * autenticada) seja feita, e que o nome do professor renderize na UI.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PainelTv from "@/pages/PainelTv";

const fromSpy = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("PainelTv não deve usar .from() sem autenticação");
  }),
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {

    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    },
    rpc: (name: string, _args: any) => {
      if (name === "get_school_public_info") {
        return Promise.resolve({
          data: [
            {
              id: "school-1",
              name: "ESCOLA PÚBLICA TESTE",
              city: "Boa Vista",
              state: "RR",
              inep_code: "12345678",
              network: "estadual",
              is_active: true,
              logo_url: null,
              address: null,
            },
          ],
          error: null,
        });
      }
      if (name === "get_painel_tv_data") {
        return Promise.resolve({
          data: {
            periods: [
              {
                id: "p1",
                school_id: "school-1",
                shift: "manha",
                period_number: 1,
                label: "1º Tempo",
                start_time: "07:00:00",
                end_time: "07:50:00",
              },
            ],
            roster: [
              {
                id: "r1",
                school_id: "school-1",
                teacher_name: "Maria da Silva",
                nickname: null,
                discipline: "Matemática",
                class_name: "9º A",
                weekday: new Date().getDay(),
                start_time: "07:00:00",
                end_time: "07:50:00",
                shift: "manha",
                block_name: null,
                room_name: "Sala 1",
                period_id: "p1",
              },
            ],
            presence: [{ roster_id: "r1", status: "presente" }],
            reduced: [],
            today: new Date().toISOString().slice(0, 10),
            weekday: new Date().getDay(),
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: fromSpy,
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
    }),
    removeChannel: vi.fn(),
  },
}));

describe("E2E — PainelTv acessível sem sessão", () => {
  it("renderiza nome da escola e escala via RPCs públicas, sem usar .from()", async () => {
    render(
      <MemoryRouter initialEntries={["/painel-tv?school=school-1"]}>
        <PainelTv />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/ESCOLA PÚBLICA TESTE/i)).toBeInTheDocument(),
    );

    // Professor da escala aparece na tela
    await waitFor(() =>
      expect(screen.getByText(/Maria da Silva|Maria/i)).toBeInTheDocument(),
    );

    // Nenhuma leitura direta de tabela foi feita
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("mostra fallback quando o parâmetro school não é informado", async () => {
    render(
      <MemoryRouter initialEntries={["/painel-tv"]}>
        <PainelTv />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Parâmetro "school" não informado/i),
    ).toBeInTheDocument();
  });
});
