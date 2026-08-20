import { supabase } from "@/integrations/supabase/client";

/**
 * Extract the storage path from a signature URL (handles both old public URLs and plain paths).
 */
export function extractSignaturePath(signatureUrl: string): string {
  // If it's already a plain path like "user-id/signature.png"
  if (!signatureUrl.startsWith("http")) {
    return signatureUrl.split("?")[0];
  }
  // Extract path from full Supabase storage URL
  const match = signatureUrl.match(/\/signatures\/(.+?)(\?|$)/);
  return match ? decodeURIComponent(match[1]) : signatureUrl;
}

/**
 * Get a short-lived signed URL for a signature stored in the private bucket.
 * Returns null if the path is invalid or the user lacks access.
 */
export async function getSignedSignatureUrl(signatureUrl: string): Promise<string | null> {
  const path = extractSignaturePath(signatureUrl);
  if (!path) return null;
  
  const { data, error } = await supabase.storage
    .from("signatures")
    .createSignedUrl(path, 3600); // 1 hour expiry
  
  if (error || !data?.signedUrl) {
    console.warn("Failed to get signed URL for signature:", error?.message);
    return null;
  }
  return data.signedUrl;
}
