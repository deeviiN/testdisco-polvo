import { supabase } from "@/integrations/supabase/client";

/**
 * Avisa por push somente os profissionais da MESMA escola de quem agendou.
 * A escola é resolvida no servidor (nunca vaza para outra escola).
 * Falhas são silenciosas: o agendamento não depende do push.
 */
export async function notifyNewBooking(info: {
  sector?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  count?: number;
}) {
  try {
    await supabase.functions.invoke("notify-new-booking", {
      body: {
        sector: info.sector ?? null,
        booking_date: info.booking_date ?? null,
        start_time: info.start_time ?? null,
        count: info.count ?? 1,
      },
    });
  } catch {
    /* ignora */
  }
}
