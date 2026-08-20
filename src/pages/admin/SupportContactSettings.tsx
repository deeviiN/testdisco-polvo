import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Headphones, Save, Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { updateSupportCache } from "@/hooks/useSupportContact";

function formatLabel(digits: string): string {
  // 5511925686565 -> (11) 92568-6565
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return digits;
}

export default function SupportContactSettings() {
  const navigate = useNavigate();
  const [whatsapp, setWhatsapp] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("support_settings")
        .select("whatsapp_number, display_label")
        .eq("id", true)
        .maybeSingle();
      if (data) {
        setWhatsapp(data.whatsapp_number);
        setLabel(data.display_label);
      }
      setLoading(false);
    })();
  }, []);

  const handleWhatsappChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 13);
    setWhatsapp(digits);
    setLabel(formatLabel(digits));
  };

  const handleSave = async () => {
    if (whatsapp.length < 10) {
      toast.error("Número inválido. Inclua DDI + DDD + número (ex: 5511925686565)");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("support_settings")
      .update({ whatsapp_number: whatsapp, display_label: label, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    updateSupportCache({ whatsapp_number: whatsapp, display_label: label });
    toast.success("Número de suporte atualizado!");
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Headphones className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Contato de Suporte</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-bold text-base mb-1">WhatsApp de Suporte</h2>
            <p className="text-sm text-muted-foreground">
              Este número é usado em toda a plataforma: suporte técnico, recuperação de senha,
              envio de boletos e contato comercial.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">Número WhatsApp (com DDI 55)</Label>
                <Input
                  id="whatsapp"
                  inputMode="numeric"
                  value={whatsapp}
                  onChange={(e) => handleWhatsappChange(e.target.value)}
                  placeholder="5511925686565"
                  className="h-12 text-base font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Digite apenas números: 55 (Brasil) + DDD + número.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="label">Rótulo de exibição</Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="(11) 92568-6565"
                  className="h-12 text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Como o número aparecerá para os usuários.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Pré-visualização</p>
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-bold"
                >
                  <MessageCircle className="h-4 w-4" />
                  {label || whatsapp}
                </a>
              </div>

              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-14 font-bold text-base gap-2"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
