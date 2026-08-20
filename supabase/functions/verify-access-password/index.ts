import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.99.1/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const bodySchema = z.object({
  password: z.string().trim().min(4).max(128),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Dados inválidos", code: "VALIDATION_FAILED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedPassword = Deno.env.get("APP_ACCESS_PASSWORD");

    if (!expectedPassword) {
      return new Response(JSON.stringify({ error: "Senha geral não configurada", code: "CONFIG_ERROR" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = parsed.data.password === expectedPassword;

    return new Response(JSON.stringify(valid ? { valid } : { valid, error: "Senha incorreta", code: "UNAUTHORIZED" }), {
      status: valid ? 200 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(err, { fn: "verify-access-password", step: "handler" }, 500, "Erro interno");
  }
});
