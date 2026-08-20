import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const schoolId = url.searchParams.get("school_id");
    if (!schoolId) {
      return new Response(JSON.stringify({ error: "school_id required", code: "MISSING_PARAMETER" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role queries
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const [schoolRes, profilesRes, bookingsRes, sectorLabelsRes] = await Promise.all([
      admin.from("schools").select("*").eq("id", schoolId).maybeSingle(),
      admin
        .from("profiles")
        .select("id,user_id,full_name,role,intended_role,is_approved,phone,gender,signature_url,created_at")
        .eq("school_id", schoolId)
        .order("role", { ascending: true })
        .order("full_name", { ascending: true }),
      admin
        .from("bookings")
        .select("id,booking_date,start_time,end_time,sector,event_type,status,gestor_status,topic,description,user_id")
        .eq("school_id", schoolId)
        .gte("booking_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
        .order("booking_date", { ascending: false })
        .order("start_time", { ascending: true })
        .limit(100),
      admin.from("sector_labels").select("*").eq("school_id", schoolId),
    ]);

    if (!schoolRes.data) {
      return new Response(JSON.stringify({ error: "School not found", code: "NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve emails for all users of this school
    const userIds = Array.from(new Set((profilesRes.data ?? []).map((p) => p.user_id)));
    const emailById = new Map<string, string | null>();
    for (const uid of userIds) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      emailById.set(uid, u?.user?.email ?? null);
    }

    const profiles = (profilesRes.data ?? []).map((p) => ({
      ...p,
      email: emailById.get(p.user_id) ?? null,
    }));

    // Audit
    await admin.from("audit_logs").insert({
      action: "admin_view_school_overview",
      table_name: "schools",
      record_id: schoolId,
      new_data: { viewed_at: new Date().toISOString() },
      performed_by: userData.user.id,
      school_id: schoolId,
    });

    return new Response(
      JSON.stringify({
        school: schoolRes.data,
        profiles,
        bookings: bookingsRes.data ?? [],
        sector_labels: sectorLabelsRes.data ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(e, { fn: "admin-school-overview", step: "handler" }, 500);
  }
});
