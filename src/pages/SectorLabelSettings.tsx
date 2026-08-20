import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, Monitor, Lightbulb, TreePine, Trophy, Settings2, AlertTriangle, BookOpen, FlaskConical, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSectorLabels } from "@/hooks/useSectorLabels";
import { toast } from "sonner";

const SECTORS = [
  { key: "informatica", icon: Monitor, defaultLabel: "Informática" },
  { key: "quadra", icon: Trophy, defaultLabel: "Quadra" },
  { key: "patio", icon: TreePine, defaultLabel: "Pátio" },
  { key: "projeto_vida", icon: Lightbulb, defaultLabel: "Projeto de Vida" },
  { key: "biblioteca", icon: BookOpen, defaultLabel: "Biblioteca" },
  { key: "lab_ciencias", icon: FlaskConical, defaultLabel: "Lab. de Ciências" },
  { key: "sala_professores", icon: Users, defaultLabel: "Sala dos Professores" },
];

export default function SectorLabelSettings() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { profile } = useAuth();
  const { getLabel, saveLabel, canEdit } = useSectorLabels();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changes, setChanges] = useState<{ from: string; to: string }[]>([]);

  useEffect(() => {
    const values: Record<string, string> = {};
    SECTORS.forEach((s) => {
      values[s.key] = getLabel(s.key);
    });
    setEditValues(values);
  }, [getLabel]);

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh" style={{ background: "hsl(220, 50%, 28%)" }}>
        <p className="text-white/60 text-sm">Acesso restrito a gestores.</p>
        <button onClick={goBack} className="mt-4 text-white/40 text-xs underline">Voltar</button>
      </div>
    );
  }

  const handlePreSave = () => {
    const pendingChanges: { from: string; to: string }[] = [];
    for (const s of SECTORS) {
      const currentLabel = getLabel(s.key);
      const newVal = editValues[s.key]?.trim() || s.defaultLabel;
      if (newVal !== currentLabel) {
        pendingChanges.push({ from: currentLabel, to: newVal });
      }
    }
    if (pendingChanges.length === 0) {
      toast.info("Nenhuma alteração detectada.");
      return;
    }
    setChanges(pendingChanges);
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirm(false);
    setSaving(true);
    try {
      for (const s of SECTORS) {
        const val = editValues[s.key]?.trim() || "";
        if (val === s.defaultLabel || val === "") {
          await saveLabel(s.key, "");
        } else {
          await saveLabel(s.key, val);
        }
      }
      toast.success("Nomes dos setores atualizados!");
      navigate(-1);
    } catch {
      toast.error("Erro ao salvar nomes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex flex-col h-dvh select-none overflow-hidden" style={{ background: "hsl(220, 50%, 28%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={goBack} className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold text-white tracking-tight flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-amber-300" />
            Renomear Setores
          </h1>
          <p className="text-white/40 text-xs">Personalize os nomes dos setores da sua escola</p>
        </div>
      </div>

      {/* Warning notice */}
      <div className="relative z-10 px-1 pb-3">
        <div className="rounded-2xl px-2 py-3 flex gap-2" style={{ background: "hsla(40, 80%, 50%, 0.15)", border: "1px solid hsla(40, 70%, 50%, 0.3)" }}>
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1 min-w-0">
            <p className="text-base font-bold text-amber-300">Atenção — Comunicação Importante</p>
            <p className="text-sm text-white/80 leading-relaxed text-justify hyphens-auto">
              A alteração de nome dos setores é permitida, porém é <span className="text-amber-300 font-semibold">fundamental</span> que
              você comunique previamente a todos os professores da sua escola sobre essa mudança, especialmente àqueles que já
              possuem agendamentos realizados. A mudança de nome pode causar confusão caso os professores não sejam informados.
            </p>
            <p className="text-sm text-white/70 leading-relaxed text-justify hyphens-auto">
              Recomendamos enviar um comunicado antes de aplicar as alterações, garantindo que todos estejam cientes dos novos nomes dos setores.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "hsla(220, 60%, 18%, 0.8)", border: "1px solid hsla(210, 50%, 40%, 0.2)" }}>
          <p className="text-[11px] text-white/40">Deixe em branco para usar o nome padrão</p>
          {SECTORS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="space-y-1">
                <label className="text-xs text-white/50 font-medium flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  {s.defaultLabel}
                </label>
                <input
                  type="text"
                  value={editValues[s.key] || ""}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  maxLength={30}
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all"
                  placeholder={s.defaultLabel}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="relative z-10 px-4 pb-4 pt-2">
        <button
          onClick={handlePreSave}
          disabled={saving}
          className="w-full py-4 rounded-2xl text-base font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all disabled:opacity-50 shadow-lg"
        >
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: "hsl(220, 55%, 16%)", border: "1px solid hsla(210, 50%, 40%, 0.3)" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">Confirmar Alteração</h3>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              Você está prestes a alterar o nome dos seguintes setores. Lembre-se de comunicar aos professores sobre essa mudança.
            </p>
            <div className="space-y-2">
              {changes.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm rounded-xl px-3 py-2" style={{ background: "hsla(220, 60%, 22%, 0.8)" }}>
                  <span className="text-white/50 line-through">{c.from}</span>
                  <span className="text-white/30">→</span>
                  <span className="text-amber-300 font-semibold">{c.to}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-300/80 font-medium">
              Deseja alterar {changes.length === 1 ? `o nome de "${changes[0].from}" para "${changes[0].to}"` : `os nomes de ${changes.length} setores`}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/70 hover:text-white transition-colors"
                style={{ background: "hsla(220, 50%, 25%, 0.8)", border: "1px solid hsla(210, 50%, 40%, 0.2)" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSave}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all shadow-lg"
              >
                Sim, Alterar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
