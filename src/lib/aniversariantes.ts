import { supabase } from "@/integrations/supabase/client";
import { getAllHolidaysForYear, loadCustomHolidays } from "./holidays";

export interface Aniversariante {
  id: string;
  school_id: string;
  nome: string;
  dia: number;
  mes: number;
  cargo: string | null;
  setor: string | null;
  foto_url: string | null;
}

/**
 * Retorna se o Painel TV deve exibir a faixa de aniversariantes
 * conforme o toggle `panel_settings.mostrar_aniv_servidores`.
 */
export async function isPanelAniversariantesEnabled(
  schoolId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("panel_settings")
    .select("mostrar_aniv_servidores")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error || !data) return false;
  return !!(data as { mostrar_aniv_servidores?: boolean }).mostrar_aniv_servidores;
}

const pad = (n: number) => String(n).padStart(2, "0");
const mmdd = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Retorna aniversariantes do dia — se hoje for sexta, antecipa
 * quem faz aniversário no sábado, domingo ou em feriado até segunda.
 */
export async function getAniversariantesDoDia(
  schoolId: string,
  reference: Date = new Date(),
): Promise<Aniversariante[]> {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Dom ... 5=Sex ... 6=Sab

  // Janela de datas a considerar
  const window: Date[] = [today];
  if (dow === 5) {
    // Sexta: também busca sáb + dom (e segunda se for feriado)
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      window.push(d);
    }
  }

  // Feriados do ano corrente
  const year = today.getFullYear();
  const holidays = getAllHolidaysForYear(year, loadCustomHolidays());
  const holidaySet = new Set(holidays.map((h) => h.date)); // MM-DD

  const isNonWorkingDay = (d: Date) => {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) return true;
    return holidaySet.has(mmdd(d));
  };

  // Busca via RPC dedicada (não expõe a tabela ao público)
  const refDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const { data, error } = await supabase.rpc("get_painel_aniversariantes", {
    _school_id: schoolId,
    _ref_date: refDate,
  });

  if (error || !data) return [];

  const result: Aniversariante[] = [];
  for (const a of data as unknown as Aniversariante[]) {

    // Data do aniversário no mesmo ano da referência
    const aniv = new Date(year, a.mes - 1, a.dia);
    const isToday = a.dia === today.getDate() && a.mes === today.getMonth() + 1;

    if (isToday) {
      result.push(a);
      continue;
    }

    // Só antecipa se hoje for sexta e o aniversário cair em sáb/dom/feriado
    if (dow === 5 && isNonWorkingDay(aniv)) {
      result.push(a);
    }
  }

  return result;
}
