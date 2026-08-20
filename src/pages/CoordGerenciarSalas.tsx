import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRightLeft,
  Users,
  Loader2,
  Check,
  CheckSquare,
  Square,
  UserCheck,
  Sparkles,
} from "lucide-react";

type Roster = {
  id: string;
  teacher_name: string;
  nickname: string | null;
  discipline: string | null;
  class_name: string | null;
  room_name: string | null;
  block_name: string | null;
  shift: string | null;
  start_time: string;
  end_time: string;
  weekday: number | null;
  assistant_user_id: string;
  original_assistant_user_id?: string | null;
};

type Assistant = { user_id: string; full_name: string };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const GOLD = "hsl(45, 92%, 60%)";
const GOLD_SOFT = "hsl(45, 90%, 70%)";

/** aliases de turno usados nas duas tabelas */
const SHIFT_ALIAS: Record<string, string> = {
  manha: "matutino", matutino: "manha",
  tarde: "vespertino", vespertino: "tarde",
  noite: "noturno", noturno: "noite",
};
const shiftMatches = (a?: string | null, b?: string | null) => {
  if (!a || !b) return true; // sem shift em algum lado -> permissivo
  if (a === b) return true;
  return SHIFT_ALIAS[a] === b;
};

/** paleta suave por ID para diferenciar assistentes destino */
function pickColor(uid: string) {
  const palette = [
    "hsl(190, 85%, 55%)",
    "hsl(155, 70%, 50%)",
    "hsl(280, 75%, 65%)",
    "hsl(20, 90%, 60%)",
    "hsl(340, 82%, 62%)",
    "hsl(210, 90%, 65%)",
  ];
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** primeiro + último nome, sem meio */
function shortName(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]}`;
}


export default function CoordGerenciarSalas() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isAssistant = ["assistente", "assistente_alunos", "secretario_escolar"].includes(profile?.role ?? "");
  type ClassAssign = { assistant_user_id: string; class_label: string; shift: string | null };
  const [classAssignments, setClassAssignments] = useState<ClassAssign[]>([]);

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);

  // fluxo do assistente
  const [toUser, setToUser] = useState<string>("");
  const [selectedByAssistant, setSelectedByAssistant] = useState<Record<string, Set<string>>>({});
  const [note, setNote] = useState("");
  const [transferDates, setTransferDates] = useState<string[]>([]); // YYYY-MM-DD
  const [saving, setSaving] = useState(false);


  // fluxo do coordenador (mantido enxuto)
  const [fromUserCoord, setFromUserCoord] = useState<string>("");
  const [toUserCoord, setToUserCoord] = useState<string>("");
  const [selectedCoord, setSelectedCoord] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const [{ data: ppl }, { data: rs }, { data: ac }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("school_id", profile.school_id)
        .eq("is_approved", true)
        .in("role", ["assistente", "assistente_alunos", "secretario_escolar"])
        .order("full_name"),
      supabase
        .from("teacher_roster")
        .select("id, teacher_name, nickname, discipline, class_name, room_name, block_name, shift, start_time, end_time, weekday, assistant_user_id, original_assistant_user_id")
        .eq("school_id", profile.school_id)
        .order("weekday")
        .order("start_time"),
      supabase
        .from("assistant_classes")
        .select("assistant_user_id, class_label, shift")
        .eq("school_id", profile.school_id),
    ]);
    setAssistants((ppl as Assistant[]) ?? []);
    setRosters((rs as any as Roster[]) ?? []);
    setClassAssignments((ac as ClassAssign[]) ?? []);
    setLoading(false);
  }, [profile?.school_id]);

  useEffect(() => { load(); }, [load]);

  // Resolve o "assistente efetivo" de uma sala (para visão do coordenador):
  // 1) vínculo direto em teacher_roster.assistant_user_id
  // 2) senão, atribuição via assistant_classes (class_label + shift, com aliases)
  const resolveAssistantId = useCallback((r: Roster): string => {
    if (r.assistant_user_id) return r.assistant_user_id;
    const exact = classAssignments.find(
      (a) => a.class_label === r.class_name && shiftMatches(a.shift, r.shift),
    );
    if (exact) return exact.assistant_user_id;
    const any = classAssignments.find((a) => a.class_label === r.class_name);
    return any?.assistant_user_id ?? "";
  }, [classAssignments]);

  const rostersByAssistant = useMemo(() => {
    const map = new Map<string, Roster[]>();
    for (const r of rosters) {
      const aid = resolveAssistantId(r);
      if (!aid) continue;
      const arr = map.get(aid) ?? [];
      arr.push(r);
      map.set(aid, arr);
    }
    return map;
  }, [rosters, resolveAssistantId]);

  const meId = profile?.user_id ?? "";
  // "Minhas salas" (assistente): união de rosters diretamente meus + salas cujo
  // (class_label, shift) me pertence via assistant_classes — independente do turno atual.
  const myRosters = useMemo(() => {
    if (!isAssistant) return [];
    const mine = classAssignments.filter((a) => a.assistant_user_id === meId);
    const seen = new Set<string>();
    const out: Roster[] = [];
    for (const r of rosters) {
      const isMineDirect = r.assistant_user_id === meId;
      const isMineByClass = mine.some(
        (a) => a.class_label === r.class_name && shiftMatches(a.shift, r.shift),
      );
      if ((isMineDirect || isMineByClass) && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
    return out;
  }, [rosters, classAssignments, meId, isAssistant]);

  // Agrupa por TURMA (class_name + shift): 1 card por turma no passo 2.
  type Turma = { key: string; class_name: string; shift: string | null; rosterIds: string[]; count: number };
  const myTurmas = useMemo<Turma[]>(() => {
    const map = new Map<string, Turma>();
    for (const r of myRosters) {
      const key = `${r.class_name ?? ""}|${r.shift ?? ""}`;
      const t = map.get(key) ?? { key, class_name: r.class_name ?? "—", shift: r.shift ?? null, rosterIds: [], count: 0 };
      t.rosterIds.push(r.id);
      t.count += 1;
      map.set(key, t);
    }
    return Array.from(map.values()).sort((a, b) => a.class_name.localeCompare(b.class_name, "pt-BR", { numeric: true }));
  }, [myRosters]);

  const otherAssistants = assistants.filter((a) => a.user_id !== meId);
  const [assistantSearch, setAssistantSearch] = useState("");
  const filteredAssistants = useMemo(() => {
    const q = assistantSearch.trim().toLowerCase();
    if (!q) return otherAssistants;
    return otherAssistants.filter((a) => a.full_name.toLowerCase().includes(q));
  }, [otherAssistants, assistantSearch]);



  const getSel = (uid: string) => selectedByAssistant[uid] ?? new Set<string>();
  const toggleFor = (uid: string, rosterId: string) => {
    setSelectedByAssistant((prev) => {
      const cur = new Set(prev[uid] ?? []);
      if (cur.has(rosterId)) cur.delete(rosterId);
      else {
        const next = { ...prev, [uid]: cur };
        for (const other of Object.keys(next)) {
          if (other !== uid && next[other]?.has(rosterId)) {
            const clone = new Set(next[other]);
            clone.delete(rosterId);
            next[other] = clone;
          }
        }
        cur.add(rosterId);
        next[uid] = cur;
        return next;
      }
      return { ...prev, [uid]: cur };
    });
  };
  // Marca/desmarca uma TURMA inteira (todas as aulas dela) para um assistente
  const toggleTurmaFor = (uid: string, rosterIds: string[]) => {
    setSelectedByAssistant((prev) => {
      const cur = new Set(prev[uid] ?? []);
      const allIn = rosterIds.every((id) => cur.has(id));
      const next = { ...prev };
      if (allIn) {
        for (const id of rosterIds) cur.delete(id);
        next[uid] = cur;
      } else {
        // remove esses ids de qualquer outro destinatário e adiciona aqui
        for (const other of Object.keys(next)) {
          if (other === uid) continue;
          const clone = new Set(next[other]);
          for (const id of rosterIds) clone.delete(id);
          next[other] = clone;
        }
        for (const id of rosterIds) cur.add(id);
        next[uid] = cur;
      }
      return next;
    });
  };
  const selectAllFor = (uid: string) => {
    setSelectedByAssistant((prev) => {
      const already = prev[uid] ?? new Set<string>();
      if (already.size === myRosters.length && myRosters.every((r) => already.has(r.id))) {
        return { ...prev, [uid]: new Set() };
      }
      const next: Record<string, Set<string>> = {};
      next[uid] = new Set(myRosters.map((r) => r.id));
      return next;
    });
  };


  const totalSelected = Object.values(selectedByAssistant).reduce((n, s) => n + s.size, 0);
  const recipients = Object.entries(selectedByAssistant).filter(([, s]) => s.size > 0);

  const doTransfer = async () => {
    if (recipients.length === 0) {
      toast({ title: "Selecione ao menos uma sala e um destinatário", variant: "destructive" });
      return;
    }
    if (transferDates.length === 0) {
      toast({ title: "Escolha ao menos uma data para a transferência", variant: "destructive" });
      return;
    }
    const datesLabel = transferDates
      .slice()
      .sort()
      .map((d) => d.split("-").reverse().join("/"))
      .join(", ");
    const composedNote = `Datas: ${datesLabel}${note.trim() ? ` — ${note.trim()}` : ""}`;
    setSaving(true);
    let totalMoved = 0;
    for (const [uid, set] of recipients) {
      const { data, error } = await supabase.rpc("coord_reassign_assistant_rosters", {
        _from_user: meId,
        _to_user: uid,
        _roster_ids: Array.from(set),
        _note: composedNote,
      });

      if (error) {
        toast({ title: "Erro ao transferir", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      totalMoved += (data as any)?.transferred ?? 0;
    }
    setSaving(false);
    toast({ title: `${totalMoved} sala(s) transferida(s) para ${recipients.length} assistente(s)` });
    setSelectedByAssistant({});
    setNote("");
    setTransferDates([]);
    load();

  };

  // Coordenador (função antiga)
  const coordFromRosters = fromUserCoord ? rostersByAssistant.get(fromUserCoord) ?? [] : [];
  const toggleCoord = (id: string) => {
    setSelectedCoord((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const doCoordTransfer = async () => {
    if (!fromUserCoord || !toUserCoord || selectedCoord.size === 0) {
      toast({ title: "Selecione origem, destino e salas", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("coord_reassign_assistant_rosters", {
      _from_user: fromUserCoord, _to_user: toUserCoord, _roster_ids: Array.from(selectedCoord), _note: note.trim() || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${(data as any)?.transferred ?? 0} sala(s) transferidas` });
    setSelectedCoord(new Set()); setNote(""); load();
  };

  const nameOf = (uid: string) => assistants.find((a) => a.user_id === uid)?.full_name ?? "—";

  // ================================================================
  // VIEW COORDENADOR (mantida simples — foco do redesign é o assistente)
  // ================================================================
  if (!isAssistant) {
    return (
      <div className="min-h-dvh bg-background pb-32">
        <header className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-md">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Atribuir salas aos Assistentes</h1>
            <p className="text-xs opacity-80">Coordenação: distribua e redistribua salas</p>
          </div>
        </header>
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <section className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h2 className="font-bold">Salas por assistente</h2></div>
                {assistants.map((a) => {
                  const list = rostersByAssistant.get(a.user_id) ?? [];
                  return (
                    <div key={a.user_id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold break-words">{a.full_name}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{list.length} sala(s)</span>
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" /><h2 className="font-bold">Transferir salas</h2></div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={fromUserCoord} onChange={(e) => setFromUserCoord(e.target.value)} className="h-11 rounded-xl border px-3 bg-background">
                    <option value="">Origem…</option>
                    {assistants.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
                  </select>
                  <select value={toUserCoord} onChange={(e) => setToUserCoord(e.target.value)} className="h-11 rounded-xl border px-3 bg-background">
                    <option value="">Destino…</option>
                    {assistants.filter((a) => a.user_id !== fromUserCoord).map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
                  </select>
                </div>
                {fromUserCoord && (
                  <div className="rounded-xl border p-2 max-h-72 overflow-auto">
                    {coordFromRosters.map((r) => (
                      <label key={r.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
                        <input type="checkbox" checked={selectedCoord.has(r.id)} onChange={() => toggleCoord(r.id)} className="mt-1" />
                        <div>
                          <p className="font-bold text-sm">{r.teacher_name}</p>
                          <p className="text-xs text-muted-foreground">{r.class_name} · {r.shift} · {WEEKDAYS[r.weekday ?? 0]} {r.start_time.slice(0,5)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo (opcional)" className="w-full h-11 rounded-xl border px-3 bg-background" />
                <button onClick={doCoordTransfer} disabled={saving} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold">
                  {saving ? "Transferindo…" : `Transferir (${selectedCoord.size})`}
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    );
  }

  // ================================================================
  // VIEW ASSISTENTE — redesenhada (azul degradê + detalhe dourado)
  // ================================================================
  const bg =
    "linear-gradient(160deg, hsl(220,75%,10%) 0%, hsl(222,70%,16%) 40%, hsl(225,80%,22%) 100%)";

  return (
    <div className="min-h-dvh text-white" style={{ background: bg }}>
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md border-b border-white/10 shadow-lg"
        style={{ background: "linear-gradient(180deg, hsla(222,80%,14%,0.9), hsla(222,80%,14%,0.75))" }}>
        <div className="max-w-3xl mx-auto px-2 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-95 transition">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black leading-tight flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
              Transferir minhas salas
            </h1>
            <p className="text-[11px] opacity-80">Acordo direto entre assistentes de aluno</p>
          </div>
        </div>
      </header>

      {/* Bloco fixo: identificação + destinatários */}
      <div
        className="sticky z-[9] backdrop-blur-md border-b border-white/10"
        style={{
          top: 56,
          background: "linear-gradient(180deg, hsla(222,80%,12%,0.92), hsla(222,80%,12%,0.78))",
        }}
      >
        <div className="max-w-3xl mx-auto px-2 pt-2 pb-2 space-y-2">
          {loading ? null : (
            <>
              {/* Card de identificação */}
              <div
                className="rounded-2xl border px-3 py-2 shadow-xl relative overflow-hidden"
                style={{
                  borderColor: `${GOLD}55`,
                  background: "linear-gradient(135deg, hsla(220,90%,25%,0.6), hsla(222,70%,18%,0.4))",
                  boxShadow: `0 0 0 1px ${GOLD}22, 0 8px 20px hsla(0,0%,0%,0.4)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `radial-gradient(circle at 30% 30%, ${GOLD_SOFT}, ${GOLD})`, boxShadow: `0 0 14px ${GOLD}66` }}
                  >
                    <UserCheck className="h-5 w-5 text-slate-900" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest font-black opacity-70 leading-none">Você é</p>
                    <p className="text-lg font-black leading-tight break-words">{profile?.full_name ?? "—"}</p>
                  </div>
                  <p className="text-[11px] font-bold text-right shrink-0" style={{ color: GOLD_SOFT }}>
                    {myTurmas.length} turma(s)
                  </p>
                </div>
              </div>

              {myRosters.length > 0 && (
                <section className="rounded-2xl border border-white/10 px-3 py-2 bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[10px] uppercase tracking-widest font-black opacity-80">
                      <span style={{ color: GOLD }}>1.</span> Escolha para quem transferir · divida entre vários
                    </p>
                    <span className="text-[10px] opacity-70">{otherAssistants.length}</span>
                  </div>
                  <input
                    value={assistantSearch}
                    onChange={(e) => setAssistantSearch(e.target.value)}
                    placeholder="Buscar assistente pelo nome…"
                    className="w-full h-9 mb-2 rounded-xl border border-white/15 bg-black/30 px-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
                  />
                  <div className="grid grid-cols-2 gap-2 max-h-[26vh] overflow-auto pr-1">
                    {filteredAssistants.length === 0 && (
                      <p className="col-span-2 text-center text-xs opacity-60 py-3">Nenhum assistente encontrado.</p>
                    )}
                    {filteredAssistants.map((a) => {
                      const active = toUser === a.user_id;
                      const c = pickColor(a.user_id);
                      const nSel = getSel(a.user_id).size;
                      return (
                        <button
                          key={a.user_id}
                          onClick={() => setToUser(a.user_id)}
                          className={`h-11 rounded-xl px-2 text-center flex items-center justify-center border transition active:scale-[0.98] ${
                            active ? "border-white/60 shadow-lg" : "border-white/15 hover:border-white/30"
                          }`}
                          style={{
                            background: active
                              ? `linear-gradient(135deg, ${c}, hsl(222,80%,22%))`
                              : "hsla(0,0%,100%,0.04)",
                            boxShadow: active ? `0 0 0 2px ${GOLD}66, 0 6px 16px hsla(0,0%,0%,0.4)` : undefined,
                          }}
                        >
                          <p className="text-base font-black leading-tight break-words">
                            {shortName(a.full_name)}
                            {nSel > 0 && (
                              <span className="ml-1 text-[11px] font-bold" style={{ color: GOLD_SOFT }}>
                                ·{nSel}
                              </span>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-2 pt-3 pb-40 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} /></div>
        ) : myRosters.length === 0 ? (
          <div className="rounded-2xl border border-white/10 p-6 text-center text-white/70 bg-white/5">
            Você não possui salas atribuídas para transferir.
          </div>
        ) : (
          <>


                {/* Passo 2 — escolher TURMAS (não aulas individuais) */}
                {toUser && (
                  <section className="rounded-2xl border border-white/10 p-4 bg-white/[0.04] space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[10px] uppercase tracking-widest font-black opacity-80">
                        <span style={{ color: GOLD }}>2.</span> Marque as turmas para{" "}
                        <span className="opacity-100" style={{ color: GOLD_SOFT }}>
                          {shortName(nameOf(toUser))}
                        </span>
                      </p>
                      <button
                        onClick={() => selectAllFor(toUser)}
                        className="text-[11px] font-black uppercase px-3 h-8 rounded-full border border-white/25 hover:bg-white/10 active:scale-95 transition"
                      >
                        Marcar todas
                      </button>
                    </div>
                    <p className="text-[11px] opacity-70 -mt-1">
                      São <b>{myTurmas.length}</b> turma(s) sob sua responsabilidade.
                    </p>

                    <div className="grid grid-cols-2 gap-2 max-h-[46vh] overflow-auto pr-1">
                      {myTurmas.map((t) => {
                        const sel = getSel(toUser);
                        const chosen = t.rosterIds.every((id) => sel.has(id));
                        const partial = !chosen && t.rosterIds.some((id) => sel.has(id));
                        // turma marcada para outro destinatário?
                        const elsewhereUid = Object.entries(selectedByAssistant).find(
                          ([uid, s]) => uid !== toUser && t.rosterIds.some((id) => s.has(id)),
                        )?.[0];
                        const chosenElsewhere = !!elsewhereUid;
                        const otherName = elsewhereUid ? shortName(nameOf(elsewhereUid)) : "";
                        return (
                          <button
                            key={t.key}
                            onClick={() => toggleTurmaFor(toUser, t.rosterIds)}
                            className={`rounded-xl p-3 text-left border transition active:scale-[0.98] flex flex-col gap-1 ${
                              chosen ? "border-transparent" : "border-white/15 hover:border-white/30"
                            }`}
                            style={
                              chosen
                                ? { background: `linear-gradient(135deg, ${pickColor(toUser)}55, hsla(222,80%,22%,0.6))`, boxShadow: `inset 0 0 0 2px ${GOLD}` }
                                : { background: "hsla(0,0%,100%,0.04)" }
                            }
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                                style={{
                                  background: chosen ? GOLD : partial ? `${GOLD}55` : "hsla(0,0%,100%,0.08)",
                                  color: chosen ? "#111" : "white",
                                }}
                              >
                                {chosen ? <Check className="h-4 w-4" strokeWidth={3} /> : <Square className="h-4 w-4 opacity-50" />}
                              </div>
                              <p className="text-lg font-black leading-tight">Turma {t.class_name}</p>
                            </div>
                            <p className="text-[11px] font-mono opacity-75">
                              {t.shift ?? "—"} · {t.count} aula(s)
                            </p>
                            {chosenElsewhere && (
                              <p className="text-[10px] font-bold" style={{ color: GOLD_SOFT }}>
                                Marcada para {otherName} — clique para trocar
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}


                {/* Passo 3 — datas + motivo + confirmar */}
                <section className="rounded-2xl border border-white/10 p-4 bg-white/[0.04] space-y-3">
                  <p className="text-[10px] uppercase tracking-widest font-black opacity-80">
                    <span style={{ color: GOLD }}>3.</span> Datas da transferência (temporária)
                  </p>
                  <p className="text-[11px] opacity-75 -mt-1">
                    Escolha um ou mais dias. A transferência vale apenas para essas datas.
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="date"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setTransferDates((prev) => prev.includes(v) ? prev : [...prev, v]);
                        e.target.value = "";
                      }}
                      className="h-10 rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white"
                    />
                    {transferDates.slice().sort().map((d) => (
                      <button
                        key={d}
                        onClick={() => setTransferDates((prev) => prev.filter((x) => x !== d))}
                        className="h-8 px-3 rounded-full text-[11px] font-black border"
                        style={{ background: `${GOLD}22`, borderColor: `${GOLD}88`, color: GOLD_SOFT }}
                        title="Clique para remover"
                      >
                        {d.split("-").reverse().join("/")} ✕
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] uppercase tracking-widest font-black opacity-80 pt-1">
                    Motivo (opcional)
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex.: Estou transferindo minhas salas por consulta médica. Por favor, agradeço."
                    rows={3}
                    className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
                  />


                  {recipients.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs space-y-1">
                      <p className="font-black uppercase tracking-wide opacity-80 text-[10px] mb-1">Resumo</p>
                      {recipients.map(([uid, s]) => (
                        <p key={uid}>
                          <span style={{ color: GOLD_SOFT }} className="font-black">{s.size}</span>{" "}
                          sala(s) → <b>{shortName(nameOf(uid))}</b>
                        </p>
                      ))}
                    </div>
                  )}
                </section>
          </>
        )}
      </main>


      {/* Barra fixa de confirmação */}
      {myRosters.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-white/10 backdrop-blur-md"
          style={{ background: "linear-gradient(180deg, hsla(222,80%,10%,0.6), hsla(222,80%,10%,0.95))" }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-70">Total</p>
              <p className="text-sm font-black leading-tight truncate">
                {totalSelected} sala(s) para {recipients.length} assistente(s)
              </p>
            </div>
            <button
              onClick={doTransfer}
              disabled={saving || totalSelected === 0}
              className="h-12 px-5 rounded-xl font-black text-sm flex items-center gap-2 active:scale-95 transition disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})`,
                color: "#1a1a1a",
                boxShadow: `0 0 14px ${GOLD}88, 0 8px 22px hsla(0,0%,0%,0.5)`,
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
              Confirmar transferência
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
