import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o "Assistente Técnico" do painel administrativo de um SaaS de Agendamento Escolar (PWA React + Supabase).

PERFIL: Programador sênior (React/TypeScript/Tailwind/Supabase/Postgres/RLS). Fale em português direto, claro, técnico mas acessível.

CAPACIDADES:
- Diagnosticar erros de runtime (JS, console, fetch, Supabase RPC, RLS, Auth).
- Explicar a causa provável em 1 frase, depois detalhar.
- Sugerir passos de auto-recuperação que o admin pode fazer AGORA na própria UI (recarregar, limpar filtro, refazer login, verificar conexão, checar status do backend).
- Quando o erro for de código/regra de negócio que exige alteração no fonte, dizer claramente: "Isso exige correção no código — reporte ao desenvolvedor com este resumo: ..." e fornecer um resumo curto pronto para colar.
- Responder dúvidas técnicas sobre RLS, Postgres, edge functions, hooks React, etc.

FORMATO:
- Use markdown.
- Comece sempre com **Diagnóstico:** em uma linha.
- Depois **Causa provável:**, **O que fazer agora:** (lista numerada), e se aplicável **Reportar ao dev:** (bloco de código com o resumo).
- Seja conciso. Máximo 250 palavras a menos que o usuário peça detalhe.

RESTRIÇÕES:
- Não invente endpoints, tabelas ou colunas que não estejam no contexto.
- Se faltar contexto, peça o erro exato ou um screenshot.
- Não exponha chaves, segredos ou IDs internos.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    // Verifica usuário autenticado via JWT claims
    const reqId = crypto.randomUUID().slice(0, 8);
    const log = (...args: unknown[]) => console.log(`[admin-ai-assistant ${reqId}]`, ...args);
    const logErr = (...args: unknown[]) => console.error(`[admin-ai-assistant ${reqId}]`, ...args);

    const authHeader = req.headers.get("Authorization") ?? "";
    log("incoming request", {
      method: req.method,
      hasAuthHeader: !!authHeader,
      authHeaderLength: authHeader.length,
      authHeaderPrefix: authHeader ? authHeader.slice(0, 10) + "..." : "(empty)",
      apikeyHeaderPresent: !!req.headers.get("apikey"),
      origin: req.headers.get("origin") ?? "(none)",
      userAgent: req.headers.get("user-agent")?.slice(0, 80) ?? "(none)",
    });

    if (!authHeader.startsWith("Bearer ")) {
      logErr("UNAUTHORIZED: missing or malformed Authorization header", {
        rawHeader: authHeader ? `${authHeader.slice(0, 20)}...` : "(empty)",
      });
      return new Response(
        JSON.stringify({ error: "Não autenticado", code: "UNAUTHORIZED", reason: "missing_bearer", reqId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token.split(".").length !== 3) {
      logErr("UNAUTHORIZED: token is empty or not a JWT (expected 3 segments)", {
        tokenLength: token.length,
        segments: token.split(".").length,
      });
      return new Response(
        JSON.stringify({ error: "Não autenticado", code: "UNAUTHORIZED", reason: "malformed_jwt", reqId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    log("getClaims result", {
      hasClaims: !!claimsData?.claims,
      hasSub: !!userId,
      role: claimsData?.claims?.role,
      exp: claimsData?.claims?.exp,
      now: Math.floor(Date.now() / 1000),
      expired: claimsData?.claims?.exp ? claimsData.claims.exp < Math.floor(Date.now() / 1000) : null,
      errorName: claimsErr?.name,
      errorMessage: claimsErr?.message,
    });
    if (claimsErr || !userId) {
      logErr("UNAUTHORIZED: getClaims failed or no sub claim", {
        errorMessage: claimsErr?.message ?? "(no error, but missing sub)",
      });
      return new Response(
        JSON.stringify({
          error: "Não autenticado",
          code: "UNAUTHORIZED",
          reason: claimsErr ? "claims_error" : "missing_sub",
          detail: claimsErr?.message,
          reqId,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    log("authenticated", { userId });

    // Verifica se é admin
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Acesso restrito a administradores", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, context } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages inválido", code: "VALIDATION_FAILED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anexa contexto técnico (erros capturados, rota, etc.) como mensagem de sistema extra
    const contextMsg = context
      ? {
          role: "system" as const,
          content: `Contexto técnico atual do painel admin:\n\`\`\`json\n${JSON.stringify(context).slice(0, 4000)}\n\`\`\``,
        }
      : null;

    const aiBody = {
      model: "google/gemini-3-flash-preview",
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(contextMsg ? [contextMsg] : []),
        ...messages,
      ],
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições à IA. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos da IA esgotados. Adicione saldo em Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Falha na IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(e, { fn: "admin-ai-assistant", step: "handler" }, 500);
  }
});
