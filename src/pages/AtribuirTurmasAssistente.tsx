import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, GraduationCap, Save, Loader2, Users, Search, ChevronDown } from "lucide-react";

type Assistant = { user_id: string; full_name: string };
type AssistantClass = {
  id: string;
  assistant_user_id: string;
  class_label: string;
  education_level: string;
  shift: string;
};

const SHIFTS = [
  { key: "matutino", label: "Manhã", aliases: ["matutino", "manha", "manhã"] },
  { key: "vespertino", label: "Tarde", aliases: ["vespertino", "tarde"] },
  { key: "noturno", label: "Noite", aliases: ["noturno", "noite"] },
] as const;
type ShiftKey = (typeof SHIFTS)[number]["key"];

const normalizeShift = (s?: string | null): ShiftKey | null => {
  if (!s) return null;
  const v = s.toLowerCase().trim();
  for (const sh of SHIFTS) if ((sh.aliases as readonly string[]).includes(v)) return sh.key;
  return null;
};

const inferLevel = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("em") || l.includes("série") || l.includes("serie") || /^[123]0\d/.test(l.replace(/\s/g, ""))) return "medio";
  return "fundamental";
};

const sortLabels = (arr: string[]) =>
  [...new Set(arr)].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
const keyOf = (shift: string, label: string) => `${shift}|${label}`;

export default function AtribuirTurmasAssistente() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [classes, setClasses] = useState<AssistantClass[]>([]);
  const [turmasByShift, setTurmasByShift] = useState<Record<ShiftKey, string[]>>({
    matutino: [], vespertino: [], noturno: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedAssist, setSelectedAssist] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [openAssist, setOpenAssist] = useState(false);
  const [openTurmas, setOpenTurmas] = useState(true);
  const [activeShift, setActiveShift] = useState<ShiftKey>("matutino");

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const [{ data: ppl }, { data: cls }, { data: roster }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("school_id", profile.school_id)
        .in("role", ["secretario_escolar", "assistente_alunos", "assistente"])
        .order("full_name"),
      supabase.from("assistant_classes").select("*").eq("school_id", profile.school_id),
      supabase.from("teacher_roster").select("class_name, shift").eq("school_id", profile.school_id),
    ]);
    setAssistants(((ppl as any[]) ?? []).map((p) => ({ user_id: p.user_id, full_name: p.full_name })));
    setClasses((cls as AssistantClass[]) ?? []);

    const buckets: Record<ShiftKey, string[]> = { matutino: [], vespertino: [], noturno: [] };
    ((roster as any[]) ?? []).forEach((r) => {
      const sh = normalizeShift(r.shift);
      const name = (r.class_name ?? "").trim();
      if (sh && name) buckets[sh].push(name);
    });
    // Também incorpora turmas já atribuídas em assistant_classes (caso venham de origem antiga)
    ((cls as AssistantClass[]) ?? []).forEach((c) => {
      const sh = normalizeShift(c.shift) ?? (c.shift as ShiftKey);
      if (buckets[sh as ShiftKey] && c.class_label) buckets[sh as ShiftKey].push(c.class_label);
    });
    (Object.keys(buckets) as ShiftKey[]).forEach((k) => { buckets[k] = sortLabels(buckets[k]); });
    setTurmasByShift(buckets);
    setLoading(false);
  }, [profile?.school_id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  const pickAssist = (uid: string) => {
    setSelectedAssist(uid);
    const mine = classes
      .filter((c) => c.assistant_user_id === uid)
      .map((c) => keyOf(c.shift, c.class_label));
    setPicked(new Set(mine));
    setOpenAssist(false);
    setOpenTurmas(true);
  };

  const toggle = (shift: string, label: string) => {
    const k = keyOf(shift, label);
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const save = async () => {
    if (!selectedAssist || !profile?.school_id) return;
    setSaving(true);
    const { error: delErr } = await supabase
      .from("assistant_classes")
      .delete()
      .eq("school_id", profile.school_id)
      .eq("assistant_user_id", selectedAssist);
    if (delErr) { setSaving(false); toast({ title: "Erro", description: delErr.message, variant: "destructive" }); return; }

    const rows = Array.from(picked).map((k) => {
      const [shift, label] = k.split("|");
      return {
        school_id: profile.school_id!,
        assistant_user_id: selectedAssist,
        class_label: label,
        education_level: inferLevel(label),
        shift,
      };
    });
    if (rows.length > 0) {
      const { error } = await supabase.from("assistant_classes").insert(rows);
      if (error) { setSaving(false); toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    }
    setSaving(false);
    toast({ title: `${rows.length} turma(s) atribuída(s)` });
    load();
  };

  const countByAssist = (uid: string) => classes.filter((c) => c.assistant_user_id === uid).length;
  const assistName = assistants.find((a) => a.user_id === selectedAssist)?.full_name ?? "";

  const renderTurmasGrid = (shift: ShiftKey) => {
    const labels = turmasByShift[shift];
    if (labels.length === 0) {
      return (
        <p className="text-xs text-blue-200/70 p-6 text-center">
          Nenhuma turma cadastrada para este turno. Peça à coordenação para lançar as turmas em Horários.
        </p>
      );
    }
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {labels.map((l) => {
          const k = keyOf(shift, l);
          const on = picked.has(k);
          const otherOwners = classes
            .filter((c) => c.class_label === l && normalizeShift(c.shift) === shift && c.assistant_user_id !== selectedAssist)
            .map((c) => assistants.find((a) => a.user_id === c.assistant_user_id)?.full_name?.split(" ")[0] ?? "?");
          const taken = otherOwners.length > 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(shift, l)}
              disabled={!selectedAssist}
              title={taken ? `Também atribuída a: ${otherOwners.join(", ")}` : undefined}
              className={`relative h-11 rounded-lg border-2 text-xs font-black transition disabled:opacity-40 disabled:cursor-not-allowed px-1 break-words ${
                on
                  ? "bg-emerald-500 border-emerald-400 text-slate-900 shadow-md"
                  : taken
                  ? "bg-[#1A2B45] border-amber-500/60 text-amber-200 hover:border-amber-400"
                  : "bg-[#0A1A2F] border-[#2A4A7C] text-blue-100 hover:border-blue-400"
              }`}
            >
              {l}
              {taken && !on && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-amber-500 text-slate-900 rounded-full w-3.5 h-3.5 flex items-center justify-center font-black">
                  {otherOwners.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const pickedByShift = (shift: ShiftKey) =>
    Array.from(picked).filter((k) => k.startsWith(`${shift}|`)).length;

  return (
    <div className="min-h-dvh" style={{ background: "linear-gradient(180deg,#0A1A2F 0%,#0E2340 100%)", color: "#E0E7FF" }}>
      <header className="bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white px-4 py-3 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold leading-none">Coordenação / Gestão</p>
          <h1 className="font-black text-base leading-tight truncate">Atribuir turmas aos Assistentes de Aluno</h1>
        </div>
      </header>

      <div className="p-3 max-w-5xl mx-auto">
        <p className="text-[11px] text-amber-300 font-semibold mb-3">
          1. Selecione o assistente · 2. Escolha o turno · 3. Marque as turmas · 4. Salvar
        </p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-300" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* COL 1: Assistentes */}
            <section className="rounded-2xl border-2 border-[#2A4A7C] bg-[#112240] p-3">
              <button
                type="button"
                onClick={() => setOpenAssist((o) => !o)}
                className="w-full flex items-center justify-between gap-1.5 text-left"
              >
                <span className="text-xs font-black text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> 1. Assistente
                  {selectedAssist && <span className="text-white normal-case tracking-normal text-[11px]">— {assistName}</span>}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black text-blue-200">
                  <Search className="h-3.5 w-3.5" /> Buscar
                  <ChevronDown className={`h-5 w-5 text-blue-300 transition-transform ${openAssist ? "rotate-180" : ""}`} />
                </span>
              </button>
              {openAssist && (
                <div className="mt-2">
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-300/70" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nome..."
                      autoFocus
                      className="w-full h-9 pl-8 pr-8 rounded-lg bg-[#0A1A2F] border-2 border-[#2A4A7C] text-sm text-blue-100 placeholder:text-blue-300/50 focus:outline-none focus:border-blue-400"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-300/70 hover:text-blue-100 text-xs font-black"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="max-h-[55vh] overflow-auto space-y-1.5 pr-1">
                    {(() => {
                      const q = search.trim().toLowerCase();
                      const filtered = q ? assistants.filter((a) => a.full_name.toLowerCase().includes(q)) : assistants;
                      if (assistants.length === 0) {
                        return <p className="text-xs text-blue-200/70 p-3 text-center">Nenhum assistente de aluno cadastrado.</p>;
                      }
                      if (filtered.length === 0) {
                        return <p className="text-xs text-blue-200/70 p-3 text-center">Nenhum resultado para "{search}".</p>;
                      }
                      return filtered.map((a) => {
                        const active = a.user_id === selectedAssist;
                        return (
                          <button
                            key={a.user_id}
                            onClick={() => pickAssist(a.user_id)}
                            className={`w-full text-left p-3 rounded-xl border-2 transition flex items-center justify-between gap-2 ${
                              active
                                ? "bg-[#1E3A5F] border-blue-400"
                                : "bg-[#0A1A2F] border-[#2A4A7C] hover:border-blue-400"
                            }`}
                          >
                            <span className="font-bold text-sm break-words flex-1 min-w-0">{a.full_name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-200 font-black shrink-0">
                              {countByAssist(a.user_id)} turma(s)
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </section>

            {/* COL 2: Turmas */}
            <section className="rounded-2xl border-2 border-[#2A4A7C] bg-[#112240] p-3">
              <button
                type="button"
                onClick={() => setOpenTurmas((o) => !o)}
                className="w-full flex items-center justify-between gap-1.5 mb-2 text-left"
              >
                <span className="text-xs font-black text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4" />
                  2. Turmas {assistName && <span className="text-white normal-case tracking-normal">— {assistName}</span>}
                </span>
                <ChevronDown className={`h-5 w-5 text-blue-300 transition-transform ${openTurmas ? "rotate-180" : ""}`} />
              </button>
              {openTurmas && (!selectedAssist ? (
                <p className="text-xs text-blue-200/70 p-6 text-center">Selecione um assistente para listar as turmas.</p>
              ) : (
                <div className="space-y-3">
                  {/* Abas de turno */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0A1A2F] border-2 border-[#2A4A7C]">
                    {SHIFTS.map((s) => {
                      const on = activeShift === s.key;
                      const n = pickedByShift(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setActiveShift(s.key)}
                          className={`h-9 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5 ${
                            on ? "bg-blue-500 text-white shadow" : "text-blue-200 hover:bg-[#1A2B45]"
                          }`}
                        >
                          {s.label}
                          {n > 0 && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${on ? "bg-white/20 text-white" : "bg-emerald-500 text-slate-900"}`}>
                              {n}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="max-h-[50vh] overflow-auto pr-1">
                    {renderTurmasGrid(activeShift)}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        <button
          onClick={save}
          disabled={!selectedAssist || saving}
          className="w-full mt-4 h-14 rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] text-white font-black flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Salvar atribuições {assistName && `de ${assistName}`} ({picked.size})
        </button>
      </div>
    </div>
  );
}
