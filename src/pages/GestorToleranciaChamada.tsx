import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Sun, Sunset, Moon, Minus, Plus, Clock } from "lucide-react";

type Shift = "manha" | "tarde" | "noite";

const SHIFTS: { key: Shift; label: string; Icon: any; color: string }[] = [
  { key: "manha", label: "MANHÃ",  Icon: Sun,    color: "from-amber-400 to-orange-500" },
  { key: "tarde", label: "TARDE",  Icon: Sunset, color: "from-orange-400 to-rose-500" },
  { key: "noite", label: "NOITE",  Icon: Moon,   color: "from-indigo-500 to-slate-700" },
];

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.max(0, Math.min(120, n));
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(clamp(value - 1))}
        className="h-14 w-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center shrink-0"
        aria-label="Diminuir 1 min">
        <Minus className="h-5 w-5" />
      </button>
      <div className="flex-1 h-14 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center">
        <input
          type="number" min={0} max={120} value={value}
          onChange={(e) => onChange(clamp(parseInt(e.target.value || "0", 10)))}
          className="w-16 text-3xl font-black text-center bg-transparent outline-none tabular-nums"
        />
        <span className="text-sm font-bold text-slate-500 ml-1">min</span>
      </div>
      <button type="button" onClick={() => onChange(clamp(value + 1))}
        className="h-14 w-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center shrink-0"
        aria-label="Aumentar 1 min">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function GestorToleranciaChamada() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<Shift, number>>({ manha: 15, tarde: 15, noite: 15 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.school_id) return;
    (async () => {
      const { data } = await supabase.from("roster_call_settings")
        .select("tolerance_manha,tolerance_tarde,tolerance_noite")
        .eq("school_id", profile.school_id).maybeSingle();
      if (data) setValues({ manha: data.tolerance_manha, tarde: data.tolerance_tarde, noite: data.tolerance_noite });
      setLoading(false);
    })();
  }, [profile?.school_id]);

  const save = async () => {
    if (!profile?.school_id) return;
    setSaving(true);
    const { error } = await supabase.from("roster_call_settings").upsert({
      school_id: profile.school_id,
      tolerance_manha: values.manha,
      tolerance_tarde: values.tarde,
      tolerance_noite: values.noite,
      updated_by: profile.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "school_id" });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Tolerância salva", description: "As novas tolerâncias passam a valer imediatamente." });
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-slate-900 leading-tight">Tolerância da chamada</h1>
          <p className="text-xs text-slate-500 leading-tight">Minutos antes de liberar Presente/Atrasado/Ausente</p>
        </div>
        <Clock className="h-5 w-5 text-slate-400" />
      </header>

      <main className="flex-1 px-4 py-5 max-w-xl mx-auto w-full space-y-4">
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 leading-relaxed">
          Após esse tempo do início do tempo de aula, o assistente poderá marcar a presença do professor. Antes disso, o status fica neutro.
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-10">Carregando...</div>
        ) : (
          SHIFTS.map(({ key, label, Icon, color }) => (
            <div key={key} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-r ${color} px-4 py-3 flex items-center gap-3`}>
                <Icon className="h-6 w-6 text-white" />
                <span className="text-white font-black tracking-wider">{label}</span>
              </div>
              <div className="p-4">
                <Stepper value={values[key]} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} />
              </div>
            </div>
          ))
        )}
      </main>

      <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 pt-3 pb-4">
        <button
          onClick={save}
          disabled={saving || loading}
          className="w-full h-14 rounded-xl bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-black text-base flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg"
        >
          <Save className="h-5 w-5" />
          {saving ? "Salvando..." : "Salvar tolerâncias"}
        </button>
      </footer>
    </div>
  );
}
