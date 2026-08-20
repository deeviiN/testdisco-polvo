import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas admin pode executar", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional scope: reset only one school, or all
    let schoolId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.school_id === "string" && body.school_id.length > 0) {
        schoolId = body.school_id;
      }
    } catch {
      // no body / not JSON — treated as "all"
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 0) Snapshot bookings BEFORE deleting (filtered by school if provided)
    let bookingsQuery = admin.from("bookings").select("status, event_type, sector, school_id");
    if (schoolId) bookingsQuery = bookingsQuery.eq("school_id", schoolId);
    const { data: bookingsSnapshot } = await bookingsQuery;

    const bookingsByStatus: Record<string, number> = {};
    const bookingsByEventType: Record<string, number> = {};
    const bookingsBySector: Record<string, number> = {};
    for (const b of bookingsSnapshot ?? []) {
      const st = (b as any).status ?? "unknown";
      const et = (b as any).event_type ?? "unknown";
      const sc = (b as any).sector ?? "unknown";
      bookingsByStatus[st] = (bookingsByStatus[st] ?? 0) + 1;
      bookingsByEventType[et] = (bookingsByEventType[et] ?? 0) + 1;
      bookingsBySector[sc] = (bookingsBySector[sc] ?? 0) + 1;
    }

    // 1) Delete bookings (scoped if school provided)
    let deleteBookingsQuery = admin.from("bookings").delete({ count: "exact" }).not("id", "is", null);
    if (schoolId) deleteBookingsQuery = deleteBookingsQuery.eq("school_id", schoolId);
    const { error: bookingsErr, count: bookingsCount } = await deleteBookingsQuery;

    if (bookingsErr) {
      return new Response(JSON.stringify({ error: "Erro ao apagar agendamentos: " + bookingsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1b) Wipe contracts, payments, subscriptions and related artifacts (test data)
    const wipeCounts: Record<string, number> = {};
    const wipeErrors: Record<string, string> = {};

    // Delete signed contracts files from storage
    try {
      let scQ = admin.from("signed_contracts").select("id, file_path, school_id");
      if (schoolId) scQ = scQ.eq("school_id", schoolId);
      const { data: scRows } = await scQ;
      const paths = (scRows ?? []).map((r: any) => r.file_path).filter(Boolean);
      if (paths.length > 0) {
        await admin.storage.from("signed_contracts").remove(paths);
      }
      wipeCounts["signed_contracts_files"] = paths.length;
    } catch (e: any) {
      wipeErrors["signed_contracts_files"] = e?.message ?? String(e);
    }

    const tablesScopedBySchool = [
      "signed_contracts",
      "pagamentos",
      "pending_pix_payments",
      "assinaturas",
      "subscription_notifications",
      "school_transfer_requests",
      "profile_approval_decisions",
      "booking_gestor_history",
      "audit_logs",
      "sector_labels",
    ];

    for (const table of tablesScopedBySchool) {
      try {
        let q = admin.from(table).delete({ count: "exact" }).not("id", "is", null);
        if (schoolId) {
          // school_transfer_requests uses from_school_id; handle separately
          if (table === "school_transfer_requests") {
            q = admin.from(table).delete({ count: "exact" }).or(
              `from_school_id.eq.${schoolId},to_school_id.eq.${schoolId}`,
            );
          } else {
            q = q.eq("school_id", schoolId);
          }
        }
        const { count, error } = await q;
        if (error) wipeErrors[table] = error.message;
        else wipeCounts[table] = count ?? 0;
      } catch (e: any) {
        wipeErrors[table] = e?.message ?? String(e);
      }
    }

    // payment_integration_logs has no school_id — only wipe on global reset
    if (!schoolId) {
      try {
        const { count, error } = await admin
          .from("payment_integration_logs")
          .delete({ count: "exact" })
          .not("id", "is", null);
        if (error) wipeErrors["payment_integration_logs"] = error.message;
        else wipeCounts["payment_integration_logs"] = count ?? 0;
      } catch (e: any) {
        wipeErrors["payment_integration_logs"] = e?.message ?? String(e);
      }
    }

    // 2) Find all admin user_ids — we keep these
    const { data: adminRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRoles ?? []).map((r: any) => r.user_id as string));

    // 2b) Snapshot non-admin profiles (filtered by school if provided)
    let profilesQuery = admin.from("profiles").select("user_id, role, is_approved, school_id");
    if (schoolId) profilesQuery = profilesQuery.eq("school_id", schoolId);
    const { data: profilesSnapshot } = await profilesQuery;

    const usersByRole: Record<string, number> = {};
    let pendingApprovalCount = 0;
    let approvedCount = 0;
    const targetUserIds = new Set<string>();
    for (const p of profilesSnapshot ?? []) {
      if (adminIds.has((p as any).user_id)) continue;
      targetUserIds.add((p as any).user_id);
      const role = (p as any).role ?? "unknown";
      usersByRole[role] = (usersByRole[role] ?? 0) + 1;
      if ((p as any).is_approved) approvedCount++;
      else pendingApprovalCount++;
    }

    // 3) Delete users
    let deletedUsers = 0;
    if (schoolId) {
      // Scoped: only users that belong to this school
      for (const uid of targetUserIds) {
        await admin.from("notifications").delete().eq("user_id", uid);
        await admin.from("push_tokens").delete().eq("user_id", uid);
        await admin.from("user_roles").delete().eq("user_id", uid);
        await admin.from("profiles").delete().eq("user_id", uid);
        await admin.from("webauthn_credentials").delete().eq("user_id", uid);
        const { error: delErr } = await admin.auth.admin.deleteUser(uid);
        if (!delErr) deletedUsers++;
      }
    } else {
      // Global: list every auth user, delete the non-admin ones
      let page = 1;
      const perPage = 200;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) {
          return new Response(JSON.stringify({ error: "Erro listando usuários: " + error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const users = data?.users ?? [];
        if (users.length === 0) break;

        for (const u of users) {
          if (adminIds.has(u.id)) continue;
          await admin.from("notifications").delete().eq("user_id", u.id);
          await admin.from("push_tokens").delete().eq("user_id", u.id);
          await admin.from("user_roles").delete().eq("user_id", u.id);
          await admin.from("profiles").delete().eq("user_id", u.id);
          await admin.from("webauthn_credentials").delete().eq("user_id", u.id);
          const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
          if (!delErr) deletedUsers++;
        }

        if (users.length < perPage) break;
        page++;
        if (page > 50) break;
      }

      // 4) Cleanup orphan profiles (defensive) — only for global reset
      await admin
        .from("profiles")
        .delete()
        .not("user_id", "in", `(${[...adminIds].map((id) => `"${id}"`).join(",") || '""'})`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scope: schoolId ? "school" : "all",
        school_id: schoolId,
        deleted_bookings: bookingsCount ?? 0,
        deleted_users: deletedUsers,
        kept_admins: adminIds.size,
        bookings_breakdown: {
          by_status: bookingsByStatus,
          by_event_type: bookingsByEventType,
          by_sector: bookingsBySector,
        },
        users_breakdown: {
          by_role: usersByRole,
          approved: approvedCount,
          pending_approval: pendingApprovalCount,
        },
        wiped: wipeCounts,
        wipe_errors: wipeErrors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(err, { fn: "admin-reset-test-data", step: "handler" }, 500);
  }
});
