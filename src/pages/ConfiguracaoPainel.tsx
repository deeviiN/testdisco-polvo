import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Tv, Plus, Trash2, ExternalLink, UserPlus, Copy, MonitorPlay, Wrench, Download } from "lucide-react";
import { buildTvDiagnosticHtml, buildTvLauncherFileName, buildTvLauncherHtml, buildTvLauncherLabel, downloadTextFile } from "@/lib/tvLauncherHtml";

type Settings = {
  school_id: string;
  refresh_seconds: number;
  show_finished: boolean;
  show_absent: boolean;
  highlight_color: string;
  panel_title: string | null;
  marquee_message: string | null;
  tv_brand: string | null;
};

type AssistantClass = { id: string; class_label: string; education_level: string | null; shift: string | null; assistant_user_id: string };
type StaffOption = { user_id: string; full_name: string; role: string };

const DEFAULT: Omit<Settings, "school_id"> = {
  refresh_seconds: 30,
  show_finished: true,
  show_absent: true,
  highlight_color: "#10b981",
  panel_title: null,
  marquee_message: null,
  tv_brand: null,
};

const PUBLISHED_URL = "https://create-your-app-66.lovable.app";
function getPublicOrigin() {
  const rawOrigin = typeof window !== "undefined" ? window.location.origin : PUBLISHED_URL;
  return /id-preview--.*\.lovable\.app$/i.test(rawOrigin) || /\.lovableproject\.com$/i.test(rawOrigin)
    ? PUBLISHED_URL
    : rawOrigin;
}

export default function ConfiguracaoPainel() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState<Settings | null>(null);
  const [tolerance, setTolerance] = useState(20);
  const [classes, setClasses] = useState<AssistantClass[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [newClass, setNewClass] = useState({ label: "", level: "fundamental", shift: "matutino", assistant: "" });
  const [saving, setSaving] = useState(false);
  const [tvBrand, setTvBrand] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [compatBrand, setCompatBrand] = useState<string>("");
  const [compatLink, setCompatLink] = useState("");
  const [schoolMeta, setSchoolMeta] = useState<{ name?: string | null; city?: string | null; state?: string | null } | null>(null);

  const isManager = profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida";

  useEffect(() => {
    if (!profile?.school_id) return;
    (async () => {
      const [{ data: panel }, { data: disc }, { data: cls }, { data: st }, { data: sch }] = await Promise.all([
        supabase.from("panel_settings").select("*").eq("school_id", profile.school_id).maybeSingle(),
        supabase.from("school_discipline_settings").select("checkin_tolerance_minutes").eq("school_id", profile.school_id).maybeSingle(),
        supabase.from("assistant_classes").select("*").eq("school_id", profile.school_id),
        supabase.from("profiles").select("user_id, full_name, role").eq("school_id", profile.school_id).eq("is_approved", true),
        supabase.from("schools").select("name, city, state").eq("id", profile.school_id).maybeSingle(),
      ]);
      setS(panel as Settings ?? { school_id: profile.school_id, ...DEFAULT });
      setSchoolMeta((sch as any) ?? null);
      setTvBrand((panel as any)?.tv_brand ?? "");
      if (disc?.checkin_tolerance_minutes != null) setTolerance(disc.checkin_tolerance_minutes);
      setClasses((cls as AssistantClass[]) ?? []);
      setStaff((st as StaffOption[]) ?? []);
    })();
  }, [profile?.school_id]);

  const save = async () => {
    if (!s || !profile?.school_id) return;
    setSaving(true);
    const payload = { ...s, school_id: profile.school_id, updated_by: profile.user_id, updated_at: new Date().toISOString() };
    const { error: e1 } = await supabase.from("panel_settings").upsert({ ...payload, tv_brand: s.tv_brand } as any, { onConflict: "school_id" });
    const { error: e2 } = await supabase
      .from("school_discipline_settings")
      .upsert({ school_id: profile.school_id, checkin_tolerance_minutes: tolerance, updated_by: profile.user_id }, { onConflict: "school_id" });
    setSaving(false);
    if (e1 || e2) toast({ title: "Erro ao salvar", description: (e1 || e2)?.message, variant: "destructive" });
    else toast({ title: "Configurações salvas" });
  };

  const addClass = async () => {
    if (!newClass.label.trim() || !newClass.assistant || !profile?.school_id) {
      toast({ title: "Preencha turma e assistente", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("assistant_classes").insert({
      school_id: profile.school_id,
      assistant_user_id: newClass.assistant,
      class_label: newClass.label.trim(),
      education_level: newClass.level,
      shift: newClass.shift,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setNewClass({ label: "", level: "fundamental", shift: "matutino", assistant: "" });
    const { data } = await supabase.from("assistant_classes").select("*").eq("school_id", profile.school_id);
    setClasses((data as AssistantClass[]) ?? []);
  };

  const removeClass = async (id: string) => {
    const { error } = await supabase.from("assistant_classes").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setClasses((c) => c.filter((x) => x.id !== id));
  };

  const gerarLink = () => {
    if (!tvBrand) {
      toast({ title: "Selecione uma marca de TV!", variant: "destructive" });
      return;
    }
    const base = `${getPublicOrigin()}/painel-tv?school=${profile?.school_id}&tv=${tvBrand}`;
    setGeneratedLink(base);
    navigator.clipboard.writeText(base).then(() => {
      toast({ title: "Link copiado com sucesso!" });
    }).catch((err) => {
      toast({ title: "Erro ao copiar o link", description: String(err), variant: "destructive" });
    });
  };

  if (!isManager || !s) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-xl font-bold">{!isManager ? "Sem permissão" : "Carregando..."}</h1>
        {!isManager && (
          <button onClick={() => navigate(-1)} className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold">Voltar</button>
        )}
      </div>
    );
  }

  const assistants = staff.filter((p) => p.role === "assistente" || p.role === "secretario_escolar");

  return (
    <div className="min-h-dvh bg-background pb-32">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-md">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Configuração do Painel</h1>
          <p className="text-xs opacity-80">Painel TV, tolerância e assistentes</p>
        </div>
        <a
          href={`/painel-tv?school=${profile?.school_id}`}
          target="_blank" rel="noreferrer"
          className="p-2 rounded-full hover:bg-white/10"
          title="Abrir Painel TV"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
      </header>

      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        {/* Painel TV */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Tv className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Painel TV</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Atualização (s)</span>
              <input type="number" min={5} max={300} value={s.refresh_seconds}
                onChange={(e) => setS({ ...s, refresh_seconds: Number(e.target.value) })}
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Tolerância (min)</span>
              <input type="number" min={0} max={120} value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase text-muted-foreground">Título do painel</span>
            <input type="text" value={s.panel_title ?? ""}
              onChange={(e) => setS({ ...s, panel_title: e.target.value })}
              placeholder="Padrão: nome da escola"
              className="w-full h-11 px-3 rounded-xl border bg-background mt-1" />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase text-muted-foreground">Mensagem (marquee)</span>
            <input type="text" value={s.marquee_message ?? ""}
              onChange={(e) => setS({ ...s, marquee_message: e.target.value })}
              placeholder="Comunicado opcional"
              className="w-full h-11 px-3 rounded-xl border bg-background mt-1" />
          </label>

          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.show_finished} onChange={(e) => setS({ ...s, show_finished: e.target.checked })} />
              <span className="text-sm">Mostrar finalizados</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.show_absent} onChange={(e) => setS({ ...s, show_absent: e.target.checked })} />
              <span className="text-sm">Mostrar ausentes</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm">Destaque</span>
              <input type="color" value={s.highlight_color} onChange={(e) => setS({ ...s, highlight_color: e.target.value })}
                className="h-9 w-12 rounded border" />
            </label>
          </div>

          {/* Gerar link para TV */}
          <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">Link para TV (rotação)</span>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Marca da TV</span>
              <select
                value={tvBrand}
                onChange={(e) => setTvBrand(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
              >
                <option value="">Selecione</option>
                <option value="android">Android TV</option>
                <option value="toshiba">Toshiba</option>
              </select>
            </label>

            <button
              onClick={gerarLink}
              className="w-full h-12 rounded-xl bg-amber-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-amber-600 transition"
            >
              <Copy className="h-4 w-4" />
              Copiar link (rotação)
            </button>

            {generatedLink && (
              <label className="block">
                <span className="text-xs font-bold uppercase text-muted-foreground">Link Gerado</span>
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="w-full h-11 px-3 rounded-xl border bg-background mt-1 text-xs"
                />
              </label>
            )}
          </div>

          {/* Compatibilidade da TV */}
          <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">📺 Compatibilidade da TV</span>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Sistema da TV</span>
              <select
                value={compatBrand}
                onChange={(e) => setCompatBrand(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
              >
                <option value="">Selecione</option>
                <option value="android">Android TV</option>
                <option value="vidaa">Toshiba VIDAA</option>
                <option value="tizen">Samsung Tizen</option>
                <option value="webos">LG WebOS</option>
                <option value="roku">Roku TV</option>
                <option value="linux">Linux Genérico</option>
                <option value="web">Navegador Web</option>
              </select>
            </label>

            <button
              onClick={() => {
                if (!compatBrand) {
                  toast({ title: "Selecione o sistema da TV!", variant: "destructive" });
                  return;
                }
                const base = generatedLink || `${getPublicOrigin()}/painel-tv?school=${profile?.school_id}`;
                const url = new URL(base);
                url.searchParams.set("tv", compatBrand);
                url.searchParams.set("kiosk", "1");
                if (compatBrand === "tizen" || compatBrand === "webos" || compatBrand === "vidaa") {
                  url.searchParams.set("legacy", "1");
                }
                const final = url.toString();
                setCompatLink(final);
                navigator.clipboard.writeText(final)
                  .then(() => toast({ title: "Link compatível com sua TV copiado com sucesso." }))
                  .catch((err) => toast({ title: "Erro ao copiar", description: String(err), variant: "destructive" }));
              }}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 transition"
            >
              <Wrench className="h-4 w-4" />
              🔧 Gerar Link Compatível
            </button>

            {compatLink && (
              <label className="block">
                <span className="text-xs font-bold uppercase text-muted-foreground">Link compatível</span>
                <input type="text" value={compatLink} readOnly
                  className="w-full h-11 px-3 rounded-xl border bg-background mt-1 text-xs" />
              </label>
            )}

            <button
              onClick={() => {
                const base = compatLink || `${getPublicOrigin()}/painel-tv?school=${profile?.school_id}`;
                const url = new URL(base);
                if (compatBrand) {
                  url.searchParams.set("tv", compatBrand);
                  url.searchParams.set("kiosk", "1");
                  if (compatBrand === "tizen" || compatBrand === "webos" || compatBrand === "vidaa") url.searchParams.set("legacy", "1");
                }
                const html = buildTvLauncherHtml(url.toString(), buildTvLauncherLabel(schoolMeta));
                const fname = buildTvLauncherFileName(schoolMeta);
                downloadTextFile(fname, html);
                toast({ title: "Arquivo gerado", description: fname });
              }}
              className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition"
            >
              <Download className="h-4 w-4" />
              💾 Baixar Arquivo para Pendrive
            </button>

            <button
              onClick={() => {
                downloadTextFile("TESTE.HTM", buildTvDiagnosticHtml());
                toast({ title: "Arquivo TESTE.HTM gerado", description: "Use primeiro para confirmar se a TV reconhece HTML no USB." });
              }}
              className="w-full h-11 rounded-xl border bg-background font-bold flex items-center justify-center gap-2 hover:bg-muted transition"
            >
              <Download className="h-4 w-4" />
              🧪 Baixar teste de reconhecimento
            </button>

            <button
              onClick={async () => {
                const { buildTvBoxDiagnosticHtml, buildTvDiagnosticFileName } = await import("@/lib/tvLauncherHtml");
                downloadTextFile(buildTvDiagnosticFileName(), buildTvBoxDiagnosticHtml());
                toast({ title: "DIAG.HTM gerado", description: "Copie junto no pendrive p/ conferir FAT32, .htm, JS, localStorage e bloqueio de redirecionamento." });
              }}
              className="w-full h-11 rounded-xl border bg-background font-bold flex items-center justify-center gap-2 hover:bg-muted transition"
            >
              <Download className="h-4 w-4" />
              🩺 Baixar diagnóstico completo (DIAG.HTM)
            </button>


            <p className="text-[11px] text-muted-foreground leading-snug">
              Primeiro abra TESTE.HTM na TV. Se ele não aparecer, a USB da TV só reconhece mídia; abra pelo navegador da TV ou use QR Code/link direto.
            </p>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </section>

        {/* Turmas dos assistentes */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Turmas dos Assistentes</h2>
          </div>

          {assistants.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum usuário com papel "assistente" aprovado. Aprove o cadastro primeiro.</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Turma (ex.: 9º A)" value={newClass.label}
              onChange={(e) => setNewClass({ ...newClass, label: e.target.value })}
              className="h-11 px-3 rounded-xl border bg-background col-span-2" />
            <select value={newClass.level} onChange={(e) => setNewClass({ ...newClass, level: e.target.value })}
              className="h-11 px-3 rounded-xl border bg-background">
              <option value="fundamental">Fundamental</option>
              <option value="medio">Médio</option>
              <option value="eja">EJA</option>
            </select>
            <select value={newClass.shift} onChange={(e) => setNewClass({ ...newClass, shift: e.target.value })}
              className="h-11 px-3 rounded-xl border bg-background">
              <option value="matutino">Matutino</option>
              <option value="vespertino">Vespertino</option>
              <option value="noturno">Noturno</option>
            </select>
            <select value={newClass.assistant} onChange={(e) => setNewClass({ ...newClass, assistant: e.target.value })}
              className="h-11 px-3 rounded-xl border bg-background col-span-2">
              <option value="">Selecionar assistente...</option>
              {assistants.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
            </select>
            <button onClick={addClass}
              className="col-span-2 h-11 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Vincular
            </button>
          </div>

          <div className="space-y-2 mt-2">
            {classes.map((c) => {
              const name = staff.find((s) => s.user_id === c.assistant_user_id)?.full_name || "—";
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border">
                  <div className="min-w-0">
                    <p className="font-bold break-words">{c.class_label}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {name} · {c.education_level} · {c.shift}
                    </p>
                  </div>
                  <button onClick={() => removeClass(c.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-full">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
