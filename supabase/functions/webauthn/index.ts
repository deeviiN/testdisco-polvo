import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "https://esm.sh/@simplewebauthn/server@10.0.1?target=deno";
import { base64URLEncode, base64URLDecode } from "./base64url.ts";

export { base64URLEncode, base64URLDecode };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RP_NAME = "Agendamento Escolar";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const origin = req.headers.get("origin") || "https://create-your-app-66.lovable.app";
  const rpId = new URL(origin).hostname;

  try {
    const { action, ...body } = await req.json();

    // ===== REGISTRATION: Generate options =====
    if (action === "register-options") {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) throw new Error("Não autenticado");
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      ).auth.getUser();
      if (authError || !user) throw new Error("Não autenticado");

      const { data: existingCreds } = await supabaseAdmin
        .from("webauthn_credentials")
        .select("credential_id")
        .eq("user_id", user.id);

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpId,
        userID: new TextEncoder().encode(user.id),
        userName: user.email || user.id,
        userDisplayName: user.email || "Usuário",
        attestationType: "none",
        timeout: 60000,
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        excludeCredentials: (existingCreds || []).map((c) => ({
          id: c.credential_id,
          type: "public-key",
          transports: ["internal"],
        })),
        supportedAlgorithmIDs: [-7, -257],
      });

      await supabaseAdmin.from("webauthn_challenges").insert({
        challenge: options.challenge,
        user_id: user.id,
        type: "registration",
      });

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== REGISTRATION: Verify =====
    if (action === "register-verify") {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) throw new Error("Não autenticado");
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      ).auth.getUser();
      if (authError || !user) throw new Error("Não autenticado");

      const { credential, deviceName } = body;
      if (!credential?.id) throw new Error("Credencial inválida");

      const { data: challengeData } = await supabaseAdmin
        .from("webauthn_challenges")
        .select("*")
        .eq("user_id", user.id)
        .eq("type", "registration")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!challengeData) throw new Error("Challenge não encontrado");

      await supabaseAdmin.from("webauthn_challenges").delete().eq("id", challengeData.id);

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: challengeData.challenge,
          expectedOrigin: origin,
          expectedRPID: rpId,
          requireUserVerification: true,
        });
      } catch (e) {
        throw new Error("Falha ao verificar registro biométrico: " + (e as Error).message);
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new Error("Registro biométrico não verificado");
      }

      const { credential: regCred } = verification.registrationInfo as any;
      const credentialID = regCred?.id ?? (verification.registrationInfo as any).credentialID;
      const credentialPublicKey = regCred?.publicKey ?? (verification.registrationInfo as any).credentialPublicKey;
      const counter = regCred?.counter ?? (verification.registrationInfo as any).counter ?? 0;

      const credIdStr = typeof credentialID === "string"
        ? credentialID
        : base64URLEncode(credentialID);
      const pubKeyStr = base64URLEncode(credentialPublicKey);

      const { error: insertError } = await supabaseAdmin
        .from("webauthn_credentials")
        .insert({
          user_id: user.id,
          credential_id: credIdStr,
          public_key: pubKeyStr,
          counter,
          device_name: deviceName || "Dispositivo biométrico",
        });
      if (insertError) throw insertError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== AUTHENTICATION: Generate options =====
    if (action === "auth-options") {
      const { email } = body;
      if (!email || typeof email !== "string") throw new Error("Email obrigatório");

      const { data: userData } = await (supabaseAdmin.auth.admin.listUsers as any)({
        filter: `email.eq.${email}`,
        page: 1,
        perPage: 1,
      });
      const targetUser = userData?.users?.[0];
      if (!targetUser || targetUser.email !== email) {
        return new Response(
          JSON.stringify({ error: "Nenhuma credencial biométrica encontrada", code: "NOT_FOUND" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: credentials } = await supabaseAdmin
        .from("webauthn_credentials")
        .select("credential_id")
        .eq("user_id", targetUser.id);
      if (!credentials?.length) {
        return new Response(
          JSON.stringify({ error: "Nenhuma credencial biométrica cadastrada para este email", code: "NOT_FOUND" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        timeout: 60000,
        userVerification: "required",
        allowCredentials: credentials.map((c) => ({
          id: c.credential_id,
          type: "public-key",
          transports: ["internal"],
        })),
      });

      await supabaseAdmin.from("webauthn_challenges").insert({
        challenge: options.challenge,
        user_id: targetUser.id,
        email: targetUser.email,
        type: "authentication",
      });

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== AUTHENTICATION: Verify =====
    if (action === "auth-verify") {
      const { email, credential } = body;
      if (!email || typeof email !== "string") throw new Error("Email obrigatório");
      if (!credential?.id) throw new Error("Credencial inválida");
      if (!credential.response?.signature || !credential.response?.authenticatorData || !credential.response?.clientDataJSON) {
        throw new Error("Resposta de autenticação incompleta");
      }

      const { data: userData } = await (supabaseAdmin.auth.admin.listUsers as any)({
        filter: `email.eq.${email}`,
        page: 1,
        perPage: 1,
      });
      const targetUser = userData?.users?.[0];
      if (!targetUser || targetUser.email !== email) throw new Error("Usuário não encontrado");

      const { data: challengeData } = await supabaseAdmin
        .from("webauthn_challenges")
        .select("*")
        .eq("user_id", targetUser.id)
        .eq("email", email)
        .eq("type", "authentication")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!challengeData) throw new Error("Challenge expirado ou inválido");

      await supabaseAdmin.from("webauthn_challenges").delete().eq("id", challengeData.id);

      const { data: storedCred } = await supabaseAdmin
        .from("webauthn_credentials")
        .select("*")
        .eq("credential_id", credential.id)
        .eq("user_id", targetUser.id)
        .single();
      if (!storedCred) throw new Error("Credencial não pertence a este usuário");

      // Cryptographically verify the signature against the stored public key
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge: challengeData.challenge,
          expectedOrigin: origin,
          expectedRPID: rpId,
          requireUserVerification: true,
          credential: {
            id: storedCred.credential_id,
            publicKey: base64URLDecode(storedCred.public_key),
            counter: storedCred.counter || 0,
          },
        } as any);
      } catch (e) {
        throw new Error("Falha na verificação da assinatura: " + (e as Error).message);
      }

      if (!verification.verified) {
        throw new Error("Assinatura biométrica inválida");
      }

      const newCounter = (verification.authenticationInfo as any)?.newCounter ?? (storedCred.counter || 0) + 1;
      await supabaseAdmin
        .from("webauthn_credentials")
        .update({ counter: newCounter })
        .eq("id", storedCred.id);

      const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetUser.email!,
      });
      if (magicError || !magicData) throw new Error("Erro ao gerar token de sessão");

      return new Response(JSON.stringify({
        success: true,
        token: magicData.properties?.hashed_token,
        action_link: magicData.properties?.action_link,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Ação inválida");
  } catch (error) {
    const { errorResponse } = await import("../_shared/errors.ts");
    return errorResponse(error, { fn: "webauthn", step: "handler" }, 400);
  }
});
