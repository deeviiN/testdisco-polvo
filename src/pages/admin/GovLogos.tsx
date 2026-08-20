import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Upload, ShieldCheck } from "lucide-react";

interface GovLogo {
  id: string;
  scope: "estadual" | "federal" | "municipal";
  state: string | null;
  city: string | null;
  label: string;
  logo_url: string;
  is_active: boolean;
}

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export default function GovLogosAdmin() {
  const { toast } = useToast();
  const [items, setItems] = useState<GovLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"estadual" | "federal" | "municipal">("estadual");
  const [state, setState] = useState("RR");
  const [city, setCity] = useState("");
  const [label, setLabel] = useState("Governo do Estado de Roraima");
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gov_logos" as any)
      .select("*")
      .order("scope")
      .order("state");
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setItems(((data as any) || []) as GovLogo[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Envie uma imagem (PNG/JPG/SVG).", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const key =
        scope === "federal"
          ? `federal/mec.${ext}`
          : scope === "estadual"
          ? `estadual/${state}.${ext}`
          : `municipal/${state}-${city.toLowerCase().replace(/\s+/g, "-")}.${ext}`;
      const path = `catalog/${key}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("gov-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("gov-logos").getPublicUrl(path);

      const payload: any = {
        scope,
        state: scope === "federal" ? null : state,
        city: scope === "municipal" ? city : null,
        label: label.trim() || (scope === "federal" ? "Governo Federal" : `Governo de ${state}`),
        logo_url: pub.publicUrl,
        is_active: true,
        updated_by: (await supabase.auth.getUser()).data.user?.id,
      };

      // upsert manual: tenta atualizar existente; se não existir, insere
      let existing: any = null;
      if (scope === "federal") {
        const { data } = await supabase.from("gov_logos" as any).select("id").eq("scope", "federal").maybeSingle();
        existing = data;
      } else if (scope === "estadual") {
        const { data } = await supabase.from("gov_logos" as any).select("id").eq("scope", "estadual").eq("state", state).maybeSingle();
        existing = data;
      } else {
        const { data } = await supabase.from("gov_logos" as any).select("id").eq("scope", "municipal").eq("state", state).eq("city", city).maybeSingle();
        existing = data;
      }
      if (existing?.id) {
        const { error } = await supabase.from("gov_logos" as any).update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gov_logos" as any).insert(payload);
        if (error) throw error;
      }
      toast({ title: "Logo salva!", description: "Aparece automaticamente nos PDFs das escolas." });
      load();
    } catch (e: any) {
      toast({ title: "Falha ao enviar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta logo do catálogo? As escolas voltarão a ficar sem logo de governo até você subir outra.")) return;
    const { error } = await supabase.from("gov_logos" as any).delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="min-h-dvh bg-background p-4 pb-32">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Logos oficiais de governo</h1>
            <p className="text-sm text-muted-foreground">Catálogo central usado nos PDFs (cabeçalho). Cada gestor ainda pode substituir pela própria.</p>
          </div>
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Adicionar / substituir</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label>Esfera</Label>
              <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="w-full h-10 rounded-md border bg-background px-2">
                <option value="estadual">Estadual</option>
                <option value="municipal">Municipal</option>
                <option value="federal">Federal (MEC)</option>
              </select>
            </div>
            {scope !== "federal" && (
              <div>
                <Label>UF</Label>
                <select value={state} onChange={(e) => setState(e.target.value)} className="w-full h-10 rounded-md border bg-background px-2">
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
            {scope === "municipal" && (
              <div>
                <Label>Município</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Boa Vista" />
              </div>
            )}
            <div className={scope === "federal" ? "sm:col-span-3" : scope === "municipal" ? "sm:col-span-1" : "sm:col-span-2"}>
              <Label>Legenda</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Governo do Estado de Roraima" />
            </div>
          </div>
          <label className="flex">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading || (scope === "municipal" && !city)}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ""; }}
            />
            <span className="inline-flex items-center gap-2 h-12 px-5 rounded-md bg-primary text-primary-foreground font-bold cursor-pointer">
              <Upload className="h-5 w-5" />{uploading ? "Enviando..." : "Escolher imagem e salvar"}
            </span>
          </label>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold mb-3">Catálogo atual ({items.length})</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma logo cadastrada ainda.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 p-3 rounded-md border">
                  <img src={it.logo_url} alt={it.label} className="h-14 w-14 object-contain bg-white rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase text-muted-foreground">{it.scope}{it.state ? ` • ${it.state}` : ""}{it.city ? ` • ${it.city}` : ""}</div>
                    <div className="font-semibold text-sm break-words">{it.label}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(it.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
