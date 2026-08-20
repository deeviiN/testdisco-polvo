import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateTempPassword(): string {
  // 14 chars: upper, lower, digit, symbol — easy to read, no ambiguous chars
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const buf = new Uint8Array(14);
  crypto.getRandomValues(buf);
  let pwd = "";
  // ensure at least one of each
  pwd += upper[buf[0] % upper.length];
  pwd += lower[buf[1] % lower.length];
  pwd += digits[buf[2] % digits.length];
  pwd += symbols[buf[3] % symbols.length];
  for (let i = 4; i < buf.length; i++) pwd += all[buf[i] % all.length];
  // shuffle
  return pwd.split("").sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] - 128)).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401);

    const { user_id, action, redirect_to } = await req.json();
    if (!user_id) return json({ error: "user_id obrigatório", code: "MISSING_PARAMETER" }, 400);

    const service = createClient(supabaseUrl, serviceKey);

    // Authorization: admin OR chef of same school
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: callerP } = await service
        .from("profiles").select("school_id, role").eq("user_id", caller.id).single();
      const { data: targetP } = await service
        .from("profiles").select("school_id").eq("user_id", user_id).single();
      allowed = !!(callerP && targetP &&
        callerP.role === "chef_projeto_vida" &&
        callerP.school_id === targetP.school_id);
    }

    if (!allowed) return json({ error: "Sem permissão" }, 403);

    if (action === "send_password_reset") {
      const { data: u, error: ge } = await service.auth.admin.getUserById(user_id);
      if (ge || !u?.user?.email) return json({ error: "Email não encontrado" }, 404);
      const { error } = await service.auth.resetPasswordForEmail(u.user.email, {
        redirectTo: redirect_to || undefined,
      });
      if (error) return json({ error: error.message }, 500);

      const { data: targetProfile } = await service
        .from("profiles")
        .select("school_id, full_name, role")
        .eq("user_id", user_id)
        .maybeSingle();
      await service.from("audit_logs").insert({
        action: "password_reset_requested",
        table_name: "auth.users",
        record_id: user_id,
        performed_by: caller.id,
        school_id: targetProfile?.school_id ?? null,
        new_data: {
          target_email: u.user.email,
          target_name: targetProfile?.full_name ?? null,
          target_role: targetProfile?.role ?? null,
          requested_by_admin: !!isAdmin,
          redirect_to: redirect_to ?? null,
        },
      });

      return json({ success: true, email: u.user.email });
    }

    if (action === "set_temp_password") {
      // Generate a strong temporary password (shown ONCE to admin)
      const tempPassword = generateTempPassword();

      const { data: u, error: ge } = await service.auth.admin.getUserById(user_id);
      if (ge || !u?.user) return json({ error: "Usuário não encontrado" }, 404);

      const { error: upErr } = await service.auth.admin.updateUserById(user_id, {
        password: tempPassword,
      });
      if (upErr) return json({ error: upErr.message }, 500);

      const { data: targetProfile } = await service
        .from("profiles")
        .select("school_id, full_name, role")
        .eq("user_id", user_id)
        .maybeSingle();

      await service.from("audit_logs").insert({
        action: "admin_set_temp_password",
        table_name: "auth.users",
        record_id: user_id,
        performed_by: caller.id,
        school_id: targetProfile?.school_id ?? null,
        new_data: {
          target_email: u.user.email,
          target_name: targetProfile?.full_name ?? null,
          target_role: targetProfile?.role ?? null,
          requested_by_admin: !!isAdmin,
        },
      });

      return json({ success: true, email: u.user.email, temp_password: tempPassword });
    }

    // Default: return details
    const { data: u, error } = await service.auth.admin.getUserById(user_id);
    if (error || !u?.user) return json({ error: "Usuário não encontrado" }, 404);

    return json({
      email: u.user.email,
      created_at: u.user.created_at,
      last_sign_in_at: u.user.last_sign_in_at,
      email_confirmed_at: u.user.email_confirmed_at,
      phone: u.user.phone,
      providers: u.user.app_metadata?.providers ?? [],
    });
  } catch (err) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(err, { fn: "admin-user-details", step: "handler" }, 500);
  }

  function json(body: unknown, status = 200) {
    // Auto-attach canonical error code for known HTTP statuses on error responses
    let payload: unknown = body;
    if (status >= 400 && body && typeof body === "object" && !("code" in (body as Record<string, unknown>))) {
      const codeMap: Record<number, string> = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        502: "EXTERNAL_SERVICE_ERROR",
      };
      payload = { ...(body as Record<string, unknown>), code: codeMap[status] ?? "INTERNAL_ERROR" };
    }
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
