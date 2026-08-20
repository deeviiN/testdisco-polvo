import { useRef, useState } from "react";
import { Camera, ShieldCheck, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  userId: string;
  fullName: string;
  onDone: () => void;
}

export default function CommunityIdGate({ userId, fullName, onDone }: Props) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const pick = (side: "front" | "back", file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 8MB.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(file);
    if (side === "front") { setFront(file); setFrontPreview(url); }
    else { setBack(file); setBackPreview(url); }
  };

  const submit = async () => {
    if (!front || !back) return;
    setUploading(true);
    try {
      const fExt = (front.name.split(".").pop() || "jpg").toLowerCase();
      const bExt = (back.name.split(".").pop() || "jpg").toLowerCase();
      const frontPath = `${userId}/front.${fExt}`;
      const backPath = `${userId}/back.${bExt}`;

      const up1 = await supabase.storage.from("community-id-docs").upload(frontPath, front, { upsert: true, contentType: front.type });
      if (up1.error) throw up1.error;
      const up2 = await supabase.storage.from("community-id-docs").upload(backPath, back, { upsert: true, contentType: back.type });
      if (up2.error) throw up2.error;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          id_doc_front_path: frontPath,
          id_doc_back_path: backPath,
          id_doc_uploaded_at: new Date().toISOString(),
        } as any)
        .eq("user_id", userId);
      if (updErr) throw updErr;

      toast({ title: "Documento enviado", description: "A gestora vai conferir." });
      onDone();
    } catch (e: any) {
      toast({ title: "Falha no envio", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const Tile = ({ side, file, preview, label }: { side: "front" | "back"; file: File | null; preview: string | null; label: string }) => (
    <button
      type="button"
      onClick={() => (side === "front" ? frontRef : backRef).current?.click()}
      className="relative w-full aspect-[3/2] rounded-2xl border-2 border-dashed border-white/30 bg-white/5 overflow-hidden flex items-center justify-center hover:bg-white/10 transition"
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="w-full h-full object-cover" />
          <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="h-3.5 w-3.5 text-white" />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-white/70">
          <Camera className="h-7 w-7" />
          <span className="text-xs font-semibold">{label}</span>
          <span className="text-[10px] text-white/40">Toque para tirar foto</span>
        </div>
      )}
    </button>
  );

  return (
    <div className="min-h-dvh bg-[hsl(220,50%,28%)] px-4 py-6 flex flex-col">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col gap-4">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-8 w-8 text-amber-300" />
          </div>
          <h1 className="text-xl font-bold text-white">Envio do documento</h1>
          <p className="text-xs text-white/70 leading-snug">
            Olá, <strong>{fullName}</strong>. Como você não faz parte da escola, a gestora precisa conhecer
            quem está usando o ambiente. Envie a <strong>foto da frente e do verso</strong> do seu RG ou CNH.
          </p>
        </div>

        <Card className="border-0 bg-white/5">
          <CardContent className="p-3 space-y-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-white/80">Frente do documento</p>
              <Tile side="front" file={front} preview={frontPreview} label="Frente" />
              <input ref={frontRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => pick("front", e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-white/80">Verso do documento</p>
              <Tile side="back" file={back} preview={backPreview} label="Verso" />
              <input ref={backRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => pick("back", e.target.files?.[0] || null)} />
            </div>
          </CardContent>
        </Card>

        <p className="text-[10px] text-white/50 text-center leading-snug">
          Suas fotos ficam visíveis apenas para você, a gestão da escola e o administrador.
        </p>

        <div className="mt-auto pt-2">
          <Button
            type="button"
            disabled={!front || !back || uploading}
            onClick={submit}
            className="w-full h-14 rounded-2xl font-bold text-base bg-amber-400 hover:bg-amber-300 text-[hsl(220,50%,18%)] disabled:opacity-50"
          >
            {uploading ? (<><Loader2 className="h-5 w-5 animate-spin mr-2" />Enviando...</>) : "Enviar documento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
