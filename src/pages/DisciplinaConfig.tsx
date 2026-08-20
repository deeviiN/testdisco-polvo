import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Settings2, Save, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Settings {
  infractions_threshold: number;
  block_duration_minutes: number;
  auto_block: boolean;
  manager_review: boolean;
  checkin_tolerance_minutes: number;
}

const DEFAULTS: Settings = {
  infractions_threshold: 3,
  block_duration_minutes: 15 * 1440,
  auto_block: true,
  manager_review: true,
  checkin_tolerance_minutes: 20,
};

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}

function Stepper({ value, onChange, min = 1, max = 999, suffix }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="flex items-stretch h-11 rounded-md overflow-hidden border border-white bg-white">
      <button
        type="button"
        onClick={dec}
        className="px-3 bg-[hsl(220,55%,22%)] text-white hover:bg-[hsl(220,55%,30%)] active:bg-[hsl(220,55%,18%)] flex items-center justify-center"
        aria-label="Diminuir"
      >
        <ChevronDown className="w-5 h-5" />
      </button>
      <div className="flex-1 flex items-center justify-center text-[hsl(220,55%,22%)] font-bold text-lg">
        {value}
        {suffix ? <span className="ml-1 text-sm font-semibold">{suffix}</span> : null}
      </div>
      <button
        type="button"
        onClick={inc}
        className="px-3 bg-[hsl(220,55%,22%)] text-white hover:bg-[hsl(220,55%,30%)] active:bg-[hsl(220,55%,18%)] flex items-center justify-center"
        aria-label="Aumentar"
      >
        <ChevronUp className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function DisciplinaConfig() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const { data } = await supabase
      .from("school_discipline_settings")
      .select("*")
      .eq("school_id", profile.school_id)
      .maybeSingle();
    if (data) {
      setExists(true);
      setS({
        infractions_threshold: data.infractions_threshold,
        block_duration_minutes: data.block_duration_minutes,
        auto_block: data.auto_block,
        manager_review: data.manager_review,
        checkin_tolerance_minutes: data.checkin_tolerance_minutes,
      });
    }
    setLoading(false);
  }, [profile?.school_id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!profile?.school_id) return;
    setSaving(true);
    const payload = { school_id: profile.school_id, ...s, updated_by: profile.user_id };
    const { error } = exists
      ? await supabase.from("school_discipline_settings").update(payload).eq("school_id", profile.school_id)
      : await supabase.from("school_discipline_settings").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Falha ao salvar");
      return;
    }
    setExists(true);
    toast.success("Configurações salvas.");
  };

  const blockDays = Math.max(1, Math.round(s.block_duration_minutes / 1440));

  const cardCls = "rounded-lg border border-white/15 bg-[hsl(220,55%,22%)] text-white px-3 py-2 shadow-md";
  const labelCls = "font-bold text-white text-sm";
  const descCls = "text-[11px] text-white/70 leading-tight";

  return (
    <div className="h-[100dvh] bg-[hsl(220,50%,18%)] flex flex-col overflow-hidden overscroll-none touch-none">
      <div className="bg-primary text-primary-foreground px-3 pt-16 pb-4 flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 h-9 w-9" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Settings2 className="w-5 h-5" />
        <span className="font-bold text-base">Configurações de Punição</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-white/70">Carregando…</div>
      ) : (
        <div className="flex-1 p-2 pt-6 space-y-2 overflow-hidden">
          <div className={cardCls}>
            <Label className={labelCls}>Gravidade da falta</Label>
            <p className={descCls}>Quantas faltas até aplicar a punição.</p>
            <div className="mt-1.5">
              <Stepper
                value={s.infractions_threshold}
                onChange={(v) => setS({ ...s, infractions_threshold: v })}
                min={1}
                max={20}
                suffix="faltas"
              />
            </div>
          </div>

          <div className={cardCls}>
            <Label className={labelCls}>Duração do bloqueio</Label>
            <p className={descCls}>Tempo (em dias) que o usuário fica bloqueado.</p>
            <div className="mt-1.5">
              <Stepper
                value={blockDays}
                onChange={(v) => setS({ ...s, block_duration_minutes: v * 1440 })}
                min={1}
                max={365}
                suffix="dias"
              />
            </div>
          </div>

          <div className={`${cardCls} flex items-center justify-between gap-3`}>
            <div className="flex-1 min-w-0">
              <Label className={labelCls}>Bloqueio automático</Label>
              <p className={descCls}>Aplica o bloqueio ao atingir o limite, sem aprovação.</p>
            </div>
            <Switch
              checked={s.auto_block}
              onCheckedChange={(v) => setS({ ...s, auto_block: v })}
              className="data-[state=checked]:bg-teal-400 data-[state=unchecked]:bg-slate-400/60 border-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
            />
          </div>

          <div className={`${cardCls} flex items-center justify-between gap-3`}>
            <div className="flex-1 min-w-0">
              <Label className={labelCls}>Revisão pelo gestor</Label>
              <p className={descCls}>Gestor analisa cada caso antes da decisão final.</p>
            </div>
            <Switch
              checked={s.manager_review}
              onCheckedChange={(v) => setS({ ...s, manager_review: v })}
              className="data-[state=checked]:bg-teal-400 data-[state=unchecked]:bg-slate-400/60 border-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
            />
          </div>

          <div className={cardCls}>
            <Label className={labelCls}>Tolerância para check-in</Label>
            <p className={descCls}>
              Sem check-in nesse tempo após o início, a sala é liberada.
            </p>
            <div className="mt-1.5">
              <Stepper
                value={s.checkin_tolerance_minutes}
                onChange={(v) => setS({ ...s, checkin_tolerance_minutes: v })}
                min={0}
                max={240}
                suffix="min"
              />
            </div>
          </div>
        </div>
      )}

      <div className="p-2 pb-6 shrink-0">
        <Button
          onClick={save}
          disabled={saving || loading}
          className="w-full h-12 font-bold text-base bg-amber-500 hover:bg-amber-400 text-[hsl(220,55%,22%)]"
        >
          <Save className="w-5 h-5 mr-2" />
          {saving ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
}
