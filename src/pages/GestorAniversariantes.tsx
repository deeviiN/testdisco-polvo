import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Save, Upload, Cake, X, Pencil } from "lucide-react";

type Row = {
  id: string;
  school_id: string;
  nome: string;
  dia: number;
  mes: number;
  cargo: string | null;
  setor: string | null;
  foto_url: string | null;
};

const MESES = [
  "Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez",
];

const empty = { nome: "", dia: 1, mes: 1, cargo: "", setor: "", foto_url: "" };

export default function GestorAniversariantes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showOnTv, setShowOnTv] = useState(false);

  const canManage =
    profile?.role === "gestor_pedagogico" ||
    profile?.role === "chef_projeto_vida" ||
    profile?.role === "secretario_escolar";

  const load = async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    const [{ data }, { data: panel }] = await Promise.all([
      supabase
        .from("servidores_aniversariantes")
        .select("*")
        .eq("school_id", profile.school_id)
        .order("mes")
        .order("dia"),
      supabase
        .from("panel_settings")
        .select("mostrar_aniv_servidores")
        .eq("school_id", profile.school_id)
        .maybeSingle(),
    ]);
    setRows((data as Row[]) ?? []);
    setShowOnTv(!!(panel as any)?.mostrar_aniv_servidores);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  const toggleTv = async (v: boolean) => {
    if (!profile?.school_id) return;
    setShowOnTv(v);
    const { error } = await supabase
      .from("panel_settings")
      .upsert(
        { school_id: profile.school_id, mostrar_aniv_servidores: v, updated_by: profile.user_id },
        { onConflict: "school_id" },
      );
    if (error) {
      setShowOnTv(!v);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const uploadFoto = async (file: File): Promise<string | null> => {
    if (!profile?.school_id) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Foto muito grande", description: "Máx. 5 MB", variant: "destructive" });
      return null;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    // IMPORTANTE: school_id precisa ser o 1º segmento (exigência da RLS do bucket)
    const path = `${profile.school_id}/aniversariantes/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("school-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      return null;
    }
    const { data } = supabase.storage.from("school-logos").getPublicUrl(path);
    return data.publicUrl;
  };

  const salvar = async () => {
    if (!editing || !profile?.school_id) return;
    const nome = (editing.nome || "").trim();
    const dia = Number(editing.dia);
    const mes = Number(editing.mes);
    if (nome.length < 2 || nome.length > 100) {
      toast({ title: "Nome inválido", description: "2–100 caracteres.", variant: "destructive" });
      return;
    }
    if (!(dia >= 1 && dia <= 31) || !(mes >= 1 && mes <= 12)) {
      toast({ title: "Data inválida", variant: "destructive" });
      return;
    }
    const payload = {
      school_id: profile.school_id,
      nome,
      dia,
      mes,
      cargo: (editing.cargo || "").trim().slice(0, 60) || null,
      setor: (editing.setor || "").trim().slice(0, 60) || null,
      foto_url: editing.foto_url || null,
    };
    const q = editing.id
      ? supabase.from("servidores_aniversariantes").update(payload).eq("id", editing.id)
      : supabase.from("servidores_aniversariantes").insert({ ...payload, created_by: profile.user_id });
    const { error } = await q;
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Atualizado" : "Cadastrado" });
    setEditing(null);
    load();
  };

  const remover = async (id: string) => {
    if (!confirm("Remover este aniversariante?")) return;
    const { error } = await supabase.from("servidores_aniversariantes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
  };

  if (!canManage) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <button onClick={() => navigate(-1)} className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold">Voltar</button>
      </div>
    );
  }

  // Agrupa por mês para leitura moderna, mantendo a ordem já ordenada por (mes,dia)
  const grupos = MESES.map((m, i) => ({
    mes: i + 1,
    label: m,
    items: rows.filter((r) => r.mes === i + 1),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="relative min-h-dvh pb-32 overflow-hidden bg-[hsl(220,50%,18%)]">
      {/* Fundo azul com brilhos dourados degradê */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 60% at 90% -10%, hsl(45 90% 60% / 0.28), transparent 60%)," +
            "radial-gradient(70% 50% at -10% 10%, hsl(45 85% 55% / 0.18), transparent 65%)," +
            "radial-gradient(80% 60% at 50% 110%, hsl(45 90% 55% / 0.14), transparent 65%)," +
            "linear-gradient(180deg, hsl(220 55% 22%) 0%, hsl(220 55% 16%) 60%, hsl(220 60% 12%) 100%)",
        }}
      />
      {/* Grão sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(hsl(0 0% 100%) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />

      <header className="relative sticky top-0 z-10 backdrop-blur-md bg-[hsl(220,55%,18%)]/70 border-b border-white/10 shadow-lg">
        {/* faixa com brilho dourado */}
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 140% at 95% 0%, hsl(45 95% 60% / 0.35), transparent 60%)," +
                "radial-gradient(50% 140% at 0% 100%, hsl(45 90% 55% / 0.20), transparent 60%)",
            }}
          />
          <div className="relative px-4 py-3 flex items-center gap-3 text-white">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold leading-tight flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[hsl(220,55%,18%)] shadow-[0_0_20px_hsl(45_90%_60%/0.5)]">
                  <Cake className="h-4 w-4" />
                </span>
                <span className="bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent">
                  Aniversariantes
                </span>
              </h1>
              <p className="text-xs opacity-80">Servidores exibidos no Painel TV</p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/15 backdrop-blur px-3 h-7 text-xs font-semibold">
              {rows.length} {rows.length === 1 ? "cadastro" : "cadastros"}
            </span>
          </div>
        </div>
      </header>

      <div className="relative p-4 space-y-4 max-w-3xl mx-auto">
        {/* Toggle TV — card com destaque quando ativo */}
        <section
          className={`rounded-2xl border p-4 flex items-center justify-between transition-colors ${
            showOnTv
              ? "bg-emerald-500/5 border-emerald-500/40 ring-1 ring-emerald-500/20"
              : "bg-card"
          }`}
        >
          <div className="pr-3">
            <p className="font-bold flex items-center gap-2">
              Mostrar no Painel TV
              {showOnTv && (
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 h-5 text-[10px] font-bold uppercase tracking-wide">
                  Ativo
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exibe os servidores no dia do aniversário (antecipa fim de semana / feriado na sexta).
            </p>
          </div>
          <button
            onClick={() => toggleTv(!showOnTv)}
            className={`relative h-7 w-12 rounded-full transition-colors shrink-0 ${showOnTv ? "bg-emerald-500" : "bg-muted"}`}
            aria-pressed={showOnTv}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${showOnTv ? "left-6" : "left-1"}`} />
          </button>
        </section>

        {/* Botão adicionar */}
        <button
          onClick={() => setEditing({ ...empty })}
          className="group w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.99] transition"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 group-hover:bg-white/25 transition">
            <Plus className="h-4 w-4" />
          </span>
          Cadastrar servidor
        </button>

        {/* Lista agrupada por mês */}
        {loading ? (
          <section className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Carregando…
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-2xl border bg-card p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Cake className="h-6 w-6" />
            </div>
            <p className="font-bold">Nenhum servidor cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Toque em "Cadastrar servidor" para começar.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <section key={g.mes} className="rounded-2xl border bg-card overflow-hidden">
                <header className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    {g.items.length} {g.items.length === 1 ? "servidor" : "servidores"}
                  </span>
                </header>
                <ul className="divide-y">
                  {g.items.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                    >
                      {/* Avatar com anel */}
                      <div className="relative shrink-0">
                        {r.foto_url ? (
                          <img
                            src={r.foto_url}
                            alt={r.nome}
                            className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/20"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center font-bold text-primary ring-2 ring-primary/20">
                            {r.nome.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        {/* Badge do dia sobre o avatar */}
                        <span className="absolute -bottom-1 -right-1 h-6 min-w-6 px-1 rounded-full bg-amber-400 text-primary text-[11px] font-bold flex items-center justify-center shadow ring-2 ring-card">
                          {String(r.dia).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-bold break-words leading-tight">{r.nome}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {r.cargo && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 h-5 text-[11px] font-medium">
                              {r.cargo}
                            </span>
                          )}
                          {r.setor && (
                            <span className="inline-flex items-center rounded-full bg-muted text-foreground/70 px-2 h-5 text-[11px] font-medium">
                              {r.setor}
                            </span>
                          )}
                          {!r.cargo && !r.setor && (
                            <span className="text-[11px] text-muted-foreground">
                              🎂 {String(r.dia).padStart(2, "0")}/{MESES[r.mes - 1]}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setEditing(r)}
                        className="p-2 rounded-full hover:bg-muted"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remover(r.id)}
                        className="p-2 rounded-full text-destructive hover:bg-destructive/10"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>


      {/* Modal editar/criar */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl border shadow-xl p-5 space-y-4 max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/90 text-primary">
                  <Cake className="h-4 w-4" />
                </span>
                {editing.id ? "Editar servidor" : "Novo servidor"}
              </h2>
              <button onClick={() => setEditing(null)} className="p-2 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            {/* Foto */}
            <div className="flex items-center gap-3">
              {editing.foto_url ? (
                <img src={editing.foto_url} alt="" className="h-16 w-16 rounded-full object-cover border" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Cake className="h-6 w-6" />
                </div>
              )}
              <label className="flex-1 h-11 px-3 rounded-xl border bg-background font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" />
                {uploading ? "Enviando..." : editing.foto_url ? "Trocar foto" : "Enviar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await uploadFoto(f);
                    if (url) setEditing((s) => ({ ...s!, foto_url: url }));
                  }}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Nome *</span>
              <input
                type="text"
                maxLength={100}
                value={editing.nome ?? ""}
                onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-muted-foreground">Dia *</span>
                <input
                  type="number" min={1} max={31}
                  value={editing.dia ?? ""}
                  onChange={(e) => setEditing({ ...editing, dia: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-muted-foreground">Mês *</span>
                <select
                  value={editing.mes ?? 1}
                  onChange={(e) => setEditing({ ...editing, mes: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
                >
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{i + 1} - {m}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Cargo</span>
              <input
                type="text" maxLength={60}
                value={editing.cargo ?? ""}
                onChange={(e) => setEditing({ ...editing, cargo: e.target.value })}
                placeholder="Ex.: Professor, Secretária…"
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-muted-foreground">Setor</span>
              <input
                type="text" maxLength={60}
                value={editing.setor ?? ""}
                onChange={(e) => setEditing({ ...editing, setor: e.target.value })}
                placeholder="Ex.: Coord. Pedagógica"
                className="w-full h-11 px-3 rounded-xl border bg-background mt-1"
              />
            </label>

            <button
              onClick={salvar}
              disabled={uploading}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
