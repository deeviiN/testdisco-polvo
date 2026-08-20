import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Componente para o admin enviar a sua assinatura em PNG (preferencialmente fundo
 * transparente). A imagem é gravada como data URL em company_settings.admin_signature_path
 * e aparece automaticamente em todo contrato gerado/assinado por gestor.
 */
export default function AdminSignatureUploader() {
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("company_settings").select("id, admin_signature_path").limit(1).maybeSingle();
      setCurrent((data as any)?.admin_signature_path || null);
      setLoading(false);
    })();
  }, []);

  const upload = async (file: File) => {
    if (!file) return;
    if (file.size > 500 * 1024) { toast.error("Imagem grande demais (máx 500KB)."); return; }
    if (!file.type.startsWith("image/")) { toast.error("Envie um arquivo de imagem (PNG)."); return; }
    setSaving(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const { data: existing } = await supabase.from("company_settings").select("id").limit(1).maybeSingle();
      let res;
      if ((existing as any)?.id) {
        res = await supabase.from("company_settings").update({ admin_signature_path: dataUrl } as any).eq("id", (existing as any).id);
      } else {
        res = await supabase.from("company_settings").insert({ admin_signature_path: dataUrl } as any);
      }
      if (res.error) throw res.error;
      setCurrent(dataUrl);
      toast.success("Assinatura salva — aparecerá em todo contrato.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!confirm("Remover assinatura atual?")) return;
    setSaving(true);
    const { data: existing } = await supabase.from("company_settings").select("id").limit(1).maybeSingle();
    if ((existing as any)?.id) {
      await supabase.from("company_settings").update({ admin_signature_path: null } as any).eq("id", (existing as any).id);
    }
    setCurrent(null); setSaving(false);
    toast.success("Assinatura removida.");
  };

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-extrabold text-base">✍️ Sua assinatura (CONTRATANTE)</h3>
        {current && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        Envie sua assinatura em <strong>PNG com fundo transparente</strong> (recomendado: 600×200px).
        Ela será aplicada automaticamente em <strong>todo contrato</strong> aceito por qualquer gestor.
      </p>
      {current && (
        <div className="rounded-lg border bg-white p-3 flex items-center justify-center min-h-[80px]">
          <img src={current} alt="Assinatura atual" className="max-h-20 max-w-full" />
        </div>
      )}
      <div className="flex gap-2">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={saving}
          className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {current ? "Substituir" : "Enviar assinatura PNG"}
        </button>
        {current && (
          <button onClick={remove} disabled={saving}
            className="h-11 px-3 rounded-lg bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-60">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
