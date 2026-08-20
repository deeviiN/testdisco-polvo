import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Indica quais pastas da Gaveta de Documentos têm itens novos não vistos pelo usuário.
 * Pisca enquanto last_viewed_at < created_at do item mais recente da pasta.
 */
export type FolderKey = "contratos" | "boletos_pagar" | "boletos_pagos" | "pix" | "comunicados" | "outros";

export function useHasUnseenDocuments() {
  const { user, profile } = useAuth();
  const schoolId = profile?.school_id;
  const [unseenByFolder, setUnseenByFolder] = useState<Record<FolderKey, boolean>>({
    contratos: false, boletos_pagar: false, boletos_pagos: false, pix: false, comunicados: false, outros: false,
  });
  const [anyUnseen, setAnyUnseen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !schoolId) return;

    const [viewsRes, contratosRes, pagamentosRes, subNotifsRes, notifsRes] = await Promise.all([
      supabase.from("user_document_views").select("folder_key, last_viewed_at").eq("user_id", user.id),
      supabase.from("signed_contracts").select("uploaded_at").eq("school_id", schoolId).order("uploaded_at", { ascending: false }).limit(1),
      supabase.from("pagamentos").select("created_at, approved_at, status, metodo").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase.from("subscription_notifications").select("created_at, sent_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1),
      supabase.from("notifications").select("created_at, data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);

    const views: Record<string, string> = {};
    for (const v of (viewsRes.data ?? []) as any[]) views[v.folder_key] = v.last_viewed_at;
    const lastViewed = (k: FolderKey) => views[k] ? new Date(views[k]).getTime() : 0;

    const hasNewer = (ts?: string | null, k?: FolderKey) =>
      !!ts && (!k || new Date(ts).getTime() > lastViewed(k));

    // contratos
    const contrUnseen = hasNewer((contratosRes.data?.[0] as any)?.uploaded_at, "contratos");

    // boletos: dividido em a pagar / pagos via status
    let bolAbertoMax = 0, bolPagoMax = 0, pixMax = 0;
    for (const p of (pagamentosRes.data ?? []) as any[]) {
      const isPix = (p.metodo || "").includes("pix");
      const t = new Date(p.created_at).getTime();
      const isPaid = ["approved","paid","pago"].includes(String(p.status).toLowerCase());
      if (isPix) pixMax = Math.max(pixMax, t);
      else if (isPaid) bolPagoMax = Math.max(bolPagoMax, new Date(p.approved_at || p.created_at).getTime());
      else bolAbertoMax = Math.max(bolAbertoMax, t);
    }

    const subT = (subNotifsRes.data?.[0] as any);
    const comTs = subT?.sent_at || subT?.created_at || null;
    const comUnseen = hasNewer(comTs, "comunicados");

    // outros: notifications com url e não-admin
    const outrosTs = ((notifsRes.data ?? []) as any[]).find(n => {
      const src = n.data?.source; const url = n.data?.url;
      return url && src !== "admin" && src !== "gestao";
    })?.created_at as string | undefined;

    const map: Record<FolderKey, boolean> = {
      contratos: contrUnseen,
      boletos_pagar: bolAbertoMax > lastViewed("boletos_pagar"),
      boletos_pagos: bolPagoMax > lastViewed("boletos_pagos"),
      pix: pixMax > lastViewed("pix"),
      comunicados: comUnseen,
      outros: outrosTs ? new Date(outrosTs).getTime() > lastViewed("outros") : false,
    };
    setUnseenByFolder(map);
    setAnyUnseen(Object.values(map).some(Boolean));
  }, [user, schoolId]);

  useEffect(() => {
    refresh();
    if (!user || !schoolId) return;
    const ch = supabase
      .channel(`docs-unseen-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos", filter: `school_id=eq.${schoolId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "signed_contracts", filter: `school_id=eq.${schoolId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_notifications", filter: `school_id=eq.${schoolId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_document_views", filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, schoolId, refresh]);

  const markFolderViewed = useCallback(async (key: FolderKey) => {
    if (!user) return;
    await supabase.from("user_document_views").upsert(
      { user_id: user.id, folder_key: key, last_viewed_at: new Date().toISOString() },
      { onConflict: "user_id,folder_key" }
    );
    setUnseenByFolder((m) => ({ ...m, [key]: false }));
  }, [user]);

  return { unseenByFolder, anyUnseen, markFolderViewed, refresh };
}
