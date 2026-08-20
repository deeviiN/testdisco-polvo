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
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("getClaims failed:", claimsErr);
      return new Response(JSON.stringify({ error: "Unauthorized", code: "SESSION_EXPIRED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Caller must be approved gestor/chef of a school (or admin)
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("school_id, role, is_approved")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    const isManager =
      !!callerProfile?.is_approved &&
      (callerProfile.role === "gestor_pedagogico" || callerProfile.role === "chef_projeto_vida");

    if (!isAdmin && !isManager) {
      return new Response(JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const requestedSchoolId = url.searchParams.get("school_id");
    const schoolId = isAdmin
      ? (requestedSchoolId ?? callerProfile?.school_id)
      : callerProfile!.school_id;

    if (!schoolId) {
      return new Response(JSON.stringify({ error: "school_id required", code: "MISSING_PARAMETER" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id")
      .eq("school_id", schoolId);

    const ids = Array.from(new Set((profiles ?? []).map((p) => p.user_id)));
    const emails: Record<string, string | null> = {};
    for (const uid of ids) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      emails[uid] = u?.user?.email ?? null;
    }

    return new Response(JSON.stringify({ emails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(e, { fn: "school-staff-emails", step: "handler" }, 500);
  }
});
