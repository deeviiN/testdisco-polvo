import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import LastUpdateBadge from "@/components/LastUpdateBadge";

type Manifest = {
  minimum_supported_version: string;
  minimum_supported_build_time: number;
  latest_version: string;
  latest_build_time: number;
  updated_at: string;
};

function formatBuildDate(buildTime: number) {
  if (!buildTime) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(buildTime));
}

export default function AppVersionGateCard() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [versionInput, setVersionInput] = useState("");
  const [buildTimeInput, setBuildTimeInput] = useState<string>("");

  const loadManifest = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_app_version_manifest");
    if (error) {
      toast.error("Erro ao carregar manifesto de versão: " + error.message);
      setLoading(false);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as Manifest | null | undefined;
    if (row) {
      setManifest(row);
      setVersionInput(row.minimum_supported_version ?? "");
      setBuildTimeInput(String(row.minimum_supported_build_time ?? ""));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  const broadcastRefresh = async () => {
    const { error } = await supabase.rpc("broadcast_app_refresh");
    if (error) console.warn("Falha ao avisar usuários sobre atualização.", error);
  };

  const handleApplyCurrentBuild = () => {
    setVersionInput(__APP_VERSION__);
    setBuildTimeInput(String(__APP_BUILD_TIME__));
  };

  const handleSave = async () => {
    const version = versionInput.trim();
    const buildTime = Number(buildTimeInput);

    if (!version) {
      toast.error("Informe a versão mínima.");
      return;
    }
    if (!Number.isFinite(buildTime) || buildTime < 0) {
      toast.error("Informe um build time válido (número em ms).");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc("set_minimum_supported_version", {
      _version: version,
      _build_time: buildTime,
    });

    if (error) {
      toast.error("Erro ao salvar versão mínima: " + error.message);
      setSaving(false);
      return;
    }

    await broadcastRefresh();
    toast.success("Versão mínima atualizada! Usuários serão atualizados agora.");
    const row = data as Manifest | null;
    if (row) {
      setManifest(row);
      setVersionInput(row.minimum_supported_version ?? version);
      setBuildTimeInput(String(row.minimum_supported_build_time ?? buildTime));
    } else {
      await loadManifest();
    }
    setSaving(false);
  };

  const handleLockNow = async () => {
    setVersionInput(__APP_VERSION__);
    setBuildTimeInput(String(__APP_BUILD_TIME__));
    setSaving(true);
    const { data, error } = await supabase.rpc("set_minimum_supported_version", {
      _version: __APP_VERSION__,
      _build_time: __APP_BUILD_TIME__,
    });
    if (error) {
      toast.error("Erro: " + error.message);
      setSaving(false);
      return;
    }
    await broadcastRefresh();
    toast.success("✅ Bloqueado! Celulares antigos serão atualizados agora.");
    const row = data as Manifest | null;
    if (row) setManifest(row);
    setSaving(false);
  };

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Versão mínima do app</h3>
            <p className="text-xs text-muted-foreground">
              Define a versão mínima permitida. Instalações abaixo são bloqueadas até atualizar.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p>
            <span className="font-semibold">Build atual deste navegador:</span> v{__APP_VERSION__} ({__APP_BUILD_TIME__})
          </p>
          <p>
            <span className="font-semibold">Versão mínima exigida:</span>{" "}
            {loading ? "..." : `v${manifest?.minimum_supported_version ?? "—"} (${manifest?.minimum_supported_build_time ?? 0})`}
          </p>
          <p>
            <span className="font-semibold">Última atualização:</span>{" "}
            {loading ? "..." : manifest?.updated_at ? formatBuildDate(new Date(manifest.updated_at).getTime()) : "—"}
          </p>
          <LastUpdateBadge location="version_card" className="pt-1" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Versão mínima (ex: 1804.1331)</Label>
            <Input
              value={versionInput}
              onChange={(e) => setVersionInput(e.target.value)}
              placeholder="DDMM.HHMM"
              className="h-10 rounded-xl bg-secondary/50 border-0"
              disabled={saving || loading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Build time (ms desde 1970)</Label>
            <Input
              value={buildTimeInput}
              onChange={(e) => setBuildTimeInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="1776519097490"
              inputMode="numeric"
              className="h-10 rounded-xl bg-secondary/50 border-0"
              disabled={saving || loading}
            />
          </div>
        </div>

        <Button
          type="button"
          onClick={handleLockNow}
          disabled={saving || loading}
          className="h-14 w-full rounded-xl gap-2 font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
          Bloquear versões anteriores AGORA
        </Button>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleApplyCurrentBuild}
            disabled={saving || loading}
            className="h-11 rounded-xl gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Usar build atual
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-11 rounded-xl gap-2 flex-1 font-bold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar versão mínima
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          O botão vermelho faz tudo de uma vez: pega esta versão e bloqueia todas as anteriores. Use os campos acima só se quiser definir manualmente.
        </p>
      </CardContent>
    </Card>
  );
}