import { Loader2, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MigrationQuote = {
  valor_mensal: number;
  meses_ciclo: number;
  meses_pagos: number;
  meses_restantes: number;
  valor_total: number;
};

type Props = {
  quote: MigrationQuote;
  loading?: boolean;
  onStartMigration?: () => void;
};

/**
 * Card de migração mensal → anual à vista.
 * IMPORTANTE: este componente é intencionalmente livre de classes
 * responsivas (`sm:` / `md:` / `lg:`). Qualquer regressão visual
 * entre breakpoints é coberta pelo snapshot em
 * `src/components/__tests__/MigrationQuoteCard.snapshot.test.tsx`.
 */
export function MigrationQuoteCard({ quote, loading = false, onStartMigration }: Props) {
  if (quote.meses_pagos <= 0) return null;
  const restantes = quote.meses_restantes;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="rounded-xl p-3 border border-amber-300/50 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-amber-700/15 backdrop-blur-md shadow-md animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-md">
          <Wallet className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-white font-extrabold text-[13px] leading-tight break-words">
            {restantes === 0 ? "Ciclo anual já quitado" : "Quitar o ano todo de uma vez"}
          </p>
          <p className="text-white/80 text-[11px] leading-snug break-words">
            Você já pagou <strong>{quote.meses_pagos}</strong> de {quote.meses_ciclo}{" "}
            {quote.meses_ciclo === 1 ? "mês" : "meses"} do ciclo.
            {restantes === 0 ? (
              " Restam 0 meses — nada a pagar agora."
            ) : (
              <>
                {restantes === 1 ? " Falta " : " Faltam "}
                <strong>{restantes}</strong> {restantes === 1 ? "mês" : "meses"} × {fmt(quote.valor_mensal)}.
              </>
            )}
          </p>
          <p className="text-amber-100 font-bold text-[15px] leading-tight">
            Total à vista: {fmt(quote.valor_total)}
          </p>
        </div>
      </div>
      {restantes > 0 && (
        <Button
          onClick={onStartMigration}
          disabled={loading}
          className="mt-2 w-full h-12 font-bold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando PIX…</>
          ) : (
            <><QrCode className="h-4 w-4 mr-2" /> Pagar {restantes} {restantes === 1 ? "mês" : "meses"} via PIX</>
          )}
        </Button>
      )}
    </div>
  );
}
