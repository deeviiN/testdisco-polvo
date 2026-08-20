import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PendingContractItem {
  schoolId: string;
  schoolName: string;
  needsAdmin: boolean;
  needsGestor: boolean;
  needsPayment: boolean;
}

interface State {
  count: number;
  pending: PendingContractItem[];
  lastNewSchoolId: string | null;
  lastEvent: "awaiting_admin" | "gestor_signed" | null;
  isRefreshing: boolean;
  lastUpdatedAt: Date | null;
}

type ContractSignal = {
  school_id: string;
  signer_role: string;
  status: string;
  file_name: string;
};

/**
 * Conta contratos que precisam de atenção do admin:
 *  - status = 'awaiting_admin' (gestor aguardando admin enviar)
 *  - signer_role = 'gestor' (gestor acabou de assinar e o contrato chegou)
 */
const LAST_UPDATED_STORAGE_KEY = "admin-pending-contracts:last-updated-at";

function readPersistedLastUpdated(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_UPDATED_STORAGE_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return new Date(ts);
  } catch {
    return null;
  }
}

function persistLastUpdated(date: Date) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_UPDATED_STORAGE_KEY, String(date.getTime()));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function useAdminPendingContracts(enabled: boolean): State {
  const [state, setState] = useState<State>(() => ({
    count: 0,
    pending: [],
    lastNewSchoolId: null,
    lastEvent: null,
    isRefreshing: false,
    lastUpdatedAt: readPersistedLastUpdated(),
  }));

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, isRefreshing: true }));
    const [{ data, error }, schoolsRes] = await Promise.all([
      supabase
        .from("signed_contracts")
        .select("school_id, signer_role, status, file_name")
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("schools")
        .select("id, name, subscription_status"),
    ]);
    if (error) {
      setState((s) => ({ ...s, isRefreshing: false }));
      return;
    }

    const bySchool = new Map<string, { hasAdmin: boolean; hasGestor: boolean; hasFlow: boolean }>();
    for (const row of (data || []) as ContractSignal[]) {
      const current = bySchool.get(row.school_id) ?? { hasAdmin: false, hasGestor: false, hasFlow: false };
      current.hasFlow = true;
      if (row.file_name !== "__request__" && row.signer_role === "admin") current.hasAdmin = true;
      if (row.file_name !== "__request__" && row.signer_role === "gestor") current.hasGestor = true;
      bySchool.set(row.school_id, current);
    }

    const subStatus = new Map<string, string>();
    const schoolNames = new Map<string, string>();
    for (const s of (schoolsRes.data || []) as { id: string; name: string; subscription_status: string }[]) {
      subStatus.set(s.id, s.subscription_status);
      schoolNames.set(s.id, s.name);
    }

    const pending: PendingContractItem[] = [];
    bySchool.forEach((item, schoolId) => {
      if (!item.hasFlow) return;
      const paid = subStatus.get(schoolId) === "active";
      const needsAdmin = !item.hasAdmin;
      const needsGestor = item.hasAdmin && !item.hasGestor;
      const needsPayment = item.hasAdmin && item.hasGestor && !paid;
      if (needsAdmin || needsGestor || needsPayment) {
        pending.push({
          schoolId,
          schoolName: schoolNames.get(schoolId) ?? "Escola",
          needsAdmin,
          needsGestor,
          needsPayment,
        });
      }
    });
    pending.sort((a, b) => a.schoolName.localeCompare(b.schoolName, "pt-BR"));
    const now = new Date();
    persistLastUpdated(now);
    setState((s) => ({ ...s, count: pending.length, pending, isRefreshing: false, lastUpdatedAt: now }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refetch();
    // Polling mais agressivo (10s) para acompanhar finalização de pagamento
    const interval = window.setInterval(refetch, 10000);

    // Refaz contagem ao voltar para a aba/janela
    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refetch);

    // Sincroniza "Última atualização" entre abas via storage event
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_UPDATED_STORAGE_KEY) {
        const updated = readPersistedLastUpdated();
        setState((s) => ({ ...s, lastUpdatedAt: updated }));
      }
    };
    window.addEventListener("storage", onStorage);

    const suffix = Math.random().toString(36).slice(2);
    const contractsChannel = supabase
      .channel(`admin-pending-contracts-${suffix}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signed_contracts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as {
              status?: string;
              school_id?: string;
              signer_role?: string;
              file_name?: string;
            };
            if (row?.school_id) {
              const event = row.file_name !== "__request__" && row.signer_role === "gestor"
                ? "gestor_signed"
                : row.status === "awaiting_admin"
                ? "awaiting_admin"
                : null;
              if (event) {
                setState((s) => ({
                  ...s,
                  lastNewSchoolId: row.school_id!,
                  lastEvent: event,
                }));
                refetch();
                return;
              }
            }
          }
          refetch();
        }
      )
      .subscribe();

    // Atualiza ao mudar status de assinatura da escola (pagamento confirmado)
    const schoolsChannel = supabase
      .channel(`admin-pending-schools-${suffix}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "schools" },
        (payload) => {
          const oldRow = payload.old as { subscription_status?: string } | null;
          const newRow = payload.new as { subscription_status?: string } | null;
          if (oldRow?.subscription_status !== newRow?.subscription_status) refetch();
        }
      )
      .subscribe();

    // Atualiza quando um pagamento muda de status (ex.: approved via webhook MP)
    const pagamentosChannel = supabase
      .channel(`admin-pending-pagamentos-${suffix}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pagamentos" },
        () => refetch()
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refetch);
      window.removeEventListener("storage", onStorage);
      supabase.removeChannel(contractsChannel);
      supabase.removeChannel(schoolsChannel);
      supabase.removeChannel(pagamentosChannel);
    };
  }, [enabled, refetch]);

  return state;
}
