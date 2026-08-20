import LastUpdateLocationCard from "@/components/admin/LastUpdateLocationCard";
import LastUpdateBadge from "@/components/LastUpdateBadge";
import type { LastUpdateLocation } from "@/lib/lastUpdatePreference";

/**
 * Fixture de preview/E2E para validar a persistência de
 * "Onde exibir Última atualização".
 *
 * Renderiza o card de configuração + um badge para cada local possível,
 * cada um com data-testid. Apenas o badge correspondente à preferência
 * salva ficará visível (os outros retornam null).
 */
const LOCATIONS: Exclude<LastUpdateLocation, "off">[] = [
  "header",
  "footer",
  "version_card",
  "home",
];

export default function LastUpdateLocationPreview() {
  return (
    <div className="min-h-dvh bg-background p-4 space-y-4" data-testid="last-update-preview-root">
      <h1 className="text-lg font-bold">Preview: Última atualização</h1>

      <LastUpdateLocationCard />

      <div className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold text-muted-foreground">Slots de exibição</p>
        {LOCATIONS.map((loc) => (
          <div
            key={loc}
            data-testid={`slot-${loc}`}
            className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 text-xs"
          >
            <span className="font-mono text-muted-foreground">{loc}</span>
            <span data-testid={`badge-${loc}`}>
              <LastUpdateBadge location={loc} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
