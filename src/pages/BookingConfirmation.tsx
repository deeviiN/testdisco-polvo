import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, ClipboardList, Check, FileText, Download, Share2, Loader2, X, Copy, Pencil, Save, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import jsPDF from "jspdf";
import { buildOfficialHeader } from "@/lib/officialHeader";
import { resolveGovLogoUrl, loadImageDataUrl } from "@/lib/govLogo";

interface SchoolInfo {
  name: string;
  city: string;
  state: string;
  logo_url: string | null;
  address: string | null;
  network: string | null;
  gov_logo_url?: string | null;
}

export default function BookingConfirmation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sector = searchParams.get("sector") || "quadra";
  const { profile } = useAuth();

  const [comunicado, setComunicado] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [govLogoBase64, setGovLogoBase64] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [signerName, setSignerName] = useState<string>("");

  // Traduções: cache por idioma. 'pt' é o original.
  type Lang = "pt" | "en" | "es";
  const [translations, setTranslations] = useState<Record<Lang, string | null>>({ pt: null, en: null, es: null });
  const [activeLang, setActiveLang] = useState<Lang>("pt");
  const [translatingLang, setTranslatingLang] = useState<Lang | null>(null);
  const langLabels: Record<Lang, string> = { pt: "Português", en: "English", es: "Español" };
  const langFlags: Record<Lang, string> = { pt: "🇧🇷", en: "🇺🇸", es: "🇪🇸" };
  const currentText = (activeLang === "pt" ? comunicado : translations[activeLang]) || comunicado;

  // Fetch school info
  useEffect(() => {
    if (!profile?.school_id) return;
    supabase
      .from("schools")
      .select("name, city, state, logo_url, address, network, gov_logo_url")
      .eq("id", profile.school_id)
      .single()
      .then(({ data }) => {
        if (data) setSchool(data);
      });
  }, [profile?.school_id]);

  // Pre-load logo as base64 for PDF
  useEffect(() => {
    if (!school?.logo_url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setLogoBase64(canvas.toDataURL("image/png"));
      }
    };
    img.onerror = () => setLogoBase64(null);
    img.src = school.logo_url;
  }, [school?.logo_url]);

  // Pre-load gov logo (override > catálogo)
  useEffect(() => {
    if (!school) return;
    (async () => {
      const url = await resolveGovLogoUrl({
        network: school.network,
        state: school.state,
        city: school.city,
        overrideUrl: school.gov_logo_url,
      });
      const data = await loadImageDataUrl(url);
      setGovLogoBase64(data);
    })();
  }, [school?.gov_logo_url, school?.network, school?.state, school?.city]);

  // Load user signature
  useEffect(() => {
    if (!profile) return;
    setSignerName(profile.full_name || "");
    
    const loadSignature = async (url: string) => {
      const { getSignedSignatureUrl } = await import("@/lib/signatureUrl");
      const signedUrl = await getSignedSignatureUrl(url);
      if (!signedUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          setSignatureBase64(canvas.toDataURL("image/png"));
        }
      };
      img.src = signedUrl;
    };

    const sigUrl = (profile as any).signature_url;
    if (!sigUrl) {
      supabase
        .from("profiles")
        .select("signature_url, full_name")
        .eq("user_id", profile.user_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setSignerName((data as any).full_name || "");
            const url = (data as any).signature_url;
            if (url) loadSignature(url);
          }
        });
      return;
    }
    loadSignature(sigUrl);
  }, [profile]);

  const eventTypeParam = searchParams.get("event") || "";
  const isExternalEvent = eventTypeParam === "evento_externo";
  const isManagerLike = profile?.role === "gestor_pedagogico" || profile?.role === "coord_pedagogico" || profile?.role === "supervisor";
  // Comunicado por IA aparece:
  // - SEMPRE quando o agendamento é de uso externo (gera SOLICITAÇÃO curta ao gestor)
  // - Caso contrário, apenas para perfis de gestão (comunicado escolar oficial)
  const canGenerateComunicado = isExternalEvent || isManagerLike;

  const handleGenerateComunicado = async () => {
    setLoading(true);
    try {
      const payload = {
        // Para externo, força o modo "solicitacao_externa" (texto curto ao gestor),
        // mesmo que o usuário não seja gestor.
        eventType: isExternalEvent ? "solicitacao_externa" : eventTypeParam,
        eventName: searchParams.get("name") || "",
        audience: searchParams.get("audience") || "",
        department: searchParams.get("department") || "",
        sector,
        dates: searchParams.get("dates") || "",
        times: searchParams.get("times") || "",
        ensino: searchParams.get("ensino") || "",
        series: searchParams.get("series") || "",
        turmas: searchParams.get("turmas") || "",
        requesterName: profile?.full_name || "",
      };

      const { data, error } = await supabase.functions.invoke("generate-comunicado", {
        body: payload,
      });

      if (error) {
        toast.error("Erro ao gerar comunicado.");
        console.error(error);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setComunicado(data.comunicado);
      setEditText(data.comunicado);
      setShowPreview(true);
    } catch (e) {
      toast.error("Erro ao gerar comunicado.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const addWatermark = (doc: jsPDF) => {
    if (!logoBase64) return;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const watermarkSize = Math.min(pageW, pageH) * 0.7;
    const x = (pageW - watermarkSize) / 2;
    const y = (pageH - watermarkSize) / 2;

    // Save current graphics state
    const gState = (doc as any).GState;
    if (gState) {
      const gs = new gState({ opacity: 0.06 });
      (doc as any).setGState(gs);
    }

    try {
      doc.addImage(logoBase64, "PNG", x, y, watermarkSize, watermarkSize);
    } catch {
      // logo format not supported, skip watermark
    }

    // Reset opacity
    if (gState) {
      const gsReset = new gState({ opacity: 1 });
      (doc as any).setGState(gsReset);
    }
  };

  const addHeader = (doc: jsPDF): number => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;

    // Monta cabeçalho institucional oficial (Governo / Secretaria / Escola)
    const header = buildOfficialHeader({
      network: (school as any)?.network,
      state: school?.state,
      city: school?.city,
      schoolName: school?.name,
    });

    // Altura adaptativa conforme número de linhas (mín. 28mm)
    const lineCount = header.lines.length || 1;
    const barHeight = Math.max(28, 10 + lineCount * 6);

    // Dark blue header bar (hsl(220, 50%, 28%) ≈ RGB 36, 64, 107)
    doc.setFillColor(36, 64, 107);
    doc.rect(0, 0, pageWidth, barHeight, "F");

    // Logo do GOVERNO à esquerda (fundo branco circular)
    let leftPad = 0;
    if (govLogoBase64) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 9, barHeight / 2, 10, "F");
        doc.addImage(govLogoBase64, "PNG", margin, barHeight / 2 - 9, 18, 18);
        leftPad = 24;
      } catch { /* skip */ }
    }

    // Logo da ESCOLA à direita (fundo branco circular)
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

    // Linhas: governo (10pt) / secretaria (9pt) / escola (12pt bold)
    let y = (barHeight - lineCount * 5) / 2 + 4;
    doc.setTextColor(255, 255, 255);
    if (header.governo) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const ln = doc.splitTextToSize(header.governo.toUpperCase(), textMaxW)[0];
      doc.text(ln, textX, y);
      y += 5;
    }
    if (header.secretaria) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(220, 230, 245);
      const ln = doc.splitTextToSize(header.secretaria, textMaxW)[0];
      doc.text(ln, textX, y);
      y += 5;
    }
    if (header.escola) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      const ln = doc.splitTextToSize(header.escola, textMaxW)[0];
      doc.text(ln, textX, y);
    }

    // Thin separator below bar
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, barHeight + 6, pageWidth - margin, barHeight + 6);

    return barHeight + 14; // content start Y (ABNT spacing)
  };

  const generatePdfBlob = (textOverride?: string): Blob | null => {
    const text = textOverride ?? currentText;
    if (!text) return null;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    // ABNT margins: left 30mm, right 20mm, top 30mm, bottom 20mm
    const marginLeft = 30;
    const marginRight = 20;
    const marginTop = 30;
    const marginBottom = 20;
    const maxWidth = pageWidth - marginLeft - marginRight;
    const indent = 12.5; // 1.25cm first-line indent (ABNT)

    // Add watermark to first page
    addWatermark(doc);

    // Add header (uses its own banner) — content starts after it but respects ABNT top margin
    const headerEnd = addHeader(doc);
    let y = Math.max(headerEnd, marginTop);

    // Body text — Times 12pt, line-height 1.5 (~7mm), justified, first-line indent
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    const lineHeight = 7; // ~1.5 spacing for 12pt
    const signatureBlockHeight = signatureBase64 ? 45 : 30;

    // Split into paragraphs (preserve user-intended breaks)
    const paragraphs = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);

    for (const para of paragraphs) {
      const wrapped = doc.splitTextToSize(para, maxWidth - indent);
      for (let i = 0; i < wrapped.length; i++) {
        if (y + lineHeight > pageHeight - marginBottom - signatureBlockHeight) {
          doc.addPage();
          addWatermark(doc);
          y = marginTop;
        }
        const isFirst = i === 0;
        const isLast = i === wrapped.length - 1;
        const x = marginLeft + (isFirst ? indent : 0);
        const lineWidth = maxWidth - (isFirst ? indent : 0);
        // Justify all lines except the last of each paragraph
        if (!isLast) {
          (doc as any).text(wrapped[i], x, y, { align: "justify", maxWidth: lineWidth });
        } else {
          doc.text(wrapped[i], x, y);
        }
        y += lineHeight;
      }
      y += lineHeight * 0.4; // small space between paragraphs
    }

    // Signature block — always centralized horizontally on the page
    const sigY = Math.max(y + 20, pageHeight - marginBottom - signatureBlockHeight);

    if (sigY + signatureBlockHeight > pageHeight - marginBottom + 10) {
      doc.addPage();
      addWatermark(doc);
    }

    const finalSigY = sigY + signatureBlockHeight > pageHeight - marginBottom + 10 ? marginTop : sigY;
    const centerX = pageWidth / 2;

    if (signatureBase64) {
      try {
        doc.addImage(signatureBase64, "PNG", centerX - 25, finalSigY, 50, 20);
      } catch {
        // skip signature image
      }
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(centerX - 35, finalSigY + 22, centerX + 35, finalSigY + 22);
    } else {
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(centerX - 35, finalSigY + 5, centerX + 35, finalSigY + 5);
    }

    // Signer name centered
    const nameY = signatureBase64 ? finalSigY + 27 : finalSigY + 10;
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    if (signerName) {
      doc.text(signerName, centerX, nameY, { align: "center" });
    }

    // Role label
    const roleMap: Record<string, string> = {
      gestor_pedagogico: "Gestão Pedagógica",
      coord_pedagogico: "Coordenação Pedagógica",
      supervisor: "Corpo de Alunos",
      chef_projeto_vida: "Direção",
    };
    const roleLabel = roleMap[(profile as any)?.role || ""] || "";
    if (roleLabel) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(roleLabel, centerX, nameY + 5, { align: "center" });
    }

    return doc.output("blob");
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
      if (error || data?.error) {
        toast.error(data?.error || "Erro ao traduzir.");
        return null;
      }
      const translated = data.translated as string;
      setTranslations((prev) => ({ ...prev, [lang]: translated }));
      return translated;
    } catch (e) {
      console.error(e);
      toast.error("Erro ao traduzir.");
      return null;
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

  const handleDownload = async () => {
    const text = await ensureTranslation(activeLang);
    const blob = generatePdfBlob(text || undefined);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comunicado-${activeLang}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Comunicado baixado em PDF!");
  };

  const handleCopy = async () => {
    const text = currentText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Comunicado copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const handlePreviewPdf = async () => {
    setGeneratingPreview(true);
    try {
      const text = await ensureTranslation(activeLang);
      const blob = generatePdfBlob(text || undefined);
      if (!blob) { toast.error("Não foi possível gerar a pré-visualização."); return; }
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } finally {
      setGeneratingPreview(false);
    }
  };

  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  const shareSingleLang = async (lang: Lang) => {
    const text = await ensureTranslation(lang);
    if (!text) return;
    const blob = generatePdfBlob(text);
    if (!blob) return;
    const file = new File([blob], `comunicado-${lang}.pdf`, { type: "application/pdf" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title: "Comunicado Escolar", files: [file] }); } catch { /* cancelled */ }
    } else if (navigator.share) {
      try { await navigator.share({ title: "Comunicado Escolar", text }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(text); toast.success("Copiado!"); } catch { toast.error("Falha ao copiar."); }
    }
  };

  const shareAllLangs = async () => {
    const langs: Lang[] = ["pt", "en", "es"];
    const files: File[] = [];
    let combined = "";
    for (const l of langs) {
      const text = await ensureTranslation(l);
      if (!text) return;
      const blob = generatePdfBlob(text);
      if (blob) files.push(new File([blob], `comunicado-${l}.pdf`, { type: "application/pdf" }));
      combined += `=== ${langLabels[l]} ===\n\n${text}\n\n\n`;
    }
    if (navigator.share && navigator.canShare?.({ files })) {
      try { await navigator.share({ title: "Comunicado Escolar (PT/EN/ES)", files }); } catch { /* cancelled */ }
    } else if (navigator.share) {
      try { await navigator.share({ title: "Comunicado Escolar (PT/EN/ES)", text: combined }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(combined); toast.success("Copiado nos 3 idiomas!"); } catch { toast.error("Falha ao copiar."); }
    }
  };

  const handleShare = () => {
    setShareMenuOpen(true);
  };

  return (
    <div className="relative flex flex-col h-dvh select-none overflow-hidden items-center justify-center" style={{ background: "hsl(220, 50%, 28%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(160deg, hsla(215, 60%, 35%, 0.7) 0%, hsla(220, 55%, 30%, 0.6) 50%, hsla(225, 50%, 32%, 0.7) 100%)" }} />

      {/* Preview Modal */}
      {showPreview && comunicado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsla(0,0%,0%,0.7)" }}>
          <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: "hsl(220, 50%, 18%)" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Comunicado Gerado
              </h2>
              <button onClick={() => setShowPreview(false)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Comunicado content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* School header preview */}
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
              {/* Language tabs */}
              {!isEditing && (
                <div className="flex gap-1.5 mb-3 px-1">
                  {(["pt", "en", "es"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleSelectLang(l)}
                      disabled={translatingLang !== null}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        activeLang === l
                          ? "bg-amber-500 text-white shadow-md"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      } disabled:opacity-50`}
                    >
                      <span>{langFlags[l]}</span>
                      {translatingLang === l ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span>{langLabels[l]}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {isEditing ? (
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

            {/* Action buttons */}
            <div className="px-4 py-3 border-t border-white/10 flex flex-col gap-2">
              {isEditing ? (
                <Button size="sm" className="w-full rounded-xl bg-[hsl(142,60%,45%)] hover:bg-[hsl(142,60%,40%)] text-white text-xs font-bold" onClick={() => { setComunicado(editText); setIsEditing(false); toast.success("Comunicado salvo!"); }}>
                  <Save className="h-4 w-4 mr-1" /> Salvar Alterações
                </Button>
              ) : (
                <Button className="w-full h-12 rounded-xl bg-[hsl(142,60%,45%)] hover:bg-[hsl(142,60%,40%)] text-white text-sm font-bold shadow-lg" onClick={() => { setEditText(comunicado || ""); setIsEditing(true); }}>
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
                <Button size="sm" className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold" onClick={handleShare} disabled={isEditing}>
                  <Share2 className="h-4 w-4 mr-1" /> Enviar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share language picker modal */}
      {shareMenuOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" style={{ background: "hsla(0,0%,0%,0.7)" }} onClick={() => setShareMenuOpen(false)}>
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "hsl(220, 50%, 18%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Languages className="h-4 w-4" /> Compartilhar em qual idioma?
              </h3>
              <button onClick={() => setShareMenuOpen(false)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:text-white">
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
                <Share2 className="h-4 w-4 mr-2" />
                Compartilhar os 3 juntos
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
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

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 w-full max-w-sm">
        {/* Animated circle with checkmark */}
        <div className="relative w-28 h-28">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="50" fill="none" stroke="hsla(0,0%,100%,0.1)" strokeWidth="4" />
            <circle cx="56" cy="56" r="50" fill="none" stroke="hsl(142, 60%, 50%)" strokeWidth="4" strokeLinecap="round" strokeDasharray="314" strokeDashoffset="0" className="animate-[spin-ccw_2s_linear_infinite]" style={{ transformOrigin: "center" }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center animate-[scale-check_0.5s_ease-out_0.3s_both]">
            <div className="w-16 h-16 rounded-full bg-[hsl(142,60%,45%)] flex items-center justify-center shadow-lg shadow-[hsla(142,60%,45%,0.3)]">
              <Check className="h-9 w-9 text-white" strokeWidth={3} />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-1 animate-fade-in">
          <h1 className="text-xl font-display font-bold text-white">Agendamento Concluído!</h1>
          <p className="text-white/50 text-sm">Seu agendamento foi registrado com sucesso.</p>
        </div>

        {/* Buttons */}
        <div className="w-full flex flex-col gap-3 mt-4 animate-fade-in">
          {canGenerateComunicado && (
            <Button
              size="lg"
              className="w-full rounded-2xl h-14 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg"
              onClick={comunicado ? () => setShowPreview(true) : handleGenerateComunicado}
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> {isExternalEvent ? "Gerando Solicitação..." : "Gerando Comunicado..."}</>
              ) : comunicado ? (
                <><FileText className="h-5 w-5 mr-2" /> {isExternalEvent ? "Ver Solicitação" : "Ver Comunicado"}</>
              ) : (
                <><FileText className="h-5 w-5 mr-2" /> {isExternalEvent ? "Gerar Solicitação ao Gestor" : "Gerar Comunicado com IA"}</>
              )}
            </Button>
          )}

          <Button
            size="lg"
            className="w-full rounded-2xl h-14 text-base font-bold bg-primary hover:bg-primary/90"
            onClick={() => navigate(`/booking/quadra/lista?setor=${sector}`)}
          >
            <ClipboardList className="h-5 w-5 mr-2" />
            Conferir Agendamento
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full rounded-2xl h-14 text-base font-bold bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            onClick={() => navigate("/sectors")}
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar ao Início
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full rounded-2xl h-14 text-base font-bold text-white/50 hover:text-white hover:bg-white/10"
            onClick={() => navigate("/")}
          >
            <LogOut className="h-5 w-5 mr-2" />
            Sair
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes spin-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes scale-check {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
