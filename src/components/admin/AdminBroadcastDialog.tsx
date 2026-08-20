import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Globe, MapPin, Building2, School as SchoolIcon, Send, Users, Megaphone, AlertTriangle, Sparkles, Wrench, Download } from "lucide-react";

type Scope = "global" | "state" | "city" | "school";
type Kind = "info" | "alert" | "update" | "maintenance";

const SCOPES: { value: Scope; label: string; hint: string; icon: React.ElementType }[] = [
  { value: "global", label: "Brasil", hint: "Todos os apps do país", icon: Globe },
  { value: "state", label: "Estado", hint: "Somente um estado", icon: MapPin },
  { value: "city", label: "Município", hint: "Somente uma cidade", icon: Building2 },
  { value: "school", label: "Escola", hint: "Somente uma escola", icon: SchoolIcon },
];

const KINDS: { value: Kind; label: string; icon: React.ElementType }[] = [
  { value: "info", label: "Comunicado", icon: Megaphone },
  { value: "alert", label: "Importante", icon: AlertTriangle },
  { value: "update", label: "Novidade", icon: Sparkles },
  { value: "maintenance", label: "Manutenção", icon: Wrench },
];

export function AdminBroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [scope, setScope] = useState<Scope>("global");
  const [kind, setKind] = useState<Kind>("info");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schools, setSchools] = useState<{ id: string; name: string; city: string; state: string }[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionLabel, setActionLabel] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  type PreviewSchool = { id: string; name: string; city: string; state: string; users: number };
  type PreviewCity = { city: string; state: string; schools: number; users: number };
  const [reach, setReach] = useState<{
    schools: number;
    users: number;
    cities: PreviewCity[];
    school_list: PreviewSchool[];
    truncated: boolean;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<"cities" | "schools">("cities");
  const [loadingReach, setLoadingReach] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase.from("schools").select("state").eq("is_active", true).limit(10000);
      setStates([...new Set((data ?? []).map((s: any) => s.state).filter(Boolean))].sort());
    })();
  }, [open]);

  useEffect(() => {
    if (!state) { setCities([]); return; }
    void (async () => {
      const { data } = await supabase.from("schools").select("city").eq("state", state).eq("is_active", true).limit(10000);
      setCities([...new Set((data ?? []).map((s: any) => s.city).filter(Boolean))].sort());
    })();
  }, [state]);

  useEffect(() => {
    if (scope !== "school" || schoolQuery.trim().length < 3) { setSchools([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, city, state")
        .ilike("name", `%${schoolQuery.trim()}%`)
        .eq("is_active", true)
        .limit(20);
      setSchools((data ?? []) as any);
    }, 350);
    return () => clearTimeout(t);
  }, [scope, schoolQuery]);

  const payload = useMemo(() => ({
    scope, kind, title: title.trim(), body: body.trim(),
    state: scope === "state" || scope === "city" ? state : null,
    city: scope === "city" ? city : null,
    school_id: scope === "school" ? schoolId : null,
    action_label: actionLabel.trim() || null,
    action_url: actionUrl.trim() || null,
  }), [scope, kind, title, body, state, city, schoolId, actionLabel, actionUrl]);

  const scopeReady =
    scope === "global" ||
    (scope === "state" && !!state) ||
    (scope === "city" && !!state && !!city) ||
    (scope === "school" && !!schoolId);

  const checkReach = async () => {
    setLoadingReach(true);
    setReach(null);
    const { data, error } = await supabase.functions.invoke("send-broadcast", {
      body: { ...payload, title: title.trim() || "Prévia", body: body.trim() || "Prévia", preview: true },
    });
    setLoadingReach(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || "Não foi possível calcular o alcance");
      return;
    }
    const d = data as any;
    setReach({
      schools: d.schools ?? 0,
      users: d.users ?? 0,
      cities: d.cities ?? [],
      school_list: d.school_list ?? [],
      truncated: !!d.truncated,
    });
    setPreviewTab("cities");
  };

  const exportPreviewCsv = () => {
    if (!reach) return;
    const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[] = [];
    rows.push(["Tipo", "Município", "UF", "Escola", "Escolas", "Pessoas"].map(esc).join(";"));
    rows.push(["TOTAL", "", "", "", reach.schools, reach.users].map(esc).join(";"));
    reach.cities.forEach((c) =>
      rows.push(["Município", c.city, c.state, "", c.schools, c.users].map(esc).join(";")),
    );
    reach.school_list.forEach((s) =>
      rows.push(["Escola", s.city, s.state, s.name, 1, s.users].map(esc).join(";")),
    );
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `previa-envio-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Prévia exportada em CSV");
  };

  const send = async () => {

    if (!scopeReady) return toast.error("Defina o alcance do aviso");
    if (title.trim().length < 3 || body.trim().length < 3) return toast.error("Preencha título e mensagem");
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-broadcast", { body: payload });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || "Falha ao enviar");
      return;
    }
    const r = data as any;
    toast.success(`Aviso enviado · ${r.users} pessoa(s) · ${r.sent} push entregue(s)${r.removed ? ` · ${r.removed} expirado(s) removido(s)` : ""}`);
    onOpenChange(false);
    setTitle(""); setBody(""); setActionLabel(""); setActionUrl(""); setReach(null);
  };

  const selectedSchool = schools.find((s) => s.id === schoolId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 border-4 border-amber-300/50 rounded-3xl overflow-hidden bg-gradient-to-br from-[#0A2A66] via-[#0B3D7A] to-[#08205A] text-white max-h-[92dvh] overflow-y-auto">
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500" />
        <div className="px-5 pt-4 pb-2 text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-full bg-amber-400/20 border-2 border-amber-300/70 flex items-center justify-center shadow-[0_0_24px_rgba(251,191,36,0.6)]">
            <Megaphone className="h-7 w-7 text-amber-300" />
          </div>
          <p className="text-xs uppercase tracking-[0.25em] font-black text-amber-300">Envio de avisos</p>
          <h2 className="text-2xl font-black leading-tight">Mensagem para os apps</h2>
        </div>

        <div className="px-4 pb-5 space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-white/70 mb-2">Alcance</p>
            <div className="grid grid-cols-2 gap-2">
              {SCOPES.map((s) => {
                const Icon = s.icon;
                const active = scope === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => { setScope(s.value); setReach(null); }}
                    className={`h-[62px] rounded-2xl px-3 text-left transition active:scale-[0.98] border ${
                      active
                        ? "bg-white/15 border-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.55)]"
                        : "bg-white/5 border-white/15"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-black text-base">
                      <Icon className={`h-4 w-4 ${active ? "text-amber-300" : "text-white/70"}`} /> {s.label}
                    </span>
                    <span className="block text-[11px] text-white/60 leading-tight">{s.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {(scope === "state" || scope === "city") && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={state}
                onChange={(e) => { setState(e.target.value); setCity(""); setReach(null); }}
                className="h-12 rounded-xl bg-white/10 border border-white/20 px-3 font-bold"
              >
                <option value="">Estado…</option>
                {states.map((s) => <option key={s} value={s} className="text-black">{s}</option>)}
              </select>
              {scope === "city" && (
                <select
                  value={city}
                  onChange={(e) => { setCity(e.target.value); setReach(null); }}
                  className="h-12 rounded-xl bg-white/10 border border-white/20 px-3 font-bold"
                  disabled={!state}
                >
                  <option value="">Município…</option>
                  {cities.map((c) => <option key={c} value={c} className="text-black">{c}</option>)}
                </select>
              )}
            </div>
          )}

          {scope === "school" && (
            <div className="space-y-2">
              <Input
                value={schoolQuery}
                onChange={(e) => { setSchoolQuery(e.target.value); setSchoolId(""); setReach(null); }}
                placeholder="Buscar escola pelo nome…"
                className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 font-bold"
              />
              {selectedSchool && (
                <p className="text-sm font-bold text-amber-300">
                  Selecionada: {selectedSchool.name} — {selectedSchool.city}/{selectedSchool.state}
                </p>
              )}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {schools.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSchoolId(s.id); setReach(null); }}
                    className={`w-full text-left rounded-xl px-3 py-2 border text-sm font-bold ${
                      schoolId === s.id ? "bg-white/15 border-amber-300" : "bg-white/5 border-white/15"
                    }`}
                  >
                    <span className="block text-wrap break-words">{s.name}</span>
                    <span className="block text-[11px] text-white/60">{s.city}/{s.state}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-black uppercase tracking-wider text-white/70 mb-2">Tipo</p>
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const active = kind === k.value;
                return (
                  <button
                    key={k.value}
                    onClick={() => setKind(k.value)}
                    className={`h-14 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition active:scale-[0.98] ${
                      active ? "bg-white/15 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.5)]" : "bg-white/5 border-white/15"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-amber-300" : "text-white/70"}`} />
                    <span className="text-[10px] font-black">{k.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Título do aviso"
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 font-bold"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1200}
              rows={4}
              placeholder="Escreva a informação que precisa chegar nos apps…"
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 font-semibold"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={actionLabel}
                onChange={(e) => setActionLabel(e.target.value)}
                maxLength={40}
                placeholder="Botão (opcional)"
                className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/50 font-bold"
              />
              <Input
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="/rota ou https://…"
                className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/50 font-bold"
              />
            </div>
          </div>

          {reach && (
            <div className="rounded-2xl bg-white/10 border border-white/20 overflow-hidden">
              <div className="px-4 py-3 text-sm font-bold flex items-center gap-2 border-b border-white/15">
                <Users className="h-4 w-4 text-amber-300" />
                {reach.schools} escola(s) · {reach.users} pessoa(s) receberão
                <button
                  onClick={exportPreviewCsv}
                  className="ml-auto shrink-0 h-9 px-3 rounded-xl bg-white/10 border border-amber-300/60 text-amber-300 text-[11px] font-black flex items-center gap-1.5 active:scale-[0.98] transition"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 p-2">
                <button
                  onClick={() => setPreviewTab("cities")}
                  className={`h-10 rounded-xl text-xs font-black border ${previewTab === "cities" ? "bg-white/15 border-amber-300 text-amber-300" : "bg-white/5 border-white/15"}`}
                >
                  Municípios ({reach.cities.length})
                </button>
                <button
                  onClick={() => setPreviewTab("schools")}
                  className={`h-10 rounded-xl text-xs font-black border ${previewTab === "schools" ? "bg-white/15 border-amber-300 text-amber-300" : "bg-white/5 border-white/15"}`}
                >
                  Escolas ({reach.school_list.length})
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto px-2 pb-2 space-y-1">
                {previewTab === "cities"
                  ? reach.cities.map((c) => (
                      <div key={`${c.state}-${c.city}`} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        <p className="text-sm font-black text-wrap break-words">{c.city}/{c.state}</p>
                        <p className="text-[11px] font-bold text-white/60">{c.schools} escola(s) · {c.users} pessoa(s)</p>
                      </div>
                    ))
                  : reach.school_list.map((s) => (
                      <div key={s.id} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        <p className="text-sm font-black text-wrap break-words">{s.name}</p>
                        <p className="text-[11px] font-bold text-white/60">{s.city}/{s.state} · {s.users} pessoa(s)</p>
                      </div>
                    ))}
                {reach.schools === 0 && (
                  <p className="px-3 py-4 text-center text-sm font-bold text-white/60">Nenhuma escola nesse alcance.</p>
                )}
                {reach.truncated && previewTab === "schools" && (
                  <p className="px-3 py-2 text-[11px] font-bold text-amber-300">Mostrando as 500 primeiras escolas.</p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void checkReach()}
              disabled={!scopeReady || loadingReach}
              className="h-14 rounded-2xl bg-white/10 border border-white/25 font-black text-base disabled:opacity-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              {loadingReach ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Ver prévia
            </button>
            <button
              onClick={() => void send()}
              disabled={sending || !scopeReady}
              className="h-14 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-[#0A2A66] font-black text-base shadow-[0_6px_20px_rgba(251,191,36,0.6)] disabled:opacity-60 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AdminBroadcastDialog;
