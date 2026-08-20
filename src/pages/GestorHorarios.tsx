import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Sun, Sunset, Moon, Wand2, Save, Minus, Calendar, Check, ChevronRight, ChevronLeft, Sliders, Bell, Volume2, Play, Square, Users, Lock, Unlock, Coffee, ScrollText, FileUp, Loader2 } from "lucide-react";
import { validateSchedulePeriods } from "@/lib/schedulePeriodsValidation";
import { readPeriodsFromPdf } from "@/lib/parseSchedulePdf";
import ImportTeacherRosterModal from "@/components/ImportTeacherRosterModal";
import silvoLongoAsset from "@/assets/sirens/silvo-longo.mp3.asset.json";
import silvoCurtoAsset from "@/assets/sirens/silvo-curto.mp3.asset.json";
import campainhaLongoAsset from "@/assets/sirens/campainha-longo.mp3.asset.json";
import campainhaCurtoAsset from "@/assets/sirens/campainha-curto.mp3.asset.json";

type SirenKind = "alarme" | "campainha";
type SirenSettings = {
  enabled: boolean;
  siren_kind: SirenKind;
  short_seconds: number;
  long_seconds: number;
};
// Mapeia cada tipo de sirene -> { curta, longa }. Duração vem do próprio arquivo.
const SIREN_SRC: Record<SirenKind, { short: string | null; long: string | null }> = {
  alarme: { short: silvoCurtoAsset.url, long: silvoLongoAsset.url },
  campainha: { short: campainhaCurtoAsset.url, long: campainhaLongoAsset.url },
};
const SIREN_LABEL: Record<SirenKind, string> = {
  alarme: "Alarme (contínuo)",
  campainha: "Campainha (badalo)",
};
function normalizeSirenKind(v: any): SirenKind {
  return v === "campainha" ? "campainha" : "alarme";
}


type Shift = "manha" | "tarde" | "noite";
const SHIFT_LABEL: Record<Shift, string> = { manha: "MANHÃ", tarde: "TARDE", noite: "NOITE" };
const SHIFT_ICON: Record<Shift, any> = { manha: Sun, tarde: Sunset, noite: Moon };

type SirenAt = "none" | "short" | "long";
type Period = {
  id?: string;
  shift: Shift;
  period_number: number;
  label: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  start_siren: SirenAt;
  end_siren: SirenAt;
  _delete?: boolean;
};


function toHM(t: string): string { return (t ?? "").slice(0, 5); }
function toHMS(t: string): string { return t.length === 5 ? `${t}:00` : t; }
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(":").map(Number);
  const total = Math.max(0, h * 60 + m + mins);
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function diffMin(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

// Botão +/- compacto para minutos
function Stepper({ value, onChange, step = 5 }: { value: string; onChange: (v: string) => void; step?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(addMinutes(value, -step))}
        className="h-12 w-10 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center shrink-0"
        aria-label={`Diminuir ${step} min`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-12 px-1 rounded-lg border border-slate-300 text-lg font-mono font-bold text-center bg-white min-w-0 tracking-wider"
      />
      <button
        type="button"
        onClick={() => onChange(addMinutes(value, step))}
        className="h-12 w-10 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center shrink-0"
        aria-label={`Aumentar ${step} min`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function GestorHorarios() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Shift>("manha");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modo "Tempo reduzido do dia"
  const [reducedMode, setReducedMode] = useState(false);
  const [reducedDate, setReducedDate] = useState<string>(todayISO());
  const [reduced, setReduced] = useState<Period[]>([]);

  // Recalcular bulk
  const [bulkStart, setBulkStart] = useState("07:00");
  const [bulkDuration, setBulkDuration] = useState(30);
  const [bulkGap, setBulkGap] = useState(0);

  // ===== Sirene da escola =====
  const [siren, setSiren] = useState<SirenSettings>({
    enabled: false, siren_kind: "alarme", short_seconds: 4, long_seconds: 12,
  });
  const [sirenSaving, setSirenSaving] = useState(false);
  const [sirenPlaying, setSirenPlaying] = useState<null | "short" | "long">(null);
  const [sirenLocked, setSirenLocked] = useState(true);
  // Intervalo (recreio) por turno: após qual número de tempo entra o intervalo. 0 = sem intervalo.
  const [breakAfter, setBreakAfter] = useState<Record<Shift, number>>({ manha: 0, tarde: 0, noite: 0 });
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioTimerRef = useRef<any>(null);
  const audioRef = useMemo(() => ({
    get current() { return audioElRef.current; },
    set current(v: HTMLAudioElement | null) { audioElRef.current = v; },
    get timer() { return audioTimerRef.current; },
    set timer(v: any) { audioTimerRef.current = v; },
  }), []);

  const stopSiren = useCallback(() => {
    if (audioRef.timer) { clearTimeout(audioRef.timer); audioRef.timer = null; }
    if (audioRef.current) {
      try {
        const a = audioRef.current;
        const start = Date.now();
        const startVol = a.volume;
        const fade = setInterval(() => {
          const t = (Date.now() - start) / 600;
          if (t >= 1) { clearInterval(fade); a.pause(); a.currentTime = 0; a.volume = startVol; }
          else a.volume = Math.max(0, startVol * (1 - t));
        }, 40);
      } catch { /* ignore */ }
    }
    setSirenPlaying(null);
  }, [audioRef]);

  const playSiren = useCallback((mode: "short" | "long") => {
    const src = SIREN_SRC[siren.siren_kind]?.[mode];
    if (!src) {
      toast({ title: "Sem áudio cadastrado", description: "Envie o arquivo de áudio para este tipo de sirene.", variant: "destructive" });
      return;
    }
    if (audioRef.timer) clearTimeout(audioRef.timer);
    if (!audioRef.current) audioRef.current = new Audio(src);
    const a = audioRef.current;
    a.src = src;
    a.loop = false;
    a.currentTime = 0;
    a.volume = 1;
    setSirenPlaying(mode);
    a.onended = () => setSirenPlaying(null);
    a.play().catch(() => toast({ title: "Não foi possível tocar o áudio", variant: "destructive" }));
  }, [siren, audioRef]);

  // Carrega config da sirene e do intervalo
  useEffect(() => {
    if (!profile?.school_id) return;
    (async () => {
      const { data } = await supabase.from("school_siren_settings").select("*").eq("school_id", profile.school_id).maybeSingle();
      if (data) setSiren({
        enabled: data.enabled, siren_kind: normalizeSirenKind(data.siren_kind),
        short_seconds: data.short_seconds, long_seconds: data.long_seconds,
      });
      const { data: ps } = await supabase.from("panel_settings").select("break_after_periods").eq("school_id", profile.school_id).maybeSingle();
      const bap = (ps as any)?.break_after_periods ?? {};
      setBreakAfter({
        manha: Number(bap.manha ?? 0) || 0,
        tarde: Number(bap.tarde ?? 0) || 0,
        noite: Number(bap.noite ?? 0) || 0,
      });
    })();
    return () => stopSiren();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  const saveSiren = async () => {
    if (!profile?.school_id) return;
    setSirenSaving(true);
    const { error } = await supabase.from("school_siren_settings").upsert({
      school_id: profile.school_id,
      enabled: siren.enabled,
      siren_kind: siren.siren_kind,
      short_seconds: siren.short_seconds,
      long_seconds: siren.long_seconds,
      updated_by: profile.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "school_id" });
    // Salva também o mapa do intervalo por turno em panel_settings
    const { error: errPs } = await supabase.from("panel_settings").upsert({
      school_id: profile.school_id,
      break_after_periods: breakAfter as any,
      updated_by: profile.user_id,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "school_id" });
    setSirenSaving(false);
    if (error || errPs) toast({ title: "Erro ao salvar sirene", description: (error || errPs)?.message, variant: "destructive" });
    else {
      // Registro imutável da alteração
      await supabase.from("schedule_change_logs").insert({
        school_id: profile.school_id,
        actor_user_id: profile.user_id,
        actor_name: profile.full_name || "—",
        actor_role: profile.role || "—",
        change_type: "siren",
        summary: `Sirene ${siren.enabled ? "ATIVADA" : "DESATIVADA"} (${siren.siren_kind === "campainha" ? "Campainha" : "Alarme"}) · intervalos: M=${breakAfter.manha || 0}, T=${breakAfter.tarde || 0}, N=${breakAfter.noite || 0}`,
        details: { siren, break_after: breakAfter },
      });
      toast({ title: "Sirene salva" });
    }
  };

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const { data } = await supabase
      .from("schedule_periods")
      .select("*")
      .eq("school_id", profile.school_id)
      .order("shift").order("period_number");
    setPeriods((data ?? []).map((p: any) => ({
      id: p.id,
      shift: p.shift as Shift,
      period_number: p.period_number,
      label: p.label,
      start_time: toHM(p.start_time),
      end_time: toHM(p.end_time),
      start_siren: (p.start_siren ?? "short") as SirenAt,
      end_siren: (p.end_siren ?? "short") as SirenAt,
    })));

    setLoading(false);
  }, [profile?.school_id]);

  useEffect(() => { load(); }, [load]);

  // Quando entrar em modo reduzido ou trocar de data, carregar overrides
  useEffect(() => {
    if (!reducedMode || !profile?.school_id) return;
    (async () => {
      const { data } = await supabase
        .from("schedule_reduced_days")
        .select("*")
        .eq("school_id", profile.school_id)
        .eq("reduced_date", reducedDate)
        .order("shift").order("period_number");
      if (data && data.length > 0) {
        setReduced(data.map((p: any) => ({
          id: p.id,
          shift: p.shift as Shift,
          period_number: p.period_number,
          label: p.label,
          start_time: toHM(p.start_time),
          end_time: toHM(p.end_time),
          start_siren: (p.start_siren ?? "short") as SirenAt,
          end_siren: (p.end_siren ?? "short") as SirenAt,
        })));
      } else {
        // Pré-popular com o quadro mestre como ponto de partida
        setReduced(periods.filter((p) => !p._delete).map((p) => ({
          shift: p.shift, period_number: p.period_number, label: p.label,
          start_time: p.start_time, end_time: p.end_time,
          start_siren: p.start_siren, end_siren: p.end_siren,
        })));
      }

    })();
  }, [reducedMode, reducedDate, profile?.school_id, periods]);

  const activeList = reducedMode ? reduced : periods;
  const setActiveList = reducedMode ? setReduced : setPeriods;

  const list = useMemo(
    () => activeList
      .filter((p) => p.shift === tab && !p._delete)
      .sort((a, b) => a.period_number - b.period_number),
    [activeList, tab],
  );

  const update = (idx: number, patch: Partial<Period>) => {
    setActiveList((prev) => {
      const next = [...prev];
      const real = prev.indexOf(list[idx]);
      next[real] = { ...next[real], ...patch };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setActiveList((prev) => {
      const next = [...prev];
      const real = prev.indexOf(list[idx]);
      if (next[real].id) next[real] = { ...next[real], _delete: true };
      else next.splice(real, 1);
      return next;
    });
  };

  const addRow = () => {
    const last = list[list.length - 1];
    const n = (last?.period_number ?? 0) + 1;
    const start = last?.end_time ?? (tab === "manha" ? "07:00" : tab === "tarde" ? "13:00" : "19:00");
    setActiveList((p) => [...p, {
      shift: tab,
      period_number: n,
      label: `${n}º Tempo`,
      start_time: start,
      end_time: addMinutes(start, 50),
      start_siren: "short" as SirenAt,
      end_siren: "short" as SirenAt,
    }]);
  };


  // Recalcular todos os tempos do turno ativo
  const applyBulk = () => {
    if (list.length === 0) {
      toast({ title: "Adicione tempos primeiro", variant: "destructive" });
      return;
    }
    let cursor = bulkStart;
    setActiveList((prev) => {
      const next = [...prev];
      list.forEach((p) => {
        const real = next.indexOf(p);
        const start = cursor;
        const end = addMinutes(start, bulkDuration);
        next[real] = { ...next[real], start_time: start, end_time: end };
        cursor = addMinutes(end, bulkGap);
      });
      return next;
    });
    toast({ title: `Tempos do turno ${SHIFT_LABEL[tab]} recalculados` });
  };

  // ===== Importar quadro de professores (todos de uma vez) =====
  const [rosterOpen, setRosterOpen] = useState(false);

  // ===== Importar tabela de horários em PDF (o arquivo não é armazenado) =====
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);

  const handlePdfImport = async (file: File) => {
    setPdfImporting(true);
    try {
      const found = await readPeriodsFromPdf(file, tab);
      if (found.length === 0) {
        toast({
          title: "Nenhum tempo encontrado no PDF",
          description: "O PDF precisa ter os horários em texto (ex.: 1º Tempo 07:00 às 07:50).",
          variant: "destructive",
        });
        return;
      }
      setActiveList((prev) => {
        // Marca para exclusão os tempos existentes do turno e insere os do PDF
        const kept = prev
          .filter((p) => p.shift !== tab)
          .concat(prev.filter((p) => p.shift === tab && p.id).map((p) => ({ ...p, _delete: true })));
        return [
          ...kept,
          ...found.map((f) => ({
            shift: f.shift as Shift,
            period_number: f.period_number,
            label: f.label,
            start_time: f.start_time,
            end_time: f.end_time,
            start_siren: "short" as SirenAt,
            end_siren: "short" as SirenAt,
          })),
        ];
      });
      toast({
        title: `${found.length} tempo(s) lidos do PDF`,
        description: `Turno ${SHIFT_LABEL[tab]}. Revise e toque em Salvar. O PDF não é guardado.`,
      });
    } catch (e: any) {
      toast({ title: "Não foi possível ler o PDF", description: e?.message, variant: "destructive" });
    } finally {
      setPdfImporting(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  // Registra alteração imutável (gestor/coord) — não pode ser apagado
  const logChange = useCallback(async (entry: {
    change_type: "periods" | "reduced_day" | "siren" | "break_after";
    shift?: Shift | null;
    reduced_date?: string | null;
    summary: string;
    details?: any;
  }) => {
    if (!profile?.school_id || !profile?.user_id) return;
    await supabase.from("schedule_change_logs").insert({
      school_id: profile.school_id,
      actor_user_id: profile.user_id,
      actor_name: profile.full_name || "—",
      actor_role: profile.role || "—",
      change_type: entry.change_type,
      shift: entry.shift ?? null,
      reduced_date: entry.reduced_date ?? null,
      summary: entry.summary,
      details: entry.details ?? {},
    });
  }, [profile?.school_id, profile?.user_id, profile?.full_name, profile?.role]);

  const save = async () => {
    if (!profile?.school_id) return;

    // Validação antes de salvar (formato, ordem, duplicidade, sobreposição)
    const rowsToValidate = reducedMode
      ? reduced.filter((p) => p.shift === tab)
      : periods;
    const validationError = validateSchedulePeriods(rowsToValidate);
    if (validationError) {
      toast({ title: "Verifique os horários", description: validationError, variant: "destructive" });
      return;
    }

    setSaving(true);



    if (reducedMode) {
      // Apaga o que existia para este dia (somente do turno editado) e regrava
      const { error: delErr } = await supabase
        .from("schedule_reduced_days")
        .delete()
        .eq("school_id", profile.school_id)
        .eq("reduced_date", reducedDate)
        .eq("shift", tab);
      if (delErr) { setSaving(false); toast({ title: "Erro ao limpar", description: delErr.message, variant: "destructive" }); return; }

      const rows = reduced
        .filter((p) => !p._delete && p.shift === tab)
        .map((p) => ({
          school_id: profile.school_id,
          reduced_date: reducedDate,
          shift: p.shift,
          period_number: p.period_number,
          label: p.label || `${p.period_number}º Tempo`,
          start_time: toHMS(p.start_time),
          end_time: toHMS(p.end_time),
          start_siren: p.start_siren,
          end_siren: p.end_siren,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from("schedule_reduced_days").insert(rows);
        if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      }
      await logChange({
        change_type: "reduced_day",
        shift: tab,
        reduced_date: reducedDate,
        summary: rows.length > 0
          ? `Tempo reduzido configurado em ${SHIFT_LABEL[tab]} (${rows.length} tempo(s)) para ${reducedDate.split("-").reverse().join("/")}`
          : `Tempo reduzido removido em ${SHIFT_LABEL[tab]} para ${reducedDate.split("-").reverse().join("/")}`,
        details: { periods: rows.map((r) => ({ n: r.period_number, label: r.label, start: r.start_time, end: r.end_time })) },
      });
      setSaving(false);
      toast({ title: `Tempo reduzido salvo para ${reducedDate}` });
      return;
    }

    // Snapshot ANTES de salvar para gerar diff descritivo no registro
    const { data: beforeRows } = await supabase
      .from("schedule_periods")
      .select("shift,period_number,label,start_time,end_time")
      .eq("school_id", profile.school_id)
      .eq("shift", tab);
    const beforeMap = new Map<number, any>((beforeRows || []).map((r: any) => [r.period_number, r]));

    const toUpsert = periods.filter((p) => !p._delete).map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      school_id: profile.school_id,
      shift: p.shift,
      period_number: p.period_number,
      label: p.label || `${p.period_number}º Tempo`,
      start_time: toHMS(p.start_time),
      end_time: toHMS(p.end_time),
      start_siren: p.start_siren,
      end_siren: p.end_siren,
    }));

    const toDelete = periods.filter((p) => p._delete && p.id).map((p) => p.id!);
    if (toDelete.length > 0) {
      const { error } = await supabase.from("schedule_periods").delete().in("id", toDelete);
      if (error) { setSaving(false); toast({ title: "Erro ao remover", description: error.message, variant: "destructive" }); return; }
    }
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("schedule_periods")
        .upsert(toUpsert, { onConflict: "school_id,shift,period_number" });
      if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    }

    // Monta lista de mudanças linha-a-linha (ex: "1º 07:00→07:20")
    const hhmm = (t: string) => (t || "").slice(0, 5);
    const changeLines: string[] = [];
    let totalBeforeMin = 0;
    let totalAfterMin = 0;
    const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":"); return Number(h) * 60 + Number(m); };
    toUpsert.filter((r) => r.shift === tab).forEach((r) => {
      const before = beforeMap.get(r.period_number);
      const afterDur = toMin(r.end_time) - toMin(r.start_time);
      totalAfterMin += Math.max(0, afterDur);
      if (!before) {
        changeLines.push(`${r.period_number}º NOVO ${hhmm(r.start_time)}–${hhmm(r.end_time)}`);
        return;
      }
      const beforeDur = toMin(before.end_time) - toMin(before.start_time);
      totalBeforeMin += Math.max(0, beforeDur);
      const startChanged = hhmm(before.start_time) !== hhmm(r.start_time);
      const endChanged = hhmm(before.end_time) !== hhmm(r.end_time);
      if (startChanged || endChanged) {
        changeLines.push(`${r.period_number}º ${hhmm(before.start_time)}–${hhmm(before.end_time)} → ${hhmm(r.start_time)}–${hhmm(r.end_time)}`);
      }
    });
    // Tempos removidos (estavam antes e não estão mais)
    const upsertNums = new Set(toUpsert.filter((r) => r.shift === tab).map((r) => r.period_number));
    (beforeRows || []).filter((b: any) => !upsertNums.has(b.period_number)).forEach((b: any) => {
      changeLines.push(`${b.period_number}º REMOVIDO (${hhmm(b.start_time)}–${hhmm(b.end_time)})`);
      totalBeforeMin += Math.max(0, toMin(b.end_time) - toMin(b.start_time));
    });

    let action = "ajustou";
    if (totalAfterMin && totalBeforeMin && totalAfterMin < totalBeforeMin - 1) action = "reduziu";
    else if (totalAfterMin && totalBeforeMin && totalAfterMin > totalBeforeMin + 1) action = "ampliou";

    const summary = changeLines.length === 0
      ? `Quadro padrão de ${SHIFT_LABEL[tab]} salvo sem mudanças nos horários.`
      : `${action.toUpperCase()} os tempos de ${SHIFT_LABEL[tab]}: ${changeLines.join(" · ")}`;

    await logChange({
      change_type: "periods",
      shift: tab,
      summary,
      details: {
        action,
        changes: changeLines,
        total_before_min: totalBeforeMin,
        total_after_min: totalAfterMin,
        periods: toUpsert.map((r) => ({ shift: r.shift, n: r.period_number, label: r.label, start: r.start_time, end: r.end_time })),
        deleted_ids: toDelete,
      },
    });
    setSaving(false);
    toast({ title: "Horários salvos" });
    await load();
  };

  // ===== Fluxo em 3 passos: 1) Dia  2) Tempos  3) Salvar =====
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bulkOpen, setBulkOpen] = useState(false);

  const formatBR = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const StepDot = ({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) => (
    <div className="flex-1 flex items-center gap-1.5 min-w-0">
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
        done ? "bg-emerald-500 text-white" : active ? "bg-white text-[#0A2A66]" : "bg-white/15 text-white/70"
      }`}>
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </div>
      <span className={`text-[11px] font-black truncate ${active ? "text-white" : "text-white/60"}`}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#1E4DB7] via-[#1740a0] to-[#0A2A66] text-slate-900 pb-28">

      <header className="bg-gradient-to-br from-[#081F4D] via-[#103A8A] to-[#0A2A66] text-white px-4 pt-[60px] pb-4 sticky top-0 z-30 shadow-lg shadow-blue-900/30">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 pr-24">
            <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold leading-none">Coordenação / Gestão</p>
            <p className="font-black text-base break-words leading-tight">Horários dos tempos</p>
            {profile?.full_name && (
              <p className="text-[11px] font-bold text-white/85 break-words leading-tight mt-1">
                {profile.full_name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate("/gestor/registro-horarios")}
            className="shrink-0 h-9 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
            title="Histórico permanente de alterações"
          >
            <ScrollText className="h-3.5 w-3.5" />
            Registro
          </button>
        </div>
        {/* Stepper */}
        <div className="mt-2.5 flex items-center gap-2">
          <StepDot n={1} label="Dia" active={step === 1} done={step > 1} />
          <ChevronRight className="h-4 w-4 text-white/30 shrink-0" />
          <StepDot n={2} label="Tempos" active={step === 2} done={step > 2} />
          <ChevronRight className="h-4 w-4 text-white/30 shrink-0" />
          <StepDot n={3} label="Salvar" active={step === 3} done={false} />
        </div>
      </header>

      {/* ============ PASSO 1: Escolher o dia ============ */}
      {step === 1 && (
        <section className="px-4 pt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => navigate("/assistente/quadro")}
              className="h-14 px-2 rounded-2xl bg-gradient-to-br from-[#123f96] to-[#0A2A66] border-2 border-[#1E4FB8]/70 hover:border-blue-300 active:scale-[0.98] transition flex flex-col items-center justify-center gap-0.5 text-[11px] font-black text-white shadow-md shadow-blue-900/30 leading-tight text-center"
              title="Cadastrar professores, disciplina, turno e horário"
            >
              <Users className="h-4 w-4" />
              Professores
            </button>
            <button
              onClick={() => navigate("/gestor/atribuir-turmas")}
              className="h-14 px-2 rounded-2xl bg-gradient-to-br from-[#123f96] to-[#0A2A66] border-2 border-[#1E4FB8]/70 hover:border-blue-300 active:scale-[0.98] transition flex flex-col items-center justify-center gap-0.5 text-[11px] font-black text-white shadow-md shadow-blue-900/30 leading-tight text-center"
              title="Atribuir turmas aos assistentes de aluno"
            >
              <Users className="h-4 w-4" />
              Assistente<br/>de aluno
            </button>
            <button
              onClick={() => navigate("/gestor/tolerancia-chamada")}
              className="h-14 px-2 rounded-2xl bg-gradient-to-br from-[#123f96] to-[#0A2A66] border-2 border-[#1E4FB8]/70 hover:border-blue-300 active:scale-[0.98] transition flex flex-col items-center justify-center gap-0.5 text-[11px] font-black text-white shadow-md shadow-blue-900/30 leading-tight text-center"
              title="Tolerância da chamada por turno"
            >
              <Sliders className="h-4 w-4" />
              Tolerância
            </button>
          </div>

          <div>

            <p className="text-[11px] font-black text-white/70 uppercase tracking-wider mb-2">1. O que você quer editar?</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setReducedMode(false)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition flex items-center gap-3 ${
                  !reducedMode
                    ? "border-blue-300 bg-gradient-to-br from-[#103A8A] via-[#1E4FB8] to-[#0A2A66] text-white ring-2 ring-blue-300 shadow-[0_0_16px_3px_rgba(96,165,250,0.85)]"
                    : "border-[#1E4FB8]/60 bg-gradient-to-br from-[#123f96] to-[#0A2A66] shadow-md shadow-blue-900/30"
                }`}
              >
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                  !reducedMode ? "bg-white/15 text-white" : "bg-white/10 text-white/80"
                }`}>
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm text-white">Quadro padrão</p>
                  <p className={`text-[11px] leading-snug ${!reducedMode ? "text-white/75" : "text-white/60"}`}>Horário normal usado todos os dias.</p>
                </div>
                {!reducedMode && <Check className="h-5 w-5 text-white shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => setReducedMode(true)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition flex items-center gap-3 ${
                  reducedMode
                    ? "border-amber-300 bg-gradient-to-br from-amber-500 via-amber-400 to-amber-600 ring-2 ring-amber-300 shadow-[0_0_16px_3px_rgba(251,191,36,0.85)]"
                    : "border-[#1E4FB8]/60 bg-gradient-to-br from-[#123f96] to-[#0A2A66] shadow-md shadow-blue-900/30"
                }`}
              >
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                  reducedMode ? "bg-amber-950/20 text-white shadow-md" : "bg-white/10 text-white/80"
                }`}>
                  <Wand2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-sm ${reducedMode ? "text-amber-950" : "text-white"}`}>Tempo reduzido do dia</p>
                  <p className={`text-[11px] leading-snug ${reducedMode ? "text-amber-950/75" : "text-white/60"}`}>Vale só para 1 data, sem alterar o padrão.</p>
                </div>
                {reducedMode && <Check className="h-5 w-5 text-amber-950 shrink-0" />}
              </button>

            </div>
          </div>

          {reducedMode && (
            <div className="-mx-4 px-4 py-3 bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50 border-y-2 border-amber-300">
              <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider mb-2">📅 Data do tempo reduzido</p>
              <input
                type="date"
                value={reducedDate}
                onChange={(e) => setReducedDate(e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-amber-500 bg-white text-base font-mono font-black text-amber-950 shadow-sm"
              />
              <p className="text-[10px] text-amber-900/80 mt-1.5 leading-snug">
                ⚠️ Vale só nessa data. Nos outros dias o quadro padrão volta automaticamente.
              </p>
            </div>
          )}


          <div>
            <p className="text-[11px] font-black text-white/70 uppercase tracking-wider mb-2">Turno</p>
            <div className="grid grid-cols-3 gap-2">
              {(["manha","tarde","noite"] as Shift[]).map((s) => {
                const Icon = SHIFT_ICON[s];
                const active = tab === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTab(s)}
                    className={`h-20 w-full rounded-2xl font-black text-base flex flex-col items-center justify-center gap-1 transition border-2 ${
                      active
                        ? "bg-gradient-to-br from-[#103A8A] via-[#1E4FB8] to-[#0A2A66] text-white border-blue-300 ring-2 ring-blue-300 shadow-[0_0_16px_3px_rgba(96,165,250,0.85)]"
                        : "bg-gradient-to-br from-[#123f96] to-[#0A2A66] text-white/70 border-[#1E4FB8]/60 shadow-md shadow-blue-900/30"
                    }`}
                  >
                    <Icon className="h-7 w-7" />
                    {SHIFT_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ============ Sirene da escola ============ */}
          <div className={`-mx-2 rounded-2xl border-2 border-blue-900/40 bg-gradient-to-br from-[#1E4DB7] via-[#143b8a] to-[#0A2A66] p-2 space-y-3 shadow-lg ${sirenLocked ? "ring-1 ring-amber-300" : ""}`}>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-white/15 text-white flex items-center justify-center">
                <Bell className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-lg text-white">Sirene da escola</p>
                <p className="text-base text-white/75 leading-snug">Toca automaticamente nos horários marcados abaixo.</p>
              </div>
              <button
                type="button"
                onClick={() => { if (sirenLocked) { toast({ title: "Travado", description: "Toque em \"Travado — toque para editar\" para destravar." }); return; } setSiren((s) => ({ ...s, enabled: !s.enabled })); }}
                className={`relative h-7 w-12 rounded-full transition shrink-0 ${siren.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                aria-label="Ativar sirene"
              >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${siren.enabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>

            {/* Seletor do tipo de sirene */}
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-white/85 mb-1.5">Tipo de sirene da escola</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(SIREN_SRC) as SirenKind[]).map((k) => {
                  const active = siren.siren_kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { if (sirenLocked) { toast({ title: "Travado", description: "Toque em \"Travado — toque para editar\" para destravar." }); return; } setSiren((s) => ({ ...s, siren_kind: k })); }}
                      className={`h-14 w-full px-2 rounded-xl text-sm font-black border-2 flex items-center justify-center text-center leading-tight shadow-sm transition ${
                        active
                          ? "bg-gradient-to-br from-[#103A8A] via-[#1E4FB8] to-[#0A2A66] text-white border-[#103A8A] shadow-blue-900/30 ring-2 ring-blue-300 shadow-[0_0_14px_2px_rgba(96,165,250,0.75)]"
                          : "bg-gradient-to-br from-[#123f96] to-[#0A2A66] text-white/70 border-[#1E4FB8]/60"
                      }`}
                    >
                      {SIREN_LABEL[k]}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-white/70 mt-1">Escolha o som que mais se parece com a sirene física da escola. Depois ajuste curta e longa abaixo.</p>
            </div>



            {/* Botão travar para evitar toque acidental */}
            <button
              type="button"
              onClick={() => setSirenLocked((v) => !v)}
              className={`w-full h-10 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border-2 ${
                sirenLocked
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-emerald-50 border-emerald-300 text-emerald-800"
              }`}
            >
              {sirenLocked ? <><Lock className="h-4 w-4" /> Travado — toque para editar</> : <><Unlock className="h-4 w-4" /> Destravado — toque para travar</>}
            </button>

            {/* Testar os 2 áudios */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => sirenPlaying === "short" ? stopSiren() : playSiren("short")}
                className={`h-11 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 ${sirenPlaying === "short" ? "bg-red-500 text-white" : "bg-emerald-600 text-white"}`}
              >
                {sirenPlaying === "short" ? <><Square className="h-4 w-4" /> Parar</> : <><Play className="h-4 w-4" /> Ouvir curta</>}
              </button>
              <button
                type="button"
                onClick={() => sirenPlaying === "long" ? stopSiren() : playSiren("long")}
                className={`h-11 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 ${sirenPlaying === "long" ? "bg-red-500 text-white" : "bg-[#0A2A66] text-white"}`}
              >
                {sirenPlaying === "long" ? <><Square className="h-4 w-4" /> Parar</> : <><Volume2 className="h-4 w-4" /> Ouvir longa</>}
              </button>
            </div>

            {/* Seletor de momento do intervalo */}
            {list.length > 1 && (
              <div className="-mx-2 rounded-xl border-y-2 border-amber-300 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 px-3 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Coffee className="h-4 w-4 text-amber-700" />
                  <span className="text-sm font-black uppercase tracking-wider text-amber-900">Intervalo</span>
                  <span className="text-sm font-bold text-amber-700/80 normal-case tracking-normal">após o…</span>
                </div>
                <div className="flex items-stretch gap-1.5">
                  <button
                    type="button"
                    onClick={() => { if (sirenLocked) { toast({ title: "Travado", description: "Toque em \"Travado — toque para editar\" para destravar." }); return; } setBreakAfter((b) => ({ ...b, [tab]: 0 })); }}
                    className={`h-10 px-2 rounded-lg text-[11px] font-black uppercase shrink-0 transition ${breakAfter[tab] === 0 ? "bg-gradient-to-br from-[#1E4FB8] to-[#0A2A66] text-white shadow ring-2 ring-blue-300 shadow-[0_0_10px_2px_rgba(96,165,250,0.7)]" : "bg-gradient-to-br from-[#123f96] to-[#0A2A66] text-white/70 border border-[#1E4FB8]/60"}`}
                  >
                    Sem
                  </button>
                  <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${(tab === "noite" ? list.slice(0,-1) : list).length}, minmax(0, 1fr))` }}>
                    {(tab === "noite" ? list.slice(0, -1) : list).map((p) => (
                      <button
                        key={p.period_number}
                        type="button"
                        onClick={() => { if (sirenLocked) { toast({ title: "Travado", description: "Toque em \"Travado — toque para editar\" para destravar." }); return; } setBreakAfter((b) => ({ ...b, [tab]: p.period_number })); }}
                        className={`h-10 px-1 rounded-lg text-sm font-black transition ${breakAfter[tab] === p.period_number ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow ring-2 ring-amber-300 shadow-[0_0_10px_2px_rgba(251,191,36,0.7)]" : "bg-gradient-to-br from-[#123f96] to-[#0A2A66] text-white/70 border border-[#1E4FB8]/60"}`}
                      >
                        {p.period_number}º
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tabela dos horários para escolher a sirene */}
            <div className="-mx-2 rounded-xl border-y border-blue-900/40 overflow-hidden bg-gradient-to-b from-[#143b8a] to-[#0A2A66]">
              <div className="bg-gradient-to-r from-[#0A2A66] via-[#1E4FB8] to-[#103A8A] px-3 py-2.5">
                <div className="text-base font-black text-white uppercase tracking-wider leading-tight">
                  Sirenes do turno {SHIFT_LABEL[tab]}
                </div>
                <div className="text-xs font-bold text-white/75 mt-0.5">
                  Início e fim de cada tempo
                </div>
              </div>
              {list.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-slate-400">
                  Cadastre os tempos do turno no passo 2 para configurar a sirene.
                </p>
              ) : (() => {
                const toMin = (t: string) => { const [h,m] = t.split(":"); return Number(h)*60+Number(m); };
                const afterN = breakAfter[tab] ?? 0;
                const breakIdx = afterN > 0
                  ? list.findIndex((p, i) => i > 0 && list[i-1].period_number === afterN)
                  : -1;
                const breakSize = breakIdx > 0
                  ? toMin(list[breakIdx].start_time) - toMin(list[breakIdx-1].end_time)
                  : 0;
                const rows: Array<
                  | { type: "siren"; kind: "start" | "end"; label: string; time: string; value: SirenAt; idx: number; periodN: number }
                  | { type: "break"; start: string; end: string }
                > = [];
                list.forEach((p, i) => {
                  if (i === breakIdx) {
                    rows.push({ type: "break", start: list[i-1].end_time, end: p.start_time });
                  }
                  rows.push({ type: "siren", kind: "start", label: `Início do ${p.period_number}º tempo`, time: p.start_time, value: p.start_siren, idx: i, periodN: p.period_number });
                  rows.push({ type: "siren", kind: "end", label: `Fim do ${p.period_number}º tempo`, time: p.end_time, value: p.end_siren, idx: i, periodN: p.period_number });
                });
                return (
                  <div>
                    {rows.map((row, k) => {
                      if (row.type === "break") {
                        return (
                          <div key={k} className="flex items-center gap-2 px-2.5 py-2 bg-amber-50 border-t border-b border-amber-200">
                            <Coffee className="h-4 w-4 text-amber-700 shrink-0" />
                            <span className="font-mono font-black text-base text-amber-900 shrink-0">{row.start}–{row.end}</span>
                            <span className="flex-1 min-w-0 text-sm font-black uppercase tracking-wider text-amber-800">Intervalo</span>
                            <span className="text-sm font-bold text-amber-700">{breakSize} min</span>
                          </div>
                        );
                      }
                      // Cor alternada por tempo: azul mais forte vs azul mais escuro
                      const bg = row.periodN % 2 === 1 ? "bg-[#1E4DB7]/85" : "bg-[#0A2A66]/85";
                      // Linha bem fininha entre início e fim do mesmo tempo
                      const innerDivider = row.kind === "end" ? "border-t border-white/10" : "";
                      return (
                        <div key={k} className={`flex items-center gap-1.5 px-2 py-2 ${bg} ${innerDivider}`}>
                          <span className="font-mono font-black text-base text-white shrink-0 pl-0.5">{row.time}</span>
                          <span className="flex-1 min-w-0 text-sm font-bold text-white/90 text-center px-1">{row.label}</span>
                          <div className="flex gap-1 shrink-0 pr-0.5">
                            {(["short","long","none"] as SirenAt[]).map((k2) => (
                              <button
                                key={k2}
                                type="button"
                                onClick={() => { if (sirenLocked) { toast({ title: "Travado", description: "Toque em \"Travado — toque para editar\" para destravar." }); return; } update(row.idx, row.kind === "start" ? { start_siren: k2 } : { end_siren: k2 }); }}
                                className={`h-9 px-2.5 rounded-md text-[11px] font-black uppercase transition ${
                                  row.value === k2
                                    ? "bg-blue-400 text-white border border-blue-300 ring-2 ring-blue-300/80 shadow-[0_0_12px_2px_rgba(96,165,250,0.8)]"
                                    : "bg-white/10 text-white/80 border border-white/20"
                                }`}
                              >
                                {k2 === "short" ? "Curta" : k2 === "long" ? "Longa" : "—"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <p className="text-[10px] text-white/85 leading-snug bg-gradient-to-r from-[#0A2A66] via-[#143b8a] to-[#0A2A66] px-3 py-2 border-t border-white/10">
                💡 Use <strong>Longa</strong> para início do 1º tempo, início/fim do intervalo e fim do último tempo. <strong>Curta</strong> para os demais. <strong>—</strong> não toca.
              </p>
            </div>


            <button
              type="button"
              onClick={async () => { await save(); await saveSiren(); setSirenLocked(true); }}
              disabled={sirenSaving || saving || sirenLocked}
              className="w-full h-11 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {(sirenSaving || saving) ? "Salvando..." : sirenLocked ? "Destrave para editar" : "Salvar sirene"}
            </button>
          </div>

        </section>
      )}


      {/* ============ PASSO 2: Ajustar tempos ============ */}
      {step === 2 && (
        <section className="px-2 pt-4 space-y-2">
          {/* Resumo do contexto */}
          <div className="rounded-xl bg-slate-100 px-3 py-2 flex items-center gap-2 text-[11px] font-bold text-slate-700">
            <span className={`px-2 py-0.5 rounded-md font-black ${reducedMode ? "bg-amber-400 text-amber-950" : "bg-[#0A2A66] text-white"}`}>
              {reducedMode ? `REDUZIDO ${formatBR(reducedDate)}` : "PADRÃO"}
            </span>
            <span>•</span>
            <span>{SHIFT_LABEL[tab]}</span>
            <button type="button" onClick={() => setStep(1)} className="ml-auto text-[#0A2A66] font-black underline">trocar</button>
          </div>

          {/* Importar tabela de horários em PDF (leitura apenas — nada é armazenado) */}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePdfImport(f);
            }}
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={pdfImporting}
            className="w-full h-12 rounded-xl bg-gradient-to-br from-[#103A8A] via-[#1E4FB8] to-[#0A2A66] border-2 border-[#1E4FB8] text-white px-3 flex items-center gap-2 text-sm font-black shadow-lg shadow-blue-900/30 disabled:opacity-60"
          >
            {pdfImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            <span className="flex-1 text-left leading-tight">
              {pdfImporting ? "Lendo o PDF…" : "Anexar tabela de horários (PDF)"}
              <span className="block text-[10px] font-bold text-white/70">
                Lê os tempos do turno {SHIFT_LABEL[tab]} · o arquivo não é guardado
              </span>
            </span>
          </button>


          {/* Importar quadro de professores de uma vez (IA do app + leitura simples) */}
          <button
            type="button"
            onClick={() => setRosterOpen(true)}
            className="w-full h-12 rounded-xl bg-gradient-to-br from-[#B45309] via-[#F59E0B] to-[#B45309] border-2 border-amber-300 text-[#3B1D00] px-3 flex items-center gap-2 text-sm font-black shadow-lg shadow-amber-900/30"
          >
            <Users className="h-4 w-4" />
            <span className="flex-1 text-left leading-tight">
              Preencher horários dos professores de uma vez
              <span className="block text-[10px] font-bold text-[#3B1D00]/70">
                Anexe/cole o quadro · leitura pela IA do app · turno {SHIFT_LABEL[tab]}
              </span>
            </span>
          </button>

          {/* Recalcular bulk (colapsável) */}
          <button
            type="button"
            onClick={() => setBulkOpen((v) => !v)}
            className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 px-3 flex items-center gap-2 text-sm font-black text-slate-700"
          >
            <Sliders className="h-4 w-4" />
            <span className="flex-1 text-left">Recalcular todos de uma vez</span>
            <ChevronRight className={`h-4 w-4 transition ${bulkOpen ? "rotate-90" : ""}`} />
          </button>
          {bulkOpen && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                <label className="text-[10px] font-black text-slate-500">
                  Início do 1º
                  <input type="time" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)}
                    className="w-full h-11 px-1 rounded-lg border border-slate-300 bg-white text-base font-mono font-bold text-center mt-0.5 min-w-0" />
                </label>
                <label className="text-[10px] font-black text-slate-500">
                  Duração (min)
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <button type="button" onClick={() => setBulkDuration((v) => Math.max(5, v - 5))} className="h-11 w-7 rounded-lg bg-white border border-slate-300 font-black shrink-0">−</button>
                    <input type="number" min={5} max={120} value={bulkDuration}
                      onChange={(e) => setBulkDuration(parseInt(e.target.value, 10) || 30)}
                      className="flex-1 min-w-0 h-11 px-0.5 rounded-lg border border-slate-300 bg-white text-base font-mono font-bold text-center" />
                    <button type="button" onClick={() => setBulkDuration((v) => Math.min(120, v + 5))} className="h-11 w-7 rounded-lg bg-white border border-slate-300 font-black shrink-0">+</button>
                  </div>
                </label>
                <label className="text-[10px] font-black text-slate-500">
                  Intervalo (min)
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <button type="button" onClick={() => setBulkGap((v) => Math.max(0, v - 5))} className="h-11 w-7 rounded-lg bg-white border border-slate-300 font-black shrink-0">−</button>
                    <input type="number" min={0} max={60} value={bulkGap}
                      onChange={(e) => setBulkGap(parseInt(e.target.value, 10) || 0)}
                      className="flex-1 min-w-0 h-11 px-0.5 rounded-lg border border-slate-300 bg-white text-base font-mono font-bold text-center" />
                    <button type="button" onClick={() => setBulkGap((v) => Math.min(60, v + 5))} className="h-11 w-7 rounded-lg bg-white border border-slate-300 font-black shrink-0">+</button>
                  </div>
                </label>
              </div>
              <button type="button" onClick={applyBulk}
                className="w-full h-11 rounded-xl bg-slate-700 text-white font-black text-sm flex items-center justify-center gap-1.5">
                <Wand2 className="h-4 w-4" /> Aplicar a todos
              </button>
            </div>
          )}

          {/* Lista editável */}
          {loading && <p className="text-center text-xs text-slate-400 py-6">Carregando…</p>}
          {!loading && list.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-6">Nenhum tempo. Toque em + para adicionar.</p>
          )}
          {list.map((p, i) => {
            const dur = diffMin(p.start_time, p.end_time);
            return (
              <div key={`${p.id ?? "new"}-${p.period_number}-${i}`} className={`rounded-2xl border-2 p-3 space-y-2 shadow-sm ${reducedMode ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white" : "border-slate-200 bg-white"}`}>

                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-[#0A2A66] text-white flex items-center justify-center font-black text-sm shrink-0">
                    {p.period_number}º
                  </div>
                  <input
                    value={p.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder={`${p.period_number}º Tempo`}
                    className="flex-1 h-10 px-3 rounded-lg border border-slate-300 text-sm font-bold min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="h-10 w-10 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center shrink-0"
                    aria-label="Remover tempo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div>
                    <p className="text-xs font-black text-slate-500 mb-1">INÍCIO</p>
                    <Stepper value={p.start_time} onChange={(v) => update(i, { start_time: v })} />
                    <div className="mt-1.5 flex gap-1">
                      {(["short","long","none"] as SirenAt[]).map((k) => (
                        <button key={k} type="button" onClick={() => update(i, { start_siren: k })}
                          className={`flex-1 h-9 rounded-md text-xs font-black uppercase tracking-wide transition ${
                            p.start_siren === k ? "bg-gradient-to-br from-[#1E4FB8] to-[#0A2A66] text-white border-2 border-blue-300 ring-2 ring-blue-300 shadow-[0_0_14px_3px_rgba(96,165,250,0.85)]" : "bg-gradient-to-br from-[#123f96] to-[#0A2A66] text-white/70 border-2 border-[#1E4FB8]/60"
                          }`}>
                          {k === "short" ? "Curta" : k === "long" ? "Longa" : "Não tocar"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-500 mb-1">FIM</p>
                    <Stepper value={p.end_time} onChange={(v) => update(i, { end_time: v })} />
                    <div className="mt-1.5 flex gap-1">
                      {(["short","long","none"] as SirenAt[]).map((k) => (
                        <button key={k} type="button" onClick={() => update(i, { end_siren: k })}
                          className={`flex-1 h-9 rounded-md text-xs font-black uppercase tracking-wide transition ${
                            p.end_siren === k ? "bg-gradient-to-br from-[#1E4FB8] to-[#0A2A66] text-white border-2 border-blue-300 ring-2 ring-blue-300 shadow-[0_0_14px_3px_rgba(96,165,250,0.85)]" : "bg-gradient-to-br from-[#123f96] to-[#0A2A66] text-white/70 border-2 border-[#1E4FB8]/60"
                          }`}>
                          {k === "short" ? "Curta" : k === "long" ? "Longa" : "Não tocar"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 text-right font-bold">

                    Duração: <span className={dur < 30 ? "text-amber-600" : "text-slate-700"}>{dur} min</span>
                  </p>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm flex items-center justify-center gap-1"
          >
            <Plus className="h-4 w-4" /> Adicionar tempo
          </button>
        </section>
      )}

      {/* ============ PASSO 3: Revisar e salvar ============ */}
      {step === 3 && (
        <section className="px-4 pt-4 space-y-3">
          <div className={`rounded-2xl p-4 border-2 ${reducedMode ? "bg-amber-50 border-amber-300" : "bg-[#0A2A66]/5 border-[#0A2A66]/20"}`}>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">Você vai salvar</p>
            <p className="font-black text-base text-slate-900">
              {reducedMode ? `Tempo reduzido — ${formatBR(reducedDate)}` : "Quadro padrão"}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">Turno: {SHIFT_LABEL[tab]} · {list.length} tempo(s)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {list.map((p) => (
              <div key={`rev-${p.period_number}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#0A2A66] text-white flex items-center justify-center font-black text-xs">
                  {p.period_number}º
                </div>
                <p className="flex-1 font-bold text-sm text-slate-700 truncate">{p.label}</p>
                <p className="font-mono text-sm font-black text-slate-900">{p.start_time}–{p.end_time}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rodapé fixo: navegação entre passos */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent px-4 pt-4 pb-4">
        <div className="flex gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="h-14 px-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-sm flex items-center justify-center gap-1"
            >
              <ChevronLeft className="h-5 w-5" /> Voltar
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              className="flex-1 h-14 rounded-2xl bg-[#0A2A66] text-white font-black text-base flex items-center justify-center gap-2"
            >
              Continuar <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={async () => { await save(); }}
              disabled={saving}
              className={`flex-1 h-14 rounded-2xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-50 ${
                reducedMode ? "bg-amber-500 text-amber-950" : "bg-emerald-600 text-white"
              }`}
            >
              <Save className="h-5 w-5" />
              {saving ? "Salvando..." : "Salvar"}
            </button>
          )}
        </div>
      </div>

      <ImportTeacherRosterModal
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        schoolId={profile?.school_id ?? ""}
        shift={tab}
        periods={list.map((p) => ({ id: p.id, period_number: p.period_number, start_time: p.start_time, end_time: p.end_time }))}
      />
    </div>
  );
}
