import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn`;

async function callWebAuthn(action: string, body: Record<string, unknown> = {}, authToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Erro no servidor");
  return data;
}

function base64URLToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isBiometricAvailable(): boolean {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

export async function isBiometricPlatformAvailable(): Promise<boolean> {
  if (!isBiometricAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a biometric credential for the currently authenticated user
 */
export async function registerBiometric(deviceName?: string): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast.error("Você precisa estar logado para cadastrar biometria");
      return false;
    }

    // Get registration options from server
    const options = await callWebAuthn("register-options", {}, token);

    // Convert base64url strings to ArrayBuffers for the browser API
    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      ...options,
      challenge: base64URLToBuffer(options.challenge),
      user: {
        ...options.user,
        id: base64URLToBuffer(options.user.id),
      },
      excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
        ...c,
        id: base64URLToBuffer(c.id),
      })),
    };

    // Create credential using browser's WebAuthn API (triggers fingerprint/face scan)
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      toast.error("Registro cancelado");
      return false;
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Send credential to server for storage
    await callWebAuthn("register-verify", {
      credential: {
        id: credential.id,
        type: credential.type,
        response: {
          attestationObject: bufferToBase64URL(response.attestationObject),
          clientDataJSON: bufferToBase64URL(response.clientDataJSON),
          publicKey: response.getPublicKey ? bufferToBase64URL(response.getPublicKey()!) : undefined,
        },
      },
      deviceName: deviceName || "Dispositivo biométrico",
    }, token);

    toast.success("Impressão digital cadastrada com sucesso! 🎉");
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao cadastrar biometria";
    if (msg.includes("NotAllowedError") || msg.includes("cancelled")) {
      toast.error("Registro cancelado pelo usuário");
    } else {
      toast.error(msg);
    }
    return false;
  }
}

/**
 * Authenticate using a previously registered biometric credential
 */
export async function authenticateWithBiometric(email: string): Promise<boolean> {
  try {
    // Get authentication options from server
    const options = await callWebAuthn("auth-options", { email });

    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      ...options,
      challenge: base64URLToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((c: any) => ({
        ...c,
        id: base64URLToBuffer(c.id),
      })),
    };

    // Get credential using browser's WebAuthn API (triggers fingerprint/face scan)
    const credential = await navigator.credentials.get({
      publicKey: publicKeyOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      toast.error("Autenticação cancelada");
      return false;
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    // Verify on server
    const result = await callWebAuthn("auth-verify", {
      email,
      credential: {
        id: credential.id,
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64URL(response.authenticatorData),
          clientDataJSON: bufferToBase64URL(response.clientDataJSON),
          signature: bufferToBase64URL(response.signature),
          userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : undefined,
        },
      },
    });

    if (result.action_link) {
      // Use the OTP/magic link to establish a session
      const url = new URL(result.action_link);
      const token_hash = url.searchParams.get("token_hash") || url.hash;
      
      const { error } = await supabase.auth.verifyOtp({
        token_hash: url.searchParams.get("token_hash") || "",
        type: "magiclink",
      });

      if (error) {
        // Fallback: navigate to the action link
        window.location.href = result.action_link;
        return true;
      }
    }

    toast.success("Login biométrico realizado! 🎉");
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro na autenticação biométrica";
    if (msg.includes("NotAllowedError") || msg.includes("cancelled")) {
      toast.error("Autenticação cancelada pelo usuário");
    } else {
      toast.error(msg);
    }
    return false;
  }
}
