import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { eventType, eventName, audience, department, sector, dates, times, ensino, series, turmas, requesterName, originalRequest } = body;

    if (!eventType || !sector) {
      return new Response(JSON.stringify({ error: "Dados insuficientes", code: "VALIDATION_FAILED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI não configurada", code: "CONFIG_ERROR" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context
    const sectorMap: Record<string, string> = {
      quadra: "Quadra Escolar", informatica: "Sala de Informática",
      patio: "Pátio", sala_professores: "Sala dos Professores",
      projeto_vida: "Sala de Vídeo",
    };

    const eventTypeMap: Record<string, string> = {
      esportivo: "Evento Esportivo", outros: "Evento",
      externo: "Evento Externo", reuniao: "Reunião",
      solicitacao_externa: "Solicitação de Uso Externo",
      comunicado_evento_externo: "Comunicado de Evento Escolar Aprovado",
    };

    const isSolicitacao = eventType === "solicitacao_externa";
    const isComunicadoEventoExterno = eventType === "comunicado_evento_externo";

    // Resolve solicitante a partir do JWT quando não enviado explicitamente
    let solicitante = (requesterName || "").trim();
    if (isSolicitacao && !solicitante) {
      const { data: prof } = await supabase
        .from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      solicitante = prof?.full_name || "";
    }

    let detalhes = `Tipo: ${eventTypeMap[eventType] || eventType}`;
    detalhes += `\nLocal/Setor: ${sectorMap[sector] || sector}`;
    if (solicitante) detalhes += `\nSolicitante: ${solicitante}`;
    if (eventName) detalhes += `\nAssunto/Nome: ${eventName}`;
    if (audience) detalhes += `\nPúblico-alvo: ${audience}`;
    if (department) detalhes += `\nSetor(es): ${department}`;
    if (ensino) detalhes += `\nNível de ensino: ${ensino}`;
    if (series) detalhes += `\nSérie(s): ${series}`;
    if (turmas) detalhes += `\nTurma(s): ${turmas}`;
    if (dates) detalhes += `\nData(s): ${dates}`;
    if (times) detalhes += `\nHorário(s): ${times}`;
    if (originalRequest) detalhes += `\n\nSolicitação original do usuário (use apenas como contexto, não copie literalmente):\n${originalRequest}`;

    const systemPrompt = isSolicitacao
      ? `Você redige SOLICITAÇÕES curtas e formais dirigidas ao(à) Gestor(a) Pedagógico(a), em português brasileiro. Regras OBRIGATÓRIAS:
- MÁXIMO 5 linhas, texto puro (sem markdown, sem cabeçalho "COMUNICADO", sem assinatura).
- Comece OBRIGATORIAMENTE com "Prezado(a) Gestor(a),".
- Inclua OBRIGATORIAMENTE: nome do solicitante, setor/ambiente, data e horário do evento.
- Deixe claro que é SOLICITAÇÃO de liberação para uso externo (NÃO comunicar como aprovado).
- Encerre pedindo deferimento. NÃO inclua data do comunicado nem saudações longas.`
      : isComunicadoEventoExterno
      ? `Você é redator oficial de comunicação escolar. Gere um COMUNICADO FORMAL NOVO, em português brasileiro, para a comunidade escolar, baseado na solicitação aprovada pelo gestor.
Regras OBRIGATÓRIAS:
- NÃO copie a solicitação original nem transforme o texto do usuário em comunicado; use a solicitação somente como contexto.
- Escreva como gestão escolar/direção, informando que a atividade foi autorizada/aprovada pela escola.
- Comece com o título "COMUNICADO".
- Use saudação formal, por exemplo "Prezada comunidade escolar,".
- Informe objetivo/finalidade, ambiente, data, horário, responsáveis/solicitante quando houver e orientações aos destinatários.
- Texto com tom institucional, claro e humanizado, entre 2 e 5 parágrafos curtos.
- Encerre formalmente em nome da gestão escolar.
- NÃO use markdown, listas com bullets ou linguagem de pedido/deferimento.`
      : `Você é um assistente especializado em comunicação escolar. Gere um comunicado formal e profissional em português brasileiro para ser enviado à comunidade escolar. O comunicado deve:
- Ter um cabeçalho com "COMUNICADO" em destaque
- Incluir a data do comunicado (use a data do evento)
- Ter uma saudação formal
- Corpo do texto informando sobre o evento/reunião com todos os detalhes
- Instruções claras para os destinatários
- Encerramento formal
- Espaço para assinatura da direção/coordenação
- Ser claro, objetivo e respeitoso
- NÃO usar markdown, apenas texto puro formatado com espaçamento`;

    const userPrompt = isSolicitacao
      ? `Gere a SOLICITAÇÃO ao gestor com base nos dados abaixo (curta, até 5 linhas):\n\n${detalhes}`
      : isComunicadoEventoExterno
      ? `Gere o COMUNICADO formal da gestão escolar para divulgar a atividade aprovada, usando os dados abaixo como base e sem repetir a solicitação original:\n\n${detalhes}`
      : `Gere um comunicado escolar com base nos seguintes dados do agendamento:\n\n${detalhes}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: isSolicitacao ? 600 : 2048,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar comunicado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const comunicado = data.choices?.[0]?.message?.content || "Não foi possível gerar o comunicado.";

    return new Response(JSON.stringify({ comunicado }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(e, { fn: "generate-comunicado", step: "handler" }, 500);
  }
});
