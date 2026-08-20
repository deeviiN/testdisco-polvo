import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_ROLES = ["gestor", "chef_sala", "coordenador_pedagogico", "coordenacao", "supervisor", "secretario_escolar"];

const SYSTEM_PROMPT = `Você converte tabelas de horário escolar (quadro de professores) em JSON.

Entrada: texto solto extraído de um PDF/planilha, geralmente com turmas nas colunas ou linhas e os tempos (1º, 2º, 3º...) por dia da semana.

Saída OBRIGATÓRIA: um único objeto JSON:
{"rows":[{"weekday":1,"period_number":1,"class_name":"101","teacher_name":"Anderson Lima","discipline":"Matemática","room_name":"Sala 3"}]}

Regras:
- weekday: 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado.
- period_number: número do tempo (1..N) conforme a lista de tempos fornecida pelo usuário.
- class_name: identificação da turma (ex.: 101, 3ºB, EJA 1).
- teacher_name: nome do professor como aparece no documento (sem "Prof.").
- discipline e room_name: opcionais, use null quando não houver.
- Ignore linhas de intervalo/recreio, cabeçalhos, rodapés e totais.
- Nunca invente professores ou turmas que não estejam no texto.
- Responda SOMENTE com o JSON, sem comentários e sem markdown.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "IA não configurada no app" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: prof }, { data: adminRole }] = await Promise.all([
      userClient.from("profiles").select("role, approved").eq("user_id", userId).maybeSingle(),
      userClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    ]);
    const isAllowed = !!adminRole || (!!prof?.approved && ALLOWED_ROLES.includes(String(prof?.role)));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Sem permissão para importar o quadro" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { raw_text, shift, periods } = await req.json();
    if (typeof raw_text !== "string" || raw_text.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Texto do quadro vazio ou muito curto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const periodsTxt = Array.isArray(periods) && periods.length
      ? periods.map((p: any) => `${p.period_number}º = ${p.start_time}–${p.end_time}`).join(" | ")
      : "(não informados)";

    const userMsg = `Turno: ${shift ?? "não informado"}
Tempos configurados na escola: ${periodsTxt}

Texto do quadro:
"""
${raw_text.slice(0, 24000)}
"""`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      const msg = status === 429
        ? "Muitas requisições à IA. Tente novamente em instantes."
        : status === 402
          ? "Créditos de IA do app esgotados. Fale com o administrador."
          : status === 403
            ? "IA bloqueada nas configurações do app."
            : "Falha na leitura por IA.";
      console.error("parse-teacher-roster AI error", status, await aiResp.text());
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const rows = (Array.isArray(parsed?.rows) ? parsed.rows : [])
      .map((r: any) => ({
        weekday: Number(r?.weekday),
        period_number: Number(r?.period_number),
        class_name: String(r?.class_name ?? "").trim(),
        teacher_name: String(r?.teacher_name ?? "").trim(),
        discipline: r?.discipline ? String(r.discipline).trim() : null,
        room_name: r?.room_name ? String(r.room_name).trim() : null,
      }))
      .filter((r: any) =>
        r.weekday >= 1 && r.weekday <= 6 &&
        r.period_number >= 1 && r.period_number <= 20 &&
        r.class_name && r.teacher_name);

    return new Response(JSON.stringify({ rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-teacher-roster error", e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "Erro inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
