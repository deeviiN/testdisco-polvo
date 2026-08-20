import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const DEFAULT_LABELS: Record<string, string> = {
  projeto_vida: "Sala de Vídeo",
  informatica: "Informática",
  quadra: "Quadra",
  patio: "Pátio",
  sala_professores: "Sala dos Professores",
  biblioteca: "Biblioteca",
  lab_ciencias: "Lab. de Ciências",
};

const SHORT_LABELS: Record<string, string> = {
  projeto_vida: "Sala de Vídeo",
  informatica: "Inform.",
  quadra: "Quadra",
  patio: "Pátio",
  sala_professores: "Sala Prof.",
  biblioteca: "Biblioteca",
  lab_ciencias: "Lab. Ciên.",
};

export function useSectorLabels() {
  const { profile } = useAuth();
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchLabels = useCallback(async () => {
    if (!profile?.school_id) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("sector_labels")
      .select("sector_key, custom_label")
      .eq("school_id", profile.school_id);

    const map: Record<string, string> = {};
    data?.forEach((row: any) => {
      map[row.sector_key] = row.custom_label;
    });
    setCustomLabels(map);
    setLoading(false);
  }, [profile?.school_id]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const getLabel = useCallback(
    (sectorKey: string) => customLabels[sectorKey] || DEFAULT_LABELS[sectorKey] || sectorKey,
    [customLabels]
  );

  const getShortLabel = useCallback(
    (sectorKey: string) => {
      if (customLabels[sectorKey]) {
        const label = customLabels[sectorKey];
        return label.length > 10 ? label.slice(0, 9) + "." : label;
      }
      return SHORT_LABELS[sectorKey] || DEFAULT_LABELS[sectorKey] || sectorKey;
    },
    [customLabels]
  );

  const saveLabel = useCallback(
    async (sectorKey: string, label: string) => {
      if (!profile?.school_id) return;
      const trimmed = label.trim();
      if (!trimmed) {
        // Delete custom label to revert to default
        await supabase
          .from("sector_labels")
          .delete()
          .eq("school_id", profile.school_id)
          .eq("sector_key", sectorKey);
      } else {
        await supabase
          .from("sector_labels")
          .upsert(
            { school_id: profile.school_id, sector_key: sectorKey, custom_label: trimmed },
            { onConflict: "school_id,sector_key" }
          );
      }
      await fetchLabels();
    },
    [profile?.school_id, fetchLabels]
  );

  const canEdit = profile?.role === "gestor_pedagogico";

  return { getLabel, getShortLabel, saveLabel, canEdit, loading, refetch: fetchLabels };
}
