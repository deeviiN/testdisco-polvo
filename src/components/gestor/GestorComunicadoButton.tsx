import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Loader2, X, Download, Copy, Share2, Pencil, Save, Languages } from "lucide-react";
import jsPDF from "jspdf";
import { useAuth } from "@/hooks/useAuth";
import { buildOfficialHeader } from "@/lib/officialHeader";
import { resolveGovLogoUrl, loadImageDataUrl } from "@/lib/govLogo";

type Lang = "pt" | "en" | "es";

interface SchoolInfo {
  name: string;
  city: string;
  state: string;
  logo_url: string | null;
  address: string | null;
  network: string | null;
  gov_logo_url?: string | null;
}

interface Props {
  bookingId: string;
  eventType: string;            // "evento_externo" | "reuniao" | ...
  sector: string;
  sectorLabel: string;
  bookingDate: string;          // yyyy-MM-dd
  startTime: string;            // HH:mm
  endTime: string;              // HH:mm
  topic?: string | null;
  description?: string | null;
  visitorName?: string | null;
  visitorInfo?: string | null;
  requesterName?: string | null;
  originalRequest?: string | null;
  initialComunicado?: string | null;
  variant?: "amber" | "primary";
}

const langLabels: Record<Lang, string> = { pt: "Português", en: "English", es: "Español" };
const langFlags: Record<Lang, string> = { pt: "🇧🇷", en: "🇺🇸", es: "🇪🇸" };
const normalizeText = (text?: string | null) => (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export default function GestorComunicadoButton(p: Props) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comunicado, setComunicado] = useState<string | null>(() => {
    if (p.initialComunicado && normalizeText(p.initialComunicado) !== normalizeText(p.originalRequest)) {
      return p.initialComunicado;
    }
    return null;
  });
  const [editText, setEditText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [translations, setTranslations] = useState<Record<Lang, string | null>>({ pt: null, en: null, es: null });
  const [activeLang, setActiveLang] = useState<Lang>("pt");
  const [translatingLang, setTranslatingLang] = useState<Lang | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [govLogoBase64, setGovLogoBase64] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  const currentText = (activeLang === "pt" ? comunicado : translations[activeLang]) || comunicado;

  // Load school
  useEffect(() => {
    if (!open || !profile?.school_id) return;
    supabase
      .from("schools")
      .select("name, city, state, logo_url, address, network, gov_logo_url")
      .eq("id", profile.school_id)
      .single()
      .then(({ data }) => { if (data) setSchool(data as SchoolInfo); });
  }, [open, profile?.school_id]);

  // Logo
  useEffect(() => {
    if (!school?.logo_url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (ctx) { ctx.drawImage(img, 0, 0); setLogoBase64(c.toDataURL("image/png")); }
    };
    img.src = school.logo_url;
  }, [school?.logo_url]);

  // Gov logo
  useEffect(() => {
    if (!school) return;
    (async () => {
      const url = await resolveGovLogoUrl({
        network: school.network, state: school.state, city: school.city, overrideUrl: school.gov_logo_url,
      });
      const data = await loadImageDataUrl(url);
      setGovLogoBase64(data);
    })();
  }, [school]);

  // Signature
  useEffect(() => {
    if (!open || !profile) return;
    const sigUrl = (profile as any).signature_url;
    if (!sigUrl) return;
    (async () => {
      const { getSignedSignatureUrl } = await import("@/lib/signatureUrl");
      const signedUrl = await getSignedSignatureUrl(sigUrl);
      if (!signedUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (ctx) { ctx.drawImage(img, 0, 0); setSignatureBase64(c.toDataURL("image/png")); }
      };
      img.src = signedUrl;
    })();
  }, [open, profile]);

  const formatDateBR = (d: string) => {
    try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; } catch { return d; }
  };

  const generate = async () => {
    setOpen(true);
    if (comunicado) return;
    setLoading(true);
    try {
      const dates = formatDateBR(p.bookingDate);
      const times = `${p.startTime?.slice(0, 5)} - ${p.endTime?.slice(0, 5)}`;
      const payload = {
        eventType: p.eventType === "evento_externo" ? "comunicado_evento_externo" : p.eventType,
        eventName: p.topic || p.visitorName || "",
        audience: p.visitorName || "",
        department: p.description || p.visitorInfo || "",
        sector: p.sector,
        dates,
        times,
        requesterName: p.requesterName || profile?.full_name || "",
        originalRequest: p.originalRequest || "",
      };
      const { data, error } = await supabase.functions.invoke("generate-comunicado", { body: payload });
      if (error || data?.error) {
        toast.error(data?.error || "Erro ao gerar comunicado.");
        return;
      }
      setComunicado(data.comunicado);
      setEditText(data.comunicado);
      // Persist on booking when first generated
      try {
        await supabase.from("bookings").update({ gestor_announcement: data.comunicado }).eq("id", p.bookingId);
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  };

  const ensureTranslation = async (lang: Lang): Promise<string | null> => {
    if (lang === "pt") return comunicado;
    if (translations[lang]) return translations[lang];
    if (!comunicado) return null;
    setTranslatingLang(lang);
    try {
      const { data, error } = await supabase.functions.invoke("translate-comunicado", {
        body: { text: comunicado, targetLang: lang },
      });
      if (error || data?.error) { toast.error(data?.error || "Erro ao traduzir."); return null; }
      const translated = data.translated as string;
      setTranslations((prev) => ({ ...prev, [lang]: translated }));
      return translated;
    } finally {
      setTranslatingLang(null);
    }
  };

  const handleSelectLang = async (lang: Lang) => {
    if (lang !== "pt" && !translations[lang]) {
      const t = await ensureTranslation(lang);
      if (!t) return;
    }
    setActiveLang(lang);
  };

  const addWatermark = (doc: jsPDF) => {
    if (!logoBase64) return;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const size = Math.min(pageW, pageH) * 0.7;
    const x = (pageW - size) / 2;
    const y = (pageH - size) / 2;
    const gState = (doc as any).GState;
    if (gState) { (doc as any).setGState(new gState({ opacity: 0.06 })); }
    try { doc.addImage(logoBase64, "PNG", x, y, size, size); } catch { /* skip */ }
    if (gState) { (doc as any).setGState(new gState({ opacity: 1 })); }
  };

  const addHeader = (doc: jsPDF): number => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const header = buildOfficialHeader({
      network: (school as any)?.network, state: school?.state, city: school?.city, schoolName: school?.name,
    });
    const lineCount = header.lines.length || 1;
    const barHeight = Math.max(28, 10 + lineCount * 6);
    doc.setFillColor(36, 64, 107);
    doc.rect(0, 0, pageWidth, barHeight, "F");
    let leftPad = 0;
    if (govLogoBase64) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 9, barHeight / 2, 10, "F");
        doc.addImage(govLogoBase64, "PNG", margin, barHeight / 2 - 9, 18, 18);
        leftPad = 24;
      } catch { /* skip */ }
    }
    let rightPad = 0;
    if (logoBase64) {
      try {
        const rx = pageWidth - margin - 9;
        doc.setFillColor(255, 255, 255);
        doc.circle(rx, barHeight / 2, 10, "F");
        doc.addImage(logoBase64, "PNG", pageWidth - margin - 18, barHeight / 2 - 9, 18, 18);
        rightPad = 24;
      } catch { /* skip */ }
    }
    const textX = margin + leftPad;
    const textMaxW = pageWidth - textX - margin - rightPad;
    let y = (barHeight - lineCount * 5) / 2 + 4;
    doc.setTextColor(255, 255, 255);
    if (header.governo) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(doc.splitTextToSize(header.governo.toUpperCase(), textMaxW)[0], textX, y); y += 5;
    }
    if (header.secretaria) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(220, 230, 245);
      doc.text(doc.splitTextToSize(header.secretaria, textMaxW)[0], textX, y); y += 5;
    }
    if (header.escola) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
      doc.text(doc.splitTextToSize(header.escola, textMaxW)[0], textX, y);
    }
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    doc.line(margin, barHeight + 6, pageWidth - margin, barHeight + 6);
    return barHeight + 14;
  };

  const generatePdfBlob = (textOverride?: string): Blob | null => {
    const text = textOverride ?? currentText;
    if (!text) return null;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 30, marginRight = 20, marginTop = 30, marginBottom = 20;
    const maxWidth = pageWidth - marginLeft - marginRight;
    const indent = 12.5;
    addWatermark(doc);
    const headerEnd = addHeader(doc);
    let y = Math.max(headerEnd, marginTop);
    doc.setFont("times", "normal"); doc.setFontSize(12); doc.setTextColor(30, 30, 30);
    const lineHeight = 7;
    const sigBlock = signatureBase64 ? 45 : 30;
    const paragraphs = text.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const wrapped = doc.splitTextToSize(para, maxWidth - indent);
      for (let i = 0; i < wrapped.length; i++) {
        if (y + lineHeight > pageHeight - marginBottom - sigBlock) {
          doc.addPage(); addWatermark(doc); y = marginTop;
        }
        const isFirst = i === 0;
        const isLast = i === wrapped.length - 1;
        const x = marginLeft + (isFirst ? indent : 0);
        const lineWidth = maxWidth - (isFirst ? indent : 0);
        if (!isLast) (doc as any).text(wrapped[i], x, y, { align: "justify", maxWidth: lineWidth });
        else doc.text(wrapped[i], x, y);
        y += lineHeight;
      }
      y += lineHeight * 0.4;
    }
    const sigY = Math.max(y + 20, pageHeight - marginBottom - sigBlock);
    const finalSigY = sigY + sigBlock > pageHeight - marginBottom + 10 ? marginTop : sigY;
    const centerX = pageWidth / 2;
    if (signatureBase64) {
      try { doc.addImage(signatureBase64, "PNG", centerX - 25, finalSigY, 50, 20); } catch { /* skip */ }
      doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
      doc.line(centerX - 35, finalSigY + 22, centerX + 35, finalSigY + 22);
    } else {
      doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
      doc.line(centerX - 35, finalSigY + 5, centerX + 35, finalSigY + 5);
    }
    const nameY = signatureBase64 ? finalSigY + 27 : finalSigY + 10;
    doc.setFont("times", "bold"); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    if (profile?.full_name) doc.text(profile.full_name, centerX, nameY, { align: "center" });
    const roleMap: Record<string, string> = {
      gestor_pedagogico: "Gestão Pedagógica",
      coord_pedagogico: "Coordenação Pedagógica",
      supervisor: "Corpo de Alunos",
      chef_projeto_vida: "Direção",
    };
    const roleLabel = roleMap[(profile as any)?.role || ""] || "";
    if (roleLabel) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
      doc.text(roleLabel, centerX, nameY + 5, { align: "center" });
    }
    return doc.output("blob");
  };

  const handleDownload = async () => {
    const text = await ensureTranslation(activeLang);
    const blob = generatePdfBlob(text || undefined);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `comunicado-${activeLang}.pdf`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Comunicado baixado em PDF!");
  };

  const handleCopy = async () => {
    if (!currentText) return;
    try { await navigator.clipboard.writeText(currentText); toast.success("Comunicado copiado!"); }
    catch { toast.error("Não foi possível copiar."); }
  };

  const handlePreviewPdf = async () => {
    setGeneratingPreview(true);
    try {
      const text = await ensureTranslation(activeLang);
      const blob = generatePdfBlob(text || undefined);
      if (!blob) { toast.error("Não foi possível gerar a pré-visualização."); return; }
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } finally { setGeneratingPreview(false); }
  };

  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);

  const shareSingleLang = async (lang: Lang) => {
    const text = await ensureTranslation(lang);
    if (!text) return;
    const blob = generatePdfBlob(text); if (!blob) return;
    const file = new File([blob], `comunicado-${lang}.pdf`, { type: "application/pdf" });
    if (navigator.share && (navigator as any).canShare?.({ files: [file] })) {
      try { await navigator.share({ title: "Comunicado Escolar", files: [file] } as any); } catch {}
    } else if (navigator.share) {
      try { await navigator.share({ title: "Comunicado Escolar", text }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); toast.success("Copiado!"); } catch { toast.error("Falha ao copiar."); }
    }
  };

  const shareAllLangs = async () => {
    const langs: Lang[] = ["pt", "en", "es"];
    const files: File[] = [];
    let combined = "";
    for (const l of langs) {
      const text = await ensureTranslation(l); if (!text) return;
      const blob = generatePdfBlob(text);
      if (blob) files.push(new File([blob], `comunicado-${l}.pdf`, { type: "application/pdf" }));
      combined += `=== ${langLabels[l]} ===\n\n${text}\n\n\n`;
    }
    if (navigator.share && (navigator as any).canShare?.({ files })) {
      try { await navigator.share({ title: "Comunicado Escolar (PT/EN/ES)", files } as any); } catch {}
    } else if (navigator.share) {
      try { await navigator.share({ title: "Comunicado Escolar (PT/EN/ES)", text: combined }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(combined); toast.success("Copiado nos 3 idiomas!"); } catch { toast.error("Falha ao copiar."); }
    }
  };

  const triggerClass = p.variant === "primary"
    ? "h-12 bg-primary hover:bg-primary/90 text-white font-bold gap-2 w-full"
    : "h-12 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold gap-2 w-full";

  const alreadyGenerated = !!comunicado;

  return (
    <>
      <Button onClick={generate} className={triggerClass} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : alreadyGenerated ? <Pencil className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        {alreadyGenerated ? "Editar Comunicado" : "Gerar Comunicado"}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsla(0,0%,0%,0.7)" }}>
          <div className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: "hsl(220, 50%, 18%)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="h-4 w-4" /> Comunicado Gerado
              </h2>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {school && (
                <div className="flex items-center gap-3 mb-3 px-2">
                  {school.logo_url && (
                    <img src={school.logo_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white/20" />
                  )}
                  <div>
                    <p className="text-white font-bold text-sm">{school.name}</p>
                    <p className="text-white/50 text-xs">{school.city} — {school.state}</p>
                  </div>
                </div>
              )}

              {!isEditing && comunicado && (
                <div className="flex gap-1.5 mb-3 px-1">
                  {(["pt", "en", "es"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleSelectLang(l)}
                      disabled={translatingLang !== null}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        activeLang === l ? "bg-amber-500 text-white shadow-md" : "bg-white/10 text-white/70 hover:bg-white/20"
                      } disabled:opacity-50`}
                    >
                      <span>{langFlags[l]}</span>
                      {translatingLang === l ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>{langLabels[l]}</span>}
                    </button>
                  ))}
                </div>
              )}

              {loading && !comunicado ? (
                <div className="flex items-center justify-center py-12 text-white/70 gap-2 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" /> Gerando comunicado…
                </div>
              ) : isEditing ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-white rounded-xl p-5 text-gray-800 text-sm leading-relaxed font-mono shadow-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  rows={16}
                  autoFocus
                />
              ) : (
                <div className="bg-white rounded-xl p-5 text-gray-800 text-sm leading-relaxed whitespace-pre-wrap font-mono shadow-lg">
                  {currentText}
                </div>
              )}
            </div>

            {comunicado && (
              <div className="px-4 py-3 border-t border-white/10 flex flex-col gap-2">
                {isEditing ? (
                  <Button size="sm" className="w-full rounded-xl bg-[hsl(142,60%,45%)] hover:bg-[hsl(142,60%,40%)] text-white text-xs font-bold" onClick={async () => { setComunicado(editText); setTranslations({ pt: null, en: null, es: null }); setIsEditing(false); try { await supabase.from("bookings").update({ gestor_announcement: editText }).eq("id", p.bookingId); } catch {} toast.success("Comunicado salvo!"); }}>
                    <Save className="h-4 w-4 mr-1" /> Salvar Alterações
                  </Button>
                ) : (
                  <Button className="w-full h-11 rounded-xl bg-[hsl(142,60%,45%)] hover:bg-[hsl(142,60%,40%)] text-white text-sm font-bold shadow-lg" onClick={() => { setEditText(comunicado || ""); setIsEditing(true); }}>
                    <Pencil className="h-5 w-5 mr-2" /> Editar Comunicado
                  </Button>
                )}
                <Button
                  size="sm"
                  className="w-full h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20"
                  onClick={handlePreviewPdf}
                  disabled={isEditing || generatingPreview}
                >
                  {generatingPreview ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                  Pré-visualizar PDF (ABNT)
                </Button>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-xs font-bold" onClick={handleDownload} disabled={isEditing}>
                    <Download className="h-4 w-4 mr-1" /> Baixar
                  </Button>
                  <Button size="sm" className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold" onClick={handleCopy} disabled={isEditing}>
                    <Copy className="h-4 w-4 mr-1" /> Copiar
                  </Button>
                  <Button size="sm" className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold" onClick={() => setShareMenuOpen(true)} disabled={isEditing}>
                    <Share2 className="h-4 w-4 mr-1" /> Enviar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {shareMenuOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" style={{ background: "hsla(0,0%,0%,0.7)" }} onClick={() => setShareMenuOpen(false)}>
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "hsl(220, 50%, 18%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Languages className="h-4 w-4" /> Compartilhar em qual idioma?
              </h3>
              <button onClick={() => setShareMenuOpen(false)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {(["pt", "en", "es"] as Lang[]).map((l) => (
                <Button
                  key={l}
                  className="w-full h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold justify-start"
                  disabled={translatingLang !== null}
                  onClick={async () => { setShareMenuOpen(false); await shareSingleLang(l); }}
                >
                  <span className="mr-2 text-lg">{langFlags[l]}</span>
                  {langLabels[l]}
                  {translatingLang === l && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
                </Button>
              ))}
              <Button
                className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold shadow-lg"
                disabled={translatingLang !== null}
                onClick={async () => { setShareMenuOpen(false); await shareAllLangs(); }}
              >
                <Share2 className="h-4 w-4 mr-2" /> Compartilhar os 3 juntos
              </Button>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "hsla(0,0%,0%,0.92)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="h-4 w-4" /> Pré-visualização ABNT — {langLabels[activeLang]}
            </h3>
            <div className="flex items-center gap-2">
              <Button size="sm" className="rounded-xl bg-primary hover:bg-primary/90 text-xs font-bold" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" /> Baixar
              </Button>
              <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden bg-neutral-800">
            <iframe src={pdfPreviewUrl} title="Pré-visualização do PDF" className="w-full h-full border-0" />
          </div>
        </div>
      )}
    </>
  );
}
