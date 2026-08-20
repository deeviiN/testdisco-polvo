import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { topic, languages, context } = body;

    if (!topic || !languages || !Array.isArray(languages) || languages.length === 0) {
      return new Response(JSON.stringify({ error: "Dados insuficientes (topic e languages são obrigatórios)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langNames: Record<string, string> = {
      pt: "Português Brasileiro",
      en: "Inglês",
      es: "Espanhol",
    };

    const requestedLangs = languages.map((l: string) => langNames[l] || l).join(", ");

    const systemPrompt = `Você é um assistente especializado em comunicação escolar e marketing educacional.
Gere um comunicado formal e atrativo para ser enviado via WhatsApp ou redes sociais.
O comunicado deve ser gerado nos seguintes idiomas: ${requestedLangs}.

Regras:
1. Se houver mais de um idioma, apresente-os um após o outro, separados por uma linha divisória clara (como "---") ou emojis de bandeiras.
2. O tom deve ser profissional, mas acolhedor (escolar).
3. Use emojis adequados para tornar a leitura leve.
4. Mantenha as informações principais (Assunto, Data/Hora se houver, Local) consistentes em todas as traduções.
5. NÃO use markdown para títulos (como # ou ##), use apenas texto plano com CAPS ou emojis para destaque.
6. Se o contexto for sobre novos membros aprovados, dê as boas-vindas.
7. O objetivo final é divulgação/promoção.`;

    const userPrompt = `Assunto/Tópico: ${topic}
Contexto Adicional: ${context || "Nenhum"}
Gerar nos idiomas: ${languages.join(", ")}`;

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
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Error:", errorText);
      return new Response(JSON.stringify({ error: "Erro na IA ao gerar comunicado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "Erro ao processar resposta da IA.";

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
