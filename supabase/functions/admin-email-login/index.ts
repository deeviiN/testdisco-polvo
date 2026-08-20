import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { z } from "https://esm.sh/zod@3.25.76";
import { AppError, ErrorCodes, corsHeaders, errorResponse, jsonResponse } from "../_shared/errors.ts";

const bodySchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(320),
  code: z.string().trim().min(4, "Código Admin obrigatório").max(128),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.issues[0]?.message || "Dados inválidos", code: ErrorCodes.VALIDATION_FAILED }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminAccessCode = Deno.env.get("ADMIN_ACCESS_CODE");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new AppError(ErrorCodes.CONFIG_ERROR, "Configuração do servidor incompleta");
    }

    if (!adminAccessCode) {
      throw new AppError(ErrorCodes.CONFIG_ERROR, "Código Admin ainda não configurado");
    }

    if (parsed.data.code !== adminAccessCode) {
      return jsonResponse({ error: "Código Admin inválido", code: ErrorCodes.UNAUTHORIZED }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const normalizedEmail = parsed.data.email.toLowerCase();

    const { data: userData, error: listErr } = await (admin.auth.admin.listUsers as any)({
      filter: `email.eq.${normalizedEmail}`,
      page: 1,
      perPage: 1,
    });

    if (listErr) {
      throw listErr;
    }

    const targetUser = userData?.users?.find((user: { email?: string | null }) => user.email?.toLowerCase() === normalizedEmail);
    if (!targetUser?.id || !targetUser.email) {
      return jsonResponse({ error: "E-mail não autorizado", code: ErrorCodes.FORBIDDEN }, 403);
    }

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: targetUser.id,
      _role: "admin",
    });

    if (roleErr) {
      throw roleErr;
    }

    if (!isAdmin) {
      return jsonResponse({ error: "E-mail não autorizado", code: ErrorCodes.FORBIDDEN }, 403);
    }

    const { data: magicData, error: magicError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
    });

    if (magicError || !magicData?.properties?.action_link) {
      throw magicError || new Error("Falha ao gerar link de sessão");
    }

    return jsonResponse({
      success: true,
      action_link: magicData.properties.action_link,
      token: magicData.properties.hashed_token ?? null,
    });
  } catch (err) {
    return errorResponse(err, { fn: "admin-email-login", step: "handler" }, 500, "Erro interno");
  }
});