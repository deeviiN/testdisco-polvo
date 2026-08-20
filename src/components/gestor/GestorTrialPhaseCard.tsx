import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Lock, Sparkles, Clock } from "lucide-react";
import { useSchoolTrialPhase } from "@/hooks/useSchoolTrialPhase";

const PHASES = [
  {
    key: "trial",
    range: "0–10 dias",
    title: "Trial completo",
    desc: "Todos os setores liberados, painel gestor 100% disponível.",
    Icon: Sparkles,
    color: "emerald",
  },
  {
    key: "restricted",
    range: "10–20 dias",
    title: "Carência",
    desc: "Apenas o setor Sala de Vídeo pode ser agendado. Demais setores bloqueados.",
    Icon: AlertTriangle,
    color: "amber",
  },
  {
    key: "blocked",
    range: "20+ dias",
    title: "Bloqueio total",
    desc: "Agendamentos suspensos. Disponível só /subscription, documentos, perfil e configurações.",
    Icon: Lock,
    color: "rose",
  },
] as const;

const COLOR_MAP: Record<string, { bg: string; text: string; ring: string; chip: string }> = {
  emerald: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-200",
    ring: "ring-emerald-400/50",
    chip: "bg-emerald-500 text-white",
  },
  amber: {
    bg: "bg-amber-500/15",
    text: "text-amber-200",
    ring: "ring-amber-400/50",
    chip: "bg-amber-500 text-amber-950",
  },
  rose: {
    bg: "bg-rose-500/15",
    text: "text-rose-200",
    ring: "ring-rose-400/60",
    chip: "bg-rose-500 text-white",
  },
};

export default function GestorTrialPhaseCard() {
  const navigate = useNavigate();
  const trial = useSchoolTrialPhase();

  if (trial.phase === "loading" || trial.phase === "active") return null;

  const current = PHASES.find((p) => p.key === trial.phase) ?? PHASES[0];
  const remaining = trial.daysRemainingInPhase ?? 0;
  const days = trial.daysSinceApproval;
  // Progresso 0–20 dias (após 20, fica 100%)
  const progress = Math.min(100, Math.round((days / 20) * 100));

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-800/60 ring-1 ring-white/10 p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-amber-100 font-bold text-sm leading-tight">Seu período de avaliação</p>
            <p className="text-amber-100/60 text-[11px]">Fase atual: {current.title}</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/subscription")}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 transition"
        >
          Assinar
        </button>
      </div>

      {/* Barra de progresso 20 dias */}
      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-amber-100/60 font-semibold mb-1">
          <span>Dia {days}</span>
          <span>
            {trial.phase === "blocked"
              ? "Plano vencido"
              : `${remaining} ${remaining === 1 ? "dia restante" : "dias restantes"} nesta fase`}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full transition-all ${
              trial.phase === "blocked"
                ? "bg-rose-500"
                : trial.phase === "restricted"
                ? "bg-amber-400"
                : "bg-emerald-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Fases */}
      <div className="mt-4 space-y-2">
        {PHASES.map((p) => {
          const isActive = p.key === trial.phase;
          const c = COLOR_MAP[p.color];
          const Icon = p.Icon;
          return (
            <div
              key={p.key}
              className={`flex items-start gap-3 rounded-xl p-2.5 ${c.bg} ${
                isActive ? `ring-2 ${c.ring}` : "opacity-70"
              }`}
            >
              <div className={`shrink-0 h-8 w-8 rounded-lg ${c.chip} flex items-center justify-center`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-[11px] font-bold uppercase tracking-wide ${c.text}`}>
                    {p.range}
                  </p>
                  {isActive && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/20 text-white">
                      AGORA
                    </span>
                  )}
                </div>
                <p className="text-white text-[12px] font-semibold leading-snug">{p.title}</p>
                <p className="text-white/70 text-[11px] leading-snug break-words">{p.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[10px] text-amber-100/50">
        Assinando o plano, sua escola volta ao acesso completo imediatamente.
      </p>
    </div>
  );
}
