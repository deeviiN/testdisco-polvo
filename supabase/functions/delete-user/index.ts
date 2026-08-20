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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      supabaseServiceKey;

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

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório", code: "MISSING_PARAMETER" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const purgeUserData = async (uid: string) => {
      // Limpa dependências antes de remover o auth user
      await serviceClient.from("user_roles").delete().eq("user_id", uid);
      await serviceClient.from("webauthn_credentials").delete().eq("user_id", uid);
      await serviceClient.from("webauthn_challenges").delete().eq("user_id", uid);
      await serviceClient.from("profile_approval_decisions").delete().eq("user_id", uid);
      await serviceClient.from("profiles").delete().eq("user_id", uid);
    };

    // Self-deletion: user deleting their own account
    if (user_id === caller.id) {
      await purgeUserData(user_id);
      const { error } = await serviceClient.auth.admin.deleteUser(user_id, false);
      if (error) {
        return new Response(JSON.stringify({ error: `Auth delete failed: ${error.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is admin
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (isAdmin) {
      // Admin can delete anyone
      await purgeUserData(user_id);
      const { error } = await serviceClient.auth.admin.deleteUser(user_id, false);
      if (error) {
        return new Response(JSON.stringify({ error: `Auth delete failed: ${error.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is chef_projeto_vida and target is from the same school

    const { data: callerProfile } = await serviceClient
      .from("profiles")
      .select("school_id, role")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== "chef_projeto_vida") {
      return new Response(JSON.stringify({ error: "Sem permissão", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check target user is from the same school and is NOT another chef
    const { data: targetProfile } = await serviceClient
      .from("profiles")
      .select("school_id, role")
      .eq("user_id", user_id)
      .single();

    if (!targetProfile || targetProfile.school_id !== callerProfile.school_id) {
      return new Response(JSON.stringify({ error: "Usuário não pertence à sua escola", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetProfile.role === "chef_projeto_vida") {
      return new Response(JSON.stringify({ error: "Não é possível remover outro Chef da Sala", code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete dependencies first, then auth user
    await purgeUserData(user_id);
    const { error } = await serviceClient.auth.admin.deleteUser(user_id, false);

    if (error) {
      return new Response(JSON.stringify({ error: `Auth delete failed: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(err, { fn: "delete-user", step: "handler" }, 500);
  }
});
