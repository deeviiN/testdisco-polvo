import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat_attachments";
const SIGN_TTL_SECONDS = 60 * 60; // 1h
// Margem de segurança: considera a URL expirada um pouco antes do TTL real
// para evitar servir uma URL que estoure durante o carregamento da mídia.
const REFRESH_MARGIN_MS = 60_000;

/**
 * Aceita tanto um caminho relativo dentro do bucket ("userId/arquivo.jpg")
 * quanto uma URL antiga (`/storage/v1/object/public/chat_attachments/...` ou signed).
 * Retorna o path relativo dentro do bucket, ou null.
 */
export function extractChatAttachmentPath(input: string): string | null {
  if (!input) return null;
  const marker = `/${BUCKET}/`;
  const idx = input.indexOf(marker);
  if (idx >= 0) {
    const tail = input.slice(idx + marker.length);
    return tail.split("?")[0] || null;
  }
  if (!input.startsWith("http")) return input.replace(/^\/+/, "");
  return null;
}

const cache = new Map<string, { url: string; expiresAt: number }>();

/** Remove uma entrada do cache — usado quando detectamos que a URL expirou. */
export function invalidateChatAttachmentUrl(rawUrlOrPath: string): void {
  const path = extractChatAttachmentPath(rawUrlOrPath);
  if (path) cache.delete(path);
}

async function signPath(path: string, force = false): Promise<string | null> {
  if (!force) {
    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) return cached.url;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  cache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGN_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

export function useChatAttachmentUrl(rawUrlOrPath: string): {
  url: string | null;
  refresh: () => void;
} {
  const [url, setUrl] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      const path = extractChatAttachmentPath(rawUrlOrPath);
      if (!path) {
        setUrl(rawUrlOrPath || null);
        return;
      }
      if (force) cache.delete(path);
      const signed = await signPath(path, force);
      if (!cancelledRef.current) setUrl(signed);
    },
    [rawUrlOrPath],
  );

  useEffect(() => {
    cancelledRef.current = false;
    load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { url, refresh };
}
