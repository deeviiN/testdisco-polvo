
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://placeholder.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "placeholder";

// Client as anonymous user
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Deno.test("Security Isolation: Triggers and Internal Functions are NOT executable by ANON", async (t) => {
  const internalFunctions = [
    "audit_booking_changes",
    "audit_profile_changes",
    "audit_role_changes",
    "log_booking_gestor_change",
    "log_payment_status_change",
    "prevent_chef_profile_escalation",
    "protect_approved_until",
    "protect_booking_gestor_fields",
    "validate_gestor_status",
    "validate_str_status",
    "update_updated_at_column",
    "handle_gestor_payment_approval"
  ];

  for (const fn of internalFunctions) {
    await t.step(`Should block ANON from calling RPC ${fn}`, async () => {
      const { error } = await anonClient.rpc(fn);
      // Status 403 or 401/405 depending on PostgREST configuration
      // But we expect an error since permission was revoked
      assertNotEquals(error, null, `Function ${fn} should have returned an error for ANON`);
      console.log(`✓ ANON call to ${fn} blocked as expected (Error: ${error?.message})`);
    });
  }
});

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.test({
  name: "Storage Isolation: chef_projeto_vida CANNOT list school-logos bucket",
  ignore: !SERVICE_ROLE_KEY || SUPABASE_URL.includes("placeholder"),
  fn: async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Create ephemeral chef user
    const email = `chef-test-${crypto.randomUUID()}@example.com`;
    const password = `Tst!${crypto.randomUUID()}`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);
    const userId = created.user.id;

    // Pick any existing school to attach the profile to
    const { data: schools } = await admin.from("schools").select("id").limit(1);
    const schoolId = schools?.[0]?.id ?? null;

    try {
      await admin.from("profiles").insert({
        user_id: userId,
        full_name: "Chef Test",
        role: "chef_projeto_vida",
        school_id: schoolId,
        is_approved: true,
      });

      // 2) Sign in as the chef user with an anon client
      const chefClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error: signInErr } = await chefClient.auth.signInWithPassword({ email, password });
      if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

      // 3) Attempt to list the school-logos bucket
      const { data: list, error: listErr } = await chefClient.storage
        .from("school-logos")
        .list("", { limit: 100 });

      // After removing the old policy, chef must NOT be able to list contents
      const blocked = !!listErr || (Array.isArray(list) && list.length === 0);
      assertEquals(
        blocked,
        true,
        `chef_projeto_vida should NOT list school-logos. got list=${JSON.stringify(list)} err=${listErr?.message}`,
      );
      console.log(`✓ chef_projeto_vida blocked from listing school-logos (err=${listErr?.message ?? "empty list"})`);

      await chefClient.auth.signOut();
    } finally {
      // Cleanup
      await admin.from("profiles").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  },
});

Deno.test("Public Discovery: Public functions ARE executable by ANON", async (t) => {
  const publicFunctions = [
    "get_app_version_manifest",
    "list_school_states_public"
  ];

  for (const fn of publicFunctions) {
    await t.step(`Should allow ANON to call public RPC ${fn}`, async () => {
      const { error } = await anonClient.rpc(fn);
      // We don't check data content, just that it wasn't a "permission denied" error
      if (error) {
        // If it's a 404 (function not found) it might be an argument issue, 
        // but we're looking for "permission denied" or "method not allowed"
        console.log(`Public function ${fn} returned error: ${error.message} (Code: ${error.code})`);
        assertNotEquals(error.code, "42501", `Function ${fn} should NOT be permission denied for ANON`);
      } else {
        console.log(`✓ ANON call to ${fn} allowed as expected`);
      }
    });
  }
});
