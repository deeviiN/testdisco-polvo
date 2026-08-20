// Suggest a short, professional rejection justification for an external event
// booking, written in pt-BR, using Lovable AI Gateway. Returns 2-4 lines.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  visitor_name?: string | null;
  sector?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  topic?: string | null;
  description?: string | null;
  gestor_communique?: string | null;
  hint?: string | null; // free text from manager (optional)
}

const SYSTEM = `Você é o(a) Gestor(a) Pedagógico(a) de uma escola pública brasileira.
Escreva uma justificativa CURTA (2 a 4 linhas, no máximo 60 palavras) explicando ao solicitante
externo por que o pedido de uso do espaço NÃO pode ser atendido.

Regras obrigatórias:
- Tom institucional, respeitoso e direto.
- Português do Brasil.
- Sem saudações, sem assinatura, sem emojis, sem markdown.
- Comece já pela razão (ex.: "O ambiente solicitado..."; "Não será possível...").
- Se houver pista do gestor, leve-a em conta como motivo principal.
- Termine sugerindo brevemente que o solicitante procure a secretaria para reagendar.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Require authentication to prevent anonymous abuse of AI credits
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    const sbUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await sbUser.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    const lines = [
      body.visitor_name ? `Solicitante externo: ${body.visitor_name}` : null,
      body.sector ? `Espaço: ${body.sector}` : null,
      body.booking_date ? `Data: ${body.booking_date}` : null,
      body.start_time && body.end_time
        ? `Horário: ${body.start_time} às ${body.end_time}`
        : null,
      body.topic ? `Assunto: ${body.topic}` : null,
      body.description ? `Descrição: ${body.description}` : null,
      body.gestor_communique
        ? `Comunicado do solicitante: ${body.gestor_communique}`
        : null,
      body.hint ? `Pista do gestor para a recusa: ${body.hint}` : null,
    ].filter(Boolean);

    const userMsg =
      `Gere a justificativa de RECUSA com base nestes dados:\n\n${lines.join("\n")}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        max_tokens: 400,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Configurações." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Falha na IA: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    // Hard cap ~1200 chars to keep it tight, sem truncar respostas curtas legítimas.
    const trimmed = text.length > 1200 ? text.slice(0, 1197) + "..." : text;

    return new Response(
      JSON.stringify({ suggestion: trimmed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
