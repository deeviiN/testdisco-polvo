// Retorna aniversariantes do dia de uma escola.
// GET /functions/v1/aniversariantes-do-dia?school_id=<uuid>[&date=YYYY-MM-DD]
//
// Regra: se hoje for sexta-feira, antecipa quem faz aniversário no sábado,
// domingo ou feriado (nacional / RR / Boa Vista + Páscoa móvel) da janela seguinte.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// ---------- Feriados ----------
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const pad = (n: number) => String(n).padStart(2, "0");
const mmdd = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function holidaysMMDD(year: number): Set<string> {
  const fixed = [
    "01-01", "04-21", "05-01", "09-07", "10-12",
    "11-02", "11-15", "11-20", "12-25",
    "10-05", // RR
    "06-09", // Boa Vista
  ];
  const easter = getEasterDate(year);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const movable = [
    addDays(easter, -48), // Carnaval segunda
    addDays(easter, -47), // Carnaval terça
    addDays(easter, -2),  // Sexta Santa
    addDays(easter, 60),  // Corpus Christi
  ];
  const set = new Set<string>(fixed);
  movable.forEach((d) => set.add(mmdd(d)));
  return set;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const schoolId = url.searchParams.get("school_id");
    const dateParam = url.searchParams.get("date");

    if (!schoolId || !/^[0-9a-fA-F-]{36}$/.test(schoolId)) {
      return new Response(
        JSON.stringify({ error: "Parâmetro 'school_id' inválido ou ausente" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let today: Date;
    if (dateParam) {
      const [y, m, d] = dateParam.split("-").map(Number);
      if (!y || !m || !d) {
        return new Response(
          JSON.stringify({ error: "Parâmetro 'date' deve ser YYYY-MM-DD" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      today = new Date(y, m - 1, d);
    } else {
      today = new Date();
    }
    today.setHours(0, 0, 0, 0);

    const dow = today.getDay(); // 0=Dom ... 5=Sex ... 6=Sab
    const window: Date[] = [today];
    if (dow === 5) {
      for (let i = 1; i <= 3; i++) {
        const nd = new Date(today);
        nd.setDate(nd.getDate() + i);
        window.push(nd);
      }
    }
    const year = today.getFullYear();
    const holidaySet = holidaysMMDD(year);
    const isNonWorkingDay = (d: Date) => {
      const wd = d.getDay();
      if (wd === 0 || wd === 6) return true;
      return holidaySet.has(mmdd(d));
    };

    const targets = window.map((d) => ({
      dia: d.getDate(),
      mes: d.getMonth() + 1,
      date: d,
    }));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Confere se o toggle está ativo para essa escola
    const { data: ps } = await supabase
      .from("panel_settings")
      .select("mostrar_aniv_servidores")
      .eq("school_id", schoolId)
      .maybeSingle();
    const enabled = !!(ps as { mostrar_aniv_servidores?: boolean } | null)
      ?.mostrar_aniv_servidores;

    if (!enabled) {
      return new Response(
        JSON.stringify({
          enabled: false,
          date: mmdd(today),
          aniversariantes: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const orFilter = targets
      .map((t) => `and(dia.eq.${t.dia},mes.eq.${t.mes})`)
      .join(",");

    const { data, error } = await supabase
      .from("servidores_aniversariantes")
      .select("id, nome, dia, mes, cargo, setor, foto_url")
      .eq("school_id", schoolId)
      .or(orFilter);

    if (error) {
      return new Response(
        JSON.stringify({ error: "Erro ao consultar aniversariantes" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const buildInitials = (nome: string) =>
      (nome ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("");

    const result = (data ?? [])
      .filter((a) => {
        const isToday =
          a.dia === today.getDate() && a.mes === today.getMonth() + 1;
        if (isToday) return true;
        if (dow !== 5) return false;
        const aniv = new Date(year, (a.mes as number) - 1, a.dia as number);
        return isNonWorkingDay(aniv);
      })
      .map((a) => ({
        id: a.id,
        nome: a.nome,
        cargo: a.cargo,
        setor: a.setor,
        dia: a.dia,
        mes: a.mes,
        data: `${pad(a.dia as number)}/${pad(a.mes as number)}`,
        foto_url: a.foto_url,
        iniciais: buildInitials(a.nome as string),
      }));

    return new Response(
      JSON.stringify({
        enabled: true,
        date: mmdd(today),
        total: result.length,
        aniversariantes: result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Erro inesperado" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
