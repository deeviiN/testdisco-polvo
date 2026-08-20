import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.user_id;
    const redirectTo: string | undefined = body.redirect_to;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id required", code: "MISSING_PARAMETER" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: target } = await admin.auth.admin.getUserById(targetUserId);
    const email = target?.user?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "User has no email", code: "VALIDATION_FAILED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || `${new URL(req.url).origin}/reset-password`,
    });
    if (resetErr) throw resetErr;

    // Audit
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, school_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    await admin.from("audit_logs").insert({
      action: "admin_send_password_reset",
      table_name: "auth.users",
      record_id: targetUserId,
      new_data: {
        email,
        target_full_name: profile?.full_name ?? null,
        sent_at: new Date().toISOString(),
      },
      performed_by: userData.user.id,
      school_id: profile?.school_id ?? null,
    });

    return new Response(JSON.stringify({ ok: true, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(e, { fn: "admin-reset-user-password", step: "handler" }, 500);
  }
});
