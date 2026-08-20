import { useState } from "react";
import { Check, X, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

type Row = { feature: string; us: boolean | string; others: boolean | string };

const ROWS: Row[] = [
  { feature: "Agendamento de ambientes (quadra, sala, laboratório…)", us: true, others: "Parcial" },
  { feature: "Multi-tenant por código INEP", us: true, others: false },
  { feature: "Contrato bilateral com assinatura digital", us: true, others: false },
  { feature: "Caixa de mensagens entre escolas da rede", us: true, others: false },
  { feature: "PDFs com IA (comunicados, relatórios)", us: true, others: false },
  { feature: "Modo TV para mural da escola", us: true, others: "Raro" },
  { feature: "App instalável (PWA) + notificações push", us: true, others: "Parcial" },
  { feature: "Suporte humano via WhatsApp", us: true, others: "E-mail" },
  { feature: "QR Code de check-in do ambiente", us: true, others: false },
  { feature: "Uso real do ambiente ao vivo (cronômetro)", us: true, others: false },
  { feature: "Presença nos cards de agendamentos", us: true, others: false },
  { feature: "Sistema de advertências disciplinares", us: true, others: false },
  { feature: "Horários editáveis + tempo reduzido do dia", us: true, others: false },
  { feature: "Conversa privada 1-a-1 entre usuários", us: true, others: "Parcial" },
  { feature: "Caixa de solicitações unificada", us: true, others: false },
  { feature: "Documento de ID da comunidade escolar", us: true, others: false },
  { feature: "Cabeçalho oficial (Governo/Secretaria) em PDFs", us: true, others: false },
  { feature: "Painel de logs runtime (gestor/admin)", us: true, others: false },
  { feature: "Notificação de decisão em evento externo", us: true, others: false },
  { feature: "Migração de plano mensal → anual à vista", us: true, others: false },
  { feature: "Aprovação automática do gestor via pagamento", us: true, others: false },
  { feature: "Botão Atualizar que força nova build (PWA)", us: true, others: false },
  { feature: "Preço médio mensal", us: "R$ 199,90", others: "R$ 200 – R$ 800" },
];


export default function ValueComparisonCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-400/15 via-amber-300/10 to-transparent backdrop-blur-md p-3 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 h-8 w-8 rounded-full bg-amber-400/25 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-amber-200" />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-bold text-sm leading-tight">
              Por que R$ 199,90/mês vale a pena
            </h3>
            <p className="text-[11px] text-white/70 leading-snug">
              Comparativo com o mercado brasileiro
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-white/80 shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-white/80 shrink-0" />
        )}
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {/* Tabela de recursos */}
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5 bg-white/5 text-[10px] uppercase tracking-wide text-white/70 font-bold">
              <span>Recurso</span>
              <span className="text-center w-14">Nós</span>
              <span className="text-center w-14">Outros</span>
            </div>
            {ROWS.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5 text-[11px] text-white/90 border-t border-white/5 items-center"
              >
                <span className="break-words leading-snug">{r.feature}</span>
                <span className="w-14 flex justify-center">
                  {r.us === true ? (
                    <Check className="h-4 w-4 text-emerald-300" />
                  ) : r.us === false ? (
                    <X className="h-4 w-4 text-red-300" />
                  ) : (
                    <span className="text-[10px] font-bold text-amber-200 text-center break-words">{r.us}</span>
                  )}
                </span>
                <span className="w-14 flex justify-center">
                  {r.others === true ? (
                    <Check className="h-4 w-4 text-emerald-300/70" />
                  ) : r.others === false ? (
                    <X className="h-4 w-4 text-red-300/70" />
                  ) : (
                    <span className="text-[10px] text-white/70 text-center break-words">{r.others}</span>
                  )}
                </span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
