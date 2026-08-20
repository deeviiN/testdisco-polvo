import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  XCircle,
  Calendar,
  UserPlus,
  UserMinus,
  Shield,
  FileSignature,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type AuditRow = {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  performed_by: string | null;
  created_at: string;
};

type ActorMap = Record<string, { full_name: string; role: string }>;

const ACTION_META: Record<
  string,
  { label: string; icon: typeof Activity; color: string; bg: string }
> = {
  booking_cancelled: { label: "Agendamento cancelado", icon: XCircle, color: "text-rose-600", bg: "bg-rose-500/10" },
  profile_approved: { label: "Cadastro aprovado", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  profile_rejected: { label: "Cadastro recusado", icon: XCircle, color: "text-rose-600", bg: "bg-rose-500/10" },
  profile_role_changed: { label: "Cargo alterado", icon: Shield, color: "text-violet-600", bg: "bg-violet-500/10" },
  profile_deleted: { label: "Usuário removido", icon: UserMinus, color: "text-rose-600", bg: "bg-rose-500/10" },
  role_granted: { label: "Permissão concedida", icon: Shield, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  role_revoked: { label: "Permissão revogada", icon: Shield, color: "text-rose-600", bg: "bg-rose-500/10" },
  subscription_released: { label: "Assinatura liberada", icon: FileSignature, color: "text-amber-600", bg: "bg-amber-500/10" },
  admin_revoke_access: { label: "Acesso revogado", icon: UserMinus, color: "text-rose-600", bg: "bg-rose-500/10" },
  admin_delete_user: { label: "Usuário excluído", icon: UserMinus, color: "text-rose-600", bg: "bg-rose-500/10" },
};

function metaFor(action: string) {
  return (
    ACTION_META[action] || {
      label: action.replace(/_/g, " "),
      icon: Activity,
      color: "text-slate-600",
      bg: "bg-slate-500/10",
    }
  );
}

function buildDetail(row: AuditRow): string {
  const o = row.old_data || {};
  const n = row.new_data || {};
  switch (row.action) {
    case "booking_cancelled":
      return [n.cancelled_by_name && `por ${n.cancelled_by_name}`, o.booking_date && `data ${o.booking_date}`, o.sector]
        .filter(Boolean)
        .join(" • ");
    case "profile_approved":
    case "profile_rejected":
      return [n.full_name, n.role].filter(Boolean).join(" • ");
    case "profile_role_changed":
      return `${n.full_name || ""}: ${o.role || "?"} → ${n.role || "?"}`;
    case "profile_deleted":
      return [o.full_name, o.role].filter(Boolean).join(" • ");
    case "subscription_released":
      return [n.plano, n.metodo, n.valor && `R$ ${n.valor}`].filter(Boolean).join(" • ");
    default:
      return "";
  }
}

const HIDDEN_KEYS = new Set(["id", "created_at", "updated_at", "user_id", "school_id"]);

function diffEntries(oldData: any, newData: any) {
  const o = oldData && typeof oldData === "object" ? oldData : {};
  const n = newData && typeof newData === "object" ? newData : {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).filter((k) => !HIDDEN_KEYS.has(k));
  const out: { key: string; before: any; after: any }[] = [];
  keys.forEach((k) => {
    const a = o[k];
    const b = n[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, before: a, after: b });
  });
  return out;
}

function fmtVal(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function GestorAtividade() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<ActorMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setRefreshing(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, table_name, record_id, old_data, new_data, performed_by, created_at")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      setRows(data as AuditRow[]);
      const ids = Array.from(new Set(data.map((r) => r.performed_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, role")
          .in("user_id", ids);
        const map: ActorMap = {};
        (profs || []).forEach((p: any) => (map[p.user_id] = { full_name: p.full_name, role: p.role }));
        setActors(map);
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [profile?.school_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: nova linha em audit_logs da escola
  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase
      .channel(`audit-${profile.school_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs", filter: `school_id=eq.${profile.school_id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.school_id, load]);

  return (
    <main className="min-h-dvh bg-[hsl(220,50%,14%)] text-white">
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[hsl(220,50%,14%)]/85 border-b border-white/10">
        <div className="flex items-center gap-2 px-3 py-3 max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate">Atividade da escola</h1>
              <p className="text-[11px] text-white/60 leading-tight">Histórico recente de ações</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={load}
            disabled={refreshing}
            className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white"
            aria-label="Atualizar"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-white/60 text-sm">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhuma atividade registrada ainda.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const meta = metaFor(row.action);
              const Icon = meta.icon;
              const actor = row.performed_by ? actors[row.performed_by] : null;
              const detail = buildDetail(row);
              const isOpen = expanded.has(row.id);
              const diffs = isOpen ? diffEntries(row.old_data, row.new_data) : [];
              const toggle = () =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                  return next;
                });
              return (
                <li
                  key={row.id}
                  className="rounded-xl bg-white/[0.06] border border-white/10 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={toggle}
                    className="w-full px-3 py-2.5 flex items-start gap-3 text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${meta.bg} ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-white break-words">{meta.label}</p>
                        <span className="text-[10px] text-white/50 shrink-0 whitespace-nowrap">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      {detail && <p className="text-xs text-white/75 break-words mt-0.5">{detail}</p>}
                      {actor && (
                        <p className="text-[11px] text-white/55 mt-0.5 break-words">
                          por {actor.full_name}
                        </p>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-white/50 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-white/10 bg-black/20">
                      <p className="text-[10px] uppercase tracking-wide text-white/45 mb-1.5">
                        {row.table_name}
                        {row.record_id ? ` · ${row.record_id.slice(0, 8)}` : ""}
                        {" · "}
                        {new Date(row.created_at).toLocaleString("pt-BR")}
                      </p>
                      {diffs.length === 0 ? (
                        <p className="text-xs text-white/55">Sem campos alterados.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {diffs.map((d) => (
                            <li key={d.key} className="text-xs">
                              <p className="font-semibold text-white/85 break-words">{d.key}</p>
                              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 mt-0.5">
                                <span className="text-rose-300/80">antes:</span>
                                <span className="text-rose-100/90 break-words whitespace-pre-wrap">{fmtVal(d.before)}</span>
                                <span className="text-emerald-300/80">depois:</span>
                                <span className="text-emerald-100/90 break-words whitespace-pre-wrap">{fmtVal(d.after)}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
