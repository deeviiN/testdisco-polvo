import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { extractPdfText } from "@/lib/parseSchedulePdf";
import { parseRosterTextLocally, type RosterRowInput } from "@/lib/parseRosterText";
import { Loader2, X, FileUp, Sparkles, Users, Trash2, Save, ListChecks } from "lucide-react";

type Shift = "manha" | "tarde" | "noite";

const SHIFT_LABEL: Record<Shift, string> = { manha: "MANHÃ", tarde: "TARDE", noite: "NOITE" };
const DAY_LABEL = ["", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export interface ImportRosterPeriod {
  period_number: number;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  id?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  shift: Shift;
  periods: ImportRosterPeriod[];
  onImported?: (count: number) => void;
}

interface Assistant { user_id: string; full_name: string }

const toHMS = (t: string) => (t.length === 5 ? `${t}:00` : t);

export default function ImportTeacherRosterModal({ open, onClose, schoolId, shift, periods, onImported }: Props) {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistantId, setAssistantId] = useState("");
  const [rawText, setRawText] = useState("");
  const [reading, setReading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replace, setReplace] = useState(true);
  const [rows, setRows] = useState<RosterRowInput[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !schoolId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("school_id", schoolId)
        .in("role", ["assistente", "assistente_alunos", "secretario_escolar"])
        .order("full_name");
      const list = ((data as any[]) ?? []).map((p) => ({ user_id: p.user_id, full_name: p.full_name ?? "—" }));
      setAssistants(list);
      setAssistantId((prev) => prev || list[0]?.user_id || "");
    })();
  }, [open, schoolId]);

  const periodMap = useMemo(() => {
    const m = new Map<number, ImportRosterPeriod>();
    periods.forEach((p) => m.set(p.period_number, p));
    return m;
  }, [periods]);

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) throw new Error("O PDF não tem texto (parece ser imagem digitalizada).");
      setRawText(text);
      toast({ title: "PDF lido", description: "Toque em “Ler com IA” para montar o quadro." });
    } catch (e: any) {
      toast({ title: "Não foi possível ler o PDF", description: e?.message, variant: "destructive" });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const parseWithAi = useCallback(async () => {
    if (rawText.trim().length < 10) {
      toast({ title: "Cole ou anexe o quadro primeiro", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-teacher-roster", {
        body: {
          raw_text: rawText,
          shift,
          periods: periods.map((p) => ({ period_number: p.period_number, start_time: p.start_time, end_time: p.end_time })),
        },
      });
      if (error) throw error;
      const found = ((data as any)?.rows ?? []) as RosterRowInput[];
      if (found.length === 0) throw new Error("A IA não encontrou linhas válidas.");
      setRows(found);
      toast({ title: `${found.length} aula(s) reconhecida(s)`, description: "Revise antes de salvar." });
    } catch (e: any) {
      // Fallback convencional: tenta ler no formato tabular local
      const local = parseRosterTextLocally(rawText);
      if (local.length > 0) {
        setRows(local);
        toast({
          title: `IA indisponível — leitura simples aplicada`,
          description: `${local.length} aula(s) lidas do formato DIA | TEMPO | TURMA | PROFESSOR.`,
        });
      } else {
        toast({ title: "Não foi possível interpretar o quadro", description: e?.message, variant: "destructive" });
      }
    } finally {
      setParsing(false);
    }
  }, [rawText, shift, periods]);

  const parseLocal = () => {
    const local = parseRosterTextLocally(rawText);
    if (local.length === 0) {
      toast({
        title: "Nenhuma linha reconhecida",
        description: "Use: DIA | TEMPO | TURMA | PROFESSOR | DISCIPLINA | SALA",
        variant: "destructive",
      });
      return;
    }
    setRows(local);
    toast({ title: `${local.length} aula(s) lidas` });
  };

  const save = async () => {
    if (!schoolId || rows.length === 0) return;
    if (!assistantId) {
      toast({ title: "Escolha o assistente responsável", variant: "destructive" });
      return;
    }
    const invalid = rows.filter((r) => !periodMap.has(r.period_number));
    if (invalid.length === rows.length) {
      toast({ title: "Os tempos do quadro não existem neste turno", description: "Ajuste os tempos antes de importar.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (replace) {
        const { error: delErr } = await supabase
          .from("teacher_roster")
          .delete()
          .eq("school_id", schoolId)
          .eq("shift", shift);
        if (delErr) throw delErr;
      }
      const payload = rows
        .filter((r) => periodMap.has(r.period_number))
        .map((r) => {
          const p = periodMap.get(r.period_number)!;
          return {
            school_id: schoolId,
            assistant_user_id: assistantId,
            shift,
            weekday: r.weekday,
            period_id: p.id ?? null,
            start_time: toHMS(p.start_time),
            end_time: toHMS(p.end_time),
            class_name: r.class_name,
            teacher_name: r.teacher_name,
            discipline: r.discipline,
            room_name: r.room_name,
          };
        });

      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from("teacher_roster").insert(payload.slice(i, i + 200) as any);
        if (error) throw error;
      }
      toast({ title: `${payload.length} aula(s) importadas`, description: `Turno ${SHIFT_LABEL[shift]}.` });
      onImported?.(payload.length);
      setRows([]);
      setRawText("");
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao salvar o quadro", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-[#04122E]/95 backdrop-blur-sm flex flex-col">
      <header className="shrink-0 px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-amber-400 text-[#04122E] flex items-center justify-center shrink-0">
          <ListChecks className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-black text-lg leading-tight break-words">Importar quadro de professores</h2>
          <p className="text-white/70 text-xs font-bold">Turno {SHIFT_LABEL[shift]} · tudo de uma vez</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar"
          className="h-11 w-11 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        <label className="block">
          <span className="text-[11px] font-black text-white/70 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Assistente responsável</span>
          <select
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
            className="mt-1 w-full h-12 rounded-xl bg-white/95 px-3 text-base font-bold text-[#04122E]"
          >
            {assistants.length === 0 && <option value="">Nenhum assistente cadastrado</option>}
            {assistants.map((a) => (
              <option key={a.user_id} value={a.user_id}>{a.full_name}</option>
            ))}
          </select>
        </label>

        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={reading}
          className="w-full h-12 rounded-xl bg-white/10 border-2 border-white/25 text-white px-3 flex items-center gap-2 text-sm font-black disabled:opacity-60">
          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {reading ? "Lendo o PDF…" : "Anexar quadro em PDF"}
        </button>

        <label className="block">
          <span className="text-[11px] font-black text-white/70">Ou cole o quadro aqui</span>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={7}
            placeholder={"SEG | 1 | 101 | Anderson Lima | Matemática | Sala 3\nSEG | 2 | 101 | Kátia Souza | Português"}
            className="mt-1 w-full rounded-xl bg-white/95 p-3 text-sm font-mono text-[#04122E]"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={parseWithAi} disabled={parsing}
            className="h-12 rounded-xl bg-amber-400 text-[#04122E] font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-60">
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {parsing ? "Lendo…" : "Ler com IA"}
          </button>
          <button type="button" onClick={parseLocal}
            className="h-12 rounded-xl bg-white/10 border-2 border-white/25 text-white font-black text-sm">
            Leitura simples
          </button>
        </div>

        {rows.length > 0 && (
          <div className="rounded-2xl bg-white/95 p-2 space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <p className="flex-1 text-xs font-black text-[#04122E]">{rows.length} aula(s) prontas</p>
              <button type="button" onClick={() => setRows([])} className="text-xs font-black text-red-600 underline">limpar</button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {rows.map((r, i) => (
                <div key={`${r.weekday}-${r.period_number}-${r.class_name}-${i}`}
                  className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1.5">
                  <span className="h-7 px-2 rounded-md bg-[#0A2A66] text-white text-[11px] font-black flex items-center shrink-0">
                    {DAY_LABEL[r.weekday]} {r.period_number}º
                  </span>
                  <span className="text-xs font-black text-[#04122E] shrink-0">{r.class_name}</span>
                  <span className="flex-1 text-xs font-bold text-slate-700 break-words">
                    {r.teacher_name}{r.discipline ? ` · ${r.discipline}` : ""}
                  </span>
                  <button type="button" aria-label="Remover linha"
                    onClick={() => setRows((prev) => prev.filter((_, k) => k !== i))}
                    className="h-7 w-7 rounded-md bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs font-bold text-white/80">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-5 w-5" />
          Substituir o quadro atual do turno {SHIFT_LABEL[shift]}
        </label>
      </div>

      <footer className="shrink-0 p-4 bg-gradient-to-t from-[#04122E] to-transparent">
        <button type="button" onClick={save} disabled={saving || rows.length === 0}
          className="w-full h-14 rounded-2xl bg-emerald-500 text-white font-black text-base flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          {saving ? "Salvando…" : `Salvar ${rows.length || ""} aula(s)`}
        </button>
      </footer>
    </div>
  );
}
