import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Scale, AlertTriangle, ShieldAlert, ShieldX, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Infraction {
  id: string;
  type: "ausencia" | "sem_checkout";
  created_at: string;
  booking_id: string;
}

interface DisciplineProfile {
  discipline_status: string;
  discipline_total_infractions: number;
  discipline_suspended_until: string | null;
  discipline_blocked_at: string | null;
  discipline_unblocked_count: number;
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: any }> = {
  ok: { label: "Regular", color: "text-green-500", icon: ShieldCheck },
  blocked_manager: { label: "Bloqueado — aguarde gestor", color: "text-red-500", icon: ShieldX },
  suspended_auto: { label: "Suspenso automaticamente", color: "text-red-600", icon: ShieldAlert },
};

export default function Disciplina() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [items, setItems] = useState<Infraction[]>([]);
  const [disc, setDisc] = useState<DisciplineProfile | null>(null);

  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      const [{ data: infs }, { data: p }] = await Promise.all([
        supabase
          .from("user_infractions")
          .select("id,type,created_at,booking_id")
          .eq("user_id", profile.user_id)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("discipline_status,discipline_total_infractions,discipline_suspended_until,discipline_blocked_at,discipline_unblocked_count")
          .eq("user_id", profile.user_id)
          .maybeSingle(),
      ]);
      setItems((infs as Infraction[]) || []);
      setDisc(p as DisciplineProfile);
    })();
  }, [profile?.user_id]);

  const status = disc?.discipline_status || "ok";
  const meta = STATUS_LABEL[status] || STATUS_LABEL.ok;
  const Icon = meta.icon;
  const total = disc?.discipline_total_infractions || 0;
  const unblocks = disc?.discipline_unblocked_count || 0;
  const cycleCount = unblocks === 0 ? total : total - 3 - (unblocks - 1) * 2;
  const remainingInCycle = unblocks === 0 ? Math.max(0, 3 - total) : Math.max(0, 2 - cycleCount);

  const suspUntil = disc?.discipline_suspended_until
    ? new Date(disc.discipline_suspended_until).toLocaleDateString("pt-BR")
    : null;

  return (
    <div className="relative min-h-[100dvh] text-white flex flex-col bg-gradient-to-br from-[hsl(220,75%,5%)] via-[hsl(222,70%,10%)] to-[hsl(225,80%,4%)] overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-[28rem] h-[28rem] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -bottom-40 right-0 w-[28rem] h-[28rem] rounded-full bg-blue-700/20 blur-3xl" />
      </div>

      <div
        className="sticky top-0 z-20 px-3 py-2 flex items-center gap-2 border-b border-white/10 backdrop-blur-xl"
        style={{ background: "linear-gradient(135deg, hsla(220,80%,12%,0.85), hsla(225,75%,8%,0.85))" }}
      >
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
          style={{
            background: "linear-gradient(135deg, hsl(45,100%,55%), hsl(32,95%,50%))",
            boxShadow: "0 0 18px hsla(45,100%,60%,0.5)",
          }}
        >
          <Scale className="w-5 h-5 text-[hsl(225,80%,8%)]" />
        </div>
        <span className="font-extrabold text-base tracking-tight">Minha disciplina</span>
      </div>

      <div className="relative z-10 p-4 space-y-6">
        {/* Status card (barra azul) */}
        <div
          className="rounded-2xl border p-4 flex items-center gap-3 shadow-2xl backdrop-blur-md"
          style={{
            background: "linear-gradient(135deg, hsla(220,70%,18%,0.7), hsla(225,75%,10%,0.7))",
            borderColor: "hsla(210,90%,60%,0.35)",
            boxShadow: "0 10px 40px -10px hsla(220,90%,50%,0.45), inset 0 1px 0 hsla(0,0%,100%,0.08)",
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, hsla(220,80%,25%,0.9), hsla(225,70%,12%,0.9))",
              boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.15), 0 0 20px hsla(210,90%,55%,0.35)",
            }}
          >
            <Icon className={`w-8 h-8 ${meta.color}`} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-blue-200/70 uppercase tracking-[0.15em] font-bold">Status</div>
            <div className={`text-xl font-extrabold ${meta.color} drop-shadow`}>{meta.label}</div>
            {status === "suspended_auto" && suspUntil && (
              <div className="text-sm font-bold mt-1 text-white/90">
                Liberação automática em <span className="text-red-400">{suspUntil}</span>
              </div>
            )}
            {status === "blocked_manager" && (
              <div className="text-sm font-bold mt-1 text-white/90">Procure o gestor da escola para desbloquear.</div>
            )}
          </div>
        </div>

        {/* Counter card (logo atrás da barra azul) */}
        <div
          className="rounded-2xl border p-5 shadow-2xl backdrop-blur-md relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, hsla(220,75%,15%,0.85), hsla(218,80%,22%,0.75) 60%, hsla(225,75%,10%,0.85))",
            borderColor: "hsla(45,100%,60%,0.3)",
            boxShadow: "0 10px 40px -10px hsla(220,90%,50%,0.45), inset 0 1px 0 hsla(0,0%,100%,0.08)",
          }}
        >
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-400/15 blur-2xl pointer-events-none" />
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-amber-200/80">
            Advertências acumuladas
          </div>
          <div
            className="text-6xl font-black tabular-nums bg-clip-text text-transparent leading-none"
            style={{ backgroundImage: "linear-gradient(135deg, hsl(45,100%,75%), hsl(32,95%,55%))" }}
          >
            {total}
          </div>
          {status === "ok" && (
            <div className="text-sm mt-1 text-white/80">
              {unblocks === 0
                ? `Faltam ${remainingInCycle} para o bloqueio.`
                : `Faltam ${remainingInCycle} para a suspensão de 15 dias.`}
            </div>
          )}
        </div>

        {/* Histórico */}
        <div
          className="rounded-2xl border overflow-hidden shadow-2xl backdrop-blur-md"
          style={{
            background: "linear-gradient(135deg, hsla(220,70%,12%,0.75), hsla(225,75%,8%,0.75))",
            borderColor: "hsla(210,90%,60%,0.25)",
            boxShadow: "0 10px 40px -10px hsla(220,90%,50%,0.4), inset 0 1px 0 hsla(0,0%,100%,0.06)",
          }}
        >
          <div
            className="px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-bold text-blue-100"
            style={{ background: "linear-gradient(90deg, hsla(220,80%,22%,0.85), hsla(225,75%,12%,0.5))" }}
          >
            Histórico
          </div>
          {items.length === 0 ? (
            <div className="p-4 text-sm text-blue-100/60">Nenhuma advertência registrada.</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((it) => (
                <li key={it.id} className="px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 drop-shadow" />
                  <div className="flex-1">
                    <div className="font-bold text-sm text-white">
                      {it.type === "ausencia" ? "Ausência total no agendamento" : "Saiu sem fazer check-out"}
                    </div>
                    <div className="text-xs text-blue-200/60 tabular-nums">
                      {new Date(it.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Como funciona */}
        <div
          className="rounded-2xl border p-4 text-xs space-y-1 backdrop-blur-md"
          style={{
            background: "linear-gradient(135deg, hsla(220,60%,15%,0.55), hsla(225,65%,10%,0.55))",
            borderColor: "hsla(210,80%,60%,0.2)",
          }}
        >
          <div className="font-bold text-amber-200 uppercase tracking-wider text-[11px]">Como funciona</div>
          <div className="text-white/80">• 1ª e 2ª advertência: apenas aviso.</div>
          <div className="text-white/80">• 3ª: bloqueio — só o gestor desbloqueia.</div>
          <div className="text-white/80">
            • Após desbloqueio: +1 aviso, +1 = suspensão automática de 15 dias (nem o gestor libera).
          </div>
        </div>
      </div>
    </div>
  );
}
