import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  LAST_UPDATE_LOCATION_EVENT,
  LAST_UPDATE_LOCATION_OPTIONS,
  LastUpdateLocation,
  getLastUpdateLocation,
  setLastUpdateLocation,
} from "@/lib/lastUpdatePreference";
import LastUpdateBadge from "@/components/LastUpdateBadge";

export default function LastUpdateLocationCard() {
  const [value, setValue] = useState<LastUpdateLocation>(() => getLastUpdateLocation());

  useEffect(() => {
    const onChange = () => setValue(getLastUpdateLocation());
    window.addEventListener(LAST_UPDATE_LOCATION_EVENT, onChange);
    return () => window.removeEventListener(LAST_UPDATE_LOCATION_EVENT, onChange);
  }, []);

  const handleChange = (next: string) => {
    const v = next as LastUpdateLocation;
    setValue(v);
    setLastUpdateLocation(v);
    const label = LAST_UPDATE_LOCATION_OPTIONS.find((o) => o.value === v)?.label ?? v;
    toast.success(`Preferência salva: ${label}`);
  };

  const current = LAST_UPDATE_LOCATION_OPTIONS.find((o) => o.value === value);

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Onde exibir "Última atualização"</h3>
            <p className="text-xs text-muted-foreground">
              Escolha em qual área do app a data/hora da última atualização aparece.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Local de exibição</Label>
          <Select value={value} onValueChange={handleChange}>
            <SelectTrigger className="h-11 rounded-xl bg-secondary/50 border-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAST_UPDATE_LOCATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[11px] text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {current && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-2">
            <p className="font-semibold">Pré-visualização:</p>
            {value === "off" ? (
              <p className="text-muted-foreground">A informação ficará oculta em todos os lugares.</p>
            ) : (
              <LastUpdateBadge location={value} />
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          A preferência é salva neste dispositivo (localStorage) e aplica-se imediatamente.
        </p>
      </CardContent>
    </Card>
  );
}
