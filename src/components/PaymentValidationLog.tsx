import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { DiscardedPaymentLog } from "@/lib/paymentDocumentValidator";

const ISSUE_LABEL: Record<string, string> = {
  unexpected_bucket: "Campo bucket inesperado",
  unexpected_path: "Campo path inesperado",
  unexpected_signer_role: "signer_role indevido (campo de contrato)",
  unknown_status: "Status fora da lista canônica",
  missing_pix_payload: "PIX sem qr_code/ticket_url",
  missing_boleto_payload: "Boleto sem ticket_url",
};

type KindFilter = "all" | "pix" | "boleto";
type ReasonFilter = "all" | keyof typeof ISSUE_LABEL;

export function PaymentValidationLog({
  discards,
  viewer,
  schoolNameOf,
}: {
  discards: DiscardedPaymentLog[];
  viewer: "admin" | "gestor";
  schoolNameOf?: (schoolId: string | null) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [reason, setReason] = useState<ReasonFilter>("all");

  // Motivos realmente presentes na lista (para popular o select)
  const reasonsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const d of discards) for (const i of d.issues) s.add(i.code);
    return Array.from(s);
  }, [discards]);

  const filtered = useMemo(() => {
    return discards.filter((d) => {
      if (kind !== "all" && d.kindGuess !== kind) return false;
      if (reason !== "all" && !d.issues.some((i) => i.code === reason)) return false;
      return true;
    });
  }, [discards, kind, reason]);

  // Contadores por tipo (sobre TODOS os descartes, sem filtro)
  const totalPix = discards.filter((d) => d.kindGuess === "pix").length;
  const totalBol = discards.filter((d) => d.kindGuess === "boleto").length;
  const total = discards.length;

  return (
    <div className="rounded-xl border border-amber-400/30 bg-black/40 mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 h-10 text-left"
        aria-expanded={open}
      >
        <AlertTriangle className={`h-4 w-4 ${total > 0 ? "text-amber-300" : "text-emerald-300"}`} />
        <span className="text-amber-100/90 text-xs font-extrabold uppercase tracking-wide">
          Validação PIX/Boletos
        </span>
        <span
          className={`ml-1 text-[11px] font-black px-2 py-0.5 rounded-full ${
            total > 0 ? "bg-amber-400 text-[hsl(220,70%,10%)]" : "bg-emerald-500/30 text-emerald-200"
          }`}
        >
          {total} {total === 1 ? "descarte" : "descartes"}
        </span>
        <span className="ml-auto text-amber-100/70">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {total === 0 ? (
            <p className="text-emerald-200/80 text-xs">
              Nenhum pagamento descartado. Admin e gestor estão exibindo o mesmo conjunto.
            </p>
          ) : (
            <>
              {/* Filtros */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { k: "all", label: `Todos (${total})` },
                    { k: "pix", label: `PIX (${totalPix})` },
                    { k: "boleto", label: `Boletos (${totalBol})` },
                  ] as { k: KindFilter; label: string }[]
                ).map(({ k, label }) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold ring-1 transition ${
                      kind === k
                        ? "bg-amber-400 text-[hsl(220,70%,10%)] ring-amber-300"
                        : "bg-black/40 text-amber-100/90 ring-white/15 hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ReasonFilter)}
                className="w-full h-8 rounded-md bg-black/60 ring-1 ring-white/15 px-2 text-white text-xs"
                aria-label="Filtrar por motivo"
              >
                <option value="all">Todos os motivos ({total})</option>
                {reasonsPresent.map((code) => {
                  const n = discards.filter((d) => d.issues.some((i) => i.code === code)).length;
                  return (
                    <option key={code} value={code}>
                      {ISSUE_LABEL[code] ?? code} ({n})
                    </option>
                  );
                })}
              </select>

              <div className="flex items-center gap-2">
                <p className="text-amber-100/70 text-[11px] font-semibold">
                  Mostrando {filtered.length} de {total}
                </p>
                {(kind !== "all" || reason !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setKind("all");
                      setReason("all");
                    }}
                    className="ml-auto h-7 px-2.5 rounded-md text-[11px] font-bold ring-1 ring-amber-300/60 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20 transition"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <p className="text-amber-100/60 text-xs italic">
                  Nenhum descarte para os filtros atuais.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {filtered.map((d) => {
                    const school = schoolNameOf?.(d.schoolId);
                    return (
                      <li
                        key={d.id}
                        className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[11px] text-amber-100/90 break-words"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-black uppercase tracking-wide text-amber-300">
                            {d.kindGuess}
                          </span>
                          <span className="font-mono text-white/70">#{d.id.slice(0, 8)}</span>
                          {school && (
                            <span className="ml-auto text-amber-200/80 font-bold">{school}</span>
                          )}
                        </div>
                        <ul className="mt-1 list-disc pl-4 space-y-0.5">
                          {d.issues
                            .filter((i) => reason === "all" || i.code === reason)
                            .map((i, idx) => (
                              <li key={idx} className="text-white/85">
                                <span className="font-bold text-amber-200">
                                  {ISSUE_LABEL[i.code] ?? i.code}
                                </span>
                                : {i.message}
                              </li>
                            ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
          <p className="text-amber-100/50 text-[10px]">
            Origem: {viewer === "admin" ? "leitura admin" : "leitura gestor"} · descartes não são
            exibidos na lista para manter paridade entre os dois lados.
          </p>
        </div>
      )}
    </div>
  );
}
