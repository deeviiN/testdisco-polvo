import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AccessLevel = "full" | "limited" | "blocked" | "loading";

interface SchoolAccess {
  accessLevel: AccessLevel;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  gracePeriodDays: number;
  daysRemaining: number | null;
}

export function useSchoolAccess(): SchoolAccess {
  const { profile } = useAuth();
  const [access, setAccess] = useState<SchoolAccess>({
    accessLevel: "loading",
    subscriptionStatus: "active",
    subscriptionEndDate: null,
    gracePeriodDays: 15,
    daysRemaining: null,
  });

  useEffect(() => {
    if (!profile?.school_id) return;

    const load = async () => {
      // Use SECURITY DEFINER RPC so subscription columns stay hidden from non-privileged roles
      const { data } = await supabase.rpc("get_school_access_info", {
        _school_id: profile.school_id,
      });

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;

      const level = (row.access_level as AccessLevel) || "full";

      setAccess({
        accessLevel: level,
        subscriptionStatus: row.subscription_status ?? "active",
        subscriptionEndDate: row.subscription_end_date ?? null,
        gracePeriodDays: row.grace_period_days ?? 15,
        daysRemaining: row.days_remaining ?? null,
      });
    };

    load();
  }, [profile?.school_id]);

  return access;
}
