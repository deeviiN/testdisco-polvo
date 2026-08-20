import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tv, Copy, Check, ExternalLink, Download, Wrench } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { buildTvDiagnosticHtml, buildTvLauncherFileName, buildTvLauncherHtml, buildTvLauncherLabel, downloadTextFile, validateTvLauncherHtml, type HtmlValidationItem } from "@/lib/tvLauncherHtml";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null | undefined;
  /** Cor de destaque (ex: amber-400 para gestor, accent para assistente). */
  accent?: "amber" | "blue";
}

/**
 * Diálogo unificado do Painel TV: abrir aqui, abrir modo "ver todos"
 * e copiar link pra colar em outro dispositivo (TV, computador, tablet).
 * Usado em Painel Gestor e Painel Assistente.
 */
export default function PainelTvLinkDialog({ open, onOpenChange, schoolId, accent = "amber" }: Props) {
  const [copied, setCopied] = useState<"normal" | "all" | "compat" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrZoom, setQrZoom] = useState(false);
  const [tvBrand, setTvBrand] = useState<string>(() => {
    try { return localStorage.getItem("paineltv:brand") || ""; } catch { return ""; }
  });
  const [compatLink, setCompatLink] = useState<string>("");
  const [school, setSchool] = useState<{ name?: string | null; city?: string | null; state?: string | null } | null>(null);
  useEffect(() => {
    if (!schoolId) { setSchool(null); return; }
    supabase.from("schools").select("name, city, state").eq("id", schoolId).maybeSingle()
      .then(({ data }) => setSchool(data ?? null));
  }, [schoolId]);
  const CHECKLIST_ITEMS = [
    { id: "fat32", label: "Pendrive formatado em FAT32 (não use NTFS/exFAT)" },
    { id: "root", label: "Arquivo na RAIZ do pendrive, fora de subpastas" },
    { id: "name", label: "Nome curto em MAIÚSCULAS (ex.: PAINELTV.HTM, máx. 8.3)" },
    { id: "size", label: "Arquivo pequeno (<10 KB) — apenas o lançador, sem mídia" },
    { id: "single", label: "Somente 1 arquivo .HTM por pendrive (evita conflito)" },
    { id: "net", label: "TV conectada à internet (Wi-Fi ou cabo) antes de abrir" },
    { id: "test", label: "Testei antes com TESTE.HTM e a TV reconheceu" },
  ];
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("paineltv:checks") || "{}"); } catch { return {}; }
  });
  const toggleCheck = (id: string) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("paineltv:checks", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const allChecked = CHECKLIST_ITEMS.every((i) => checks[i.id]);
  // URL pública do app publicado. O domínio do preview (id-preview--*.lovable.app)
  // exige login do Lovable e mostra a tela da Lovable para quem recebe o link.
  // Por isso, ao gerar o link do Painel TV, trocamos para a URL publicada.
  const PUBLISHED_URL = "https://create-your-app-66.lovable.app";
  const rawOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const isPreview = /id-preview--.*\.lovable\.app$/i.test(rawOrigin) || /\.lovableproject\.com$/i.test(rawOrigin);
  const origin = isPreview ? PUBLISHED_URL : rawOrigin;
  const tvUrl = `${origin}/painel-tv?school=${schoolId ?? ""}`;
  const tvUrlAll = `${tvUrl}&view=all`;

  useEffect(() => {
    if (!open || !tvUrl) {
      setQrDataUrl(null);
      setQrSvg(null);
      return;
    }
    QRCode.toDataURL(tvUrl, { width: 140, margin: 1, color: { dark: "#0b1220", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
    QRCode.toString(tvUrl, { type: "svg", margin: 1, color: { dark: "#0b1220", light: "#ffffff" } })
      .then((svg: string) => setQrSvg(svg))
      .catch(() => setQrSvg(null));
  }, [open, tvUrl]);

  const copy = async (which: "normal" | "all") => {
    try {
      await navigator.clipboard.writeText(which === "all" ? tvUrlAll : tvUrl);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const accentBtn =
    accent === "amber"
      ? "bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 border-amber-200/40 text-[hsl(220,60%,15%)] shadow-[0_8px_24px_-8px_rgba(251,191,36,0.6)] hover:shadow-[0_10px_30px_-6px_rgba(251,191,36,0.75)]"
      : "bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 border-sky-300/40 text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.7)] hover:shadow-[0_10px_30px_-6px_rgba(59,130,246,0.85)]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-white/15 text-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-[hsl(220,50%,18%)] !top-[44%] !max-h-[74dvh] overflow-y-auto overscroll-contain">
        <DialogHeader className="space-y-0">
          <DialogTitle className="text-center text-white flex items-center justify-center gap-2 text-sm">
            <Tv className="h-4 w-4" /> Painel TV
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 mt-0.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                window.open(tvUrl, "_blank");
                onOpenChange(false);
              }}
              className={`h-10 rounded-xl border flex items-center justify-center gap-1.5 font-bold transition active:scale-[0.98] ${accentBtn}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="text-[11px] leading-tight">Abrir aqui</span>
            </button>

            <button
              onClick={() => {
                window.open(tvUrlAll, "_blank");
                onOpenChange(false);
              }}
              className={`h-10 rounded-xl border flex items-center justify-center gap-1.5 font-bold transition active:scale-[0.98] ${accentBtn}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="text-[11px] leading-tight">Ver todos</span>
            </button>
          </div>

          <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold text-center">
            Copiar link p/ TV, computador ou tablet
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => copy("normal")}
              className="h-10 rounded-xl border border-sky-300/30 bg-gradient-to-br from-sky-500/30 via-blue-600/30 to-indigo-700/30 hover:from-sky-500/40 hover:to-indigo-700/40 flex items-center justify-center gap-1.5 font-bold transition active:scale-[0.98] shadow-[0_4px_16px_-6px_rgba(59,130,246,0.5)]"
            >
              {copied === "normal" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="text-[11px] leading-tight">{copied === "normal" ? "Copiado!" : "Copiar rotação"}</span>
            </button>

            <button
              onClick={() => copy("all")}
              className="h-10 rounded-xl border border-sky-300/30 bg-gradient-to-br from-sky-500/30 via-blue-600/30 to-indigo-700/30 hover:from-sky-500/40 hover:to-indigo-700/40 flex items-center justify-center gap-1.5 font-bold transition active:scale-[0.98] shadow-[0_4px_16px_-6px_rgba(59,130,246,0.5)]"
            >
              {copied === "all" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="text-[11px] leading-tight">{copied === "all" ? "Copiado!" : "Copiar todos"}</span>
            </button>
          </div>

          {qrDataUrl && (
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => setQrZoom(true)}
                className="bg-white p-1 rounded-xl transition active:scale-[0.97] shrink-0"
                title="Clique para ampliar"
              >
                <img src={qrDataUrl} alt="QR Code Painel TV" className="w-20 h-20" />
              </button>
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold">
                  Escaneie com o celular
                </p>
                <a
                  href={qrDataUrl}
                  download="painel-tv-qrcode.png"
                  className="h-8 px-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-1.5 font-bold text-xs transition active:scale-[0.98] text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  PNG
                </a>
                {qrSvg && (
                  <a
                    href={URL.createObjectURL(new Blob([qrSvg], { type: "image/svg+xml" }))}
                    download="painel-tv-qrcode.svg"
                     className="h-8 px-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-1.5 font-bold text-xs transition active:scale-[0.98] text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    SVG
                  </a>
                )}
                <span className="text-[9px] text-white/40">Toque no QR para ampliar</span>
              </div>
            </div>
          )}

          {qrZoom && qrDataUrl && (
            <div
              className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6"
              onClick={() => setQrZoom(false)}
            >
              <div
                className="flex flex-col items-center gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-bold text-white/80 uppercase tracking-wider">
                  QR Code — Painel TV
                </p>
                <div className="bg-white p-3 rounded-2xl shadow-2xl">
                  <img src={qrDataUrl} alt="QR Code Painel TV ampliado" className="w-64 h-64" />
                </div>
                <div className="flex gap-3">
                  <a
                    href={qrDataUrl}
                    download="painel-tv-qrcode.png"
                    className="h-12 px-5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center gap-2 font-bold text-sm transition active:scale-[0.98] text-white"
                  >
                    <Download className="h-5 w-5" />
                    Baixar PNG
                  </a>
                  {qrSvg && (
                    <a
                      href={URL.createObjectURL(new Blob([qrSvg], { type: "image/svg+xml" }))}
                      download="painel-tv-qrcode.svg"
                      className="h-12 px-5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center gap-2 font-bold text-sm transition active:scale-[0.98] text-white"
                    >
                      <Download className="h-5 w-5" />
                      Baixar SVG
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setQrZoom(false)}
                  className="h-10 px-6 rounded-xl border border-white/20 bg-transparent text-white/70 text-sm font-semibold hover:bg-white/10 transition active:scale-[0.98]"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          <div className="h-px bg-white/10 my-0.5" />

          <div className="rounded-xl border border-white/15 bg-white/5 p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4 text-white/80" />
              <span className="text-xs font-bold">📺 Compatibilidade da TV</span>
            </div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/60 font-bold">Sistema da TV</span>
              <select
                value={tvBrand}
                onChange={(e) => {
                  const v = e.target.value;
                  setTvBrand(v);
                  try { localStorage.setItem("paineltv:brand", v); } catch {}
                  setCompatLink("");
                }}
                className="w-full h-10 px-3 rounded-xl border border-white/20 bg-[hsl(220,50%,14%)] text-white mt-0.5 text-sm"
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
              onClick={async () => {
                if (!tvBrand) return;
                const url = new URL(tvUrl);
                url.searchParams.set("tv", tvBrand);
                url.searchParams.set("kiosk", "1");
                if (tvBrand === "tizen" || tvBrand === "webos" || tvBrand === "vidaa") {
                  url.searchParams.set("legacy", "1");
                }
                const final = url.toString();
                setCompatLink(final);
                try {
                  await navigator.clipboard.writeText(final);
                  setCopied("compat");
                  setTimeout(() => setCopied(null), 2000);
                } catch {}
              }}
              disabled={!tvBrand}
              className="h-10 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              {copied === "compat" ? <Check className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
              <span className="text-xs">{copied === "compat" ? "Link compatível copiado!" : "🔧 Gerar Link Compatível"}</span>
            </button>

            {compatLink && (
              <>
                <input
                  type="text"
                  value={compatLink}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-9 px-2 rounded-lg border border-white/15 bg-[hsl(220,50%,12%)] text-white/90 text-[11px]"
                />
                <button
                  onClick={() => window.open(compatLink, "_blank", "noopener,noreferrer")}
                  className="h-10 rounded-xl border border-sky-400/50 bg-sky-500/20 hover:bg-sky-500/30 text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="text-sm">🧪 Testar no navegador</span>
                </button>

                <button
                  onClick={() => {
                    const u = new URL(`${origin}/painel-tv/verify`);
                    if (schoolId) u.searchParams.set("school", schoolId);
                    if (tvBrand) u.searchParams.set("tv", tvBrand);
                    window.open(u.toString(), "_blank", "noopener,noreferrer");
                  }}
                  className="h-10 rounded-xl border border-emerald-400/50 bg-emerald-500/20 hover:bg-emerald-500/30 text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <Wrench className="h-4 w-4" />
                  <span className="text-sm">🔍 Verificar link (/painel-tv/verify)</span>
                </button>

                <div className="rounded-xl border border-white/15 bg-[hsl(220,50%,12%)] p-2 flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-white/70 font-bold">
                      ✅ Checklist de compatibilidade
                    </span>
                    <span className={`text-[10px] font-bold ${allChecked ? "text-emerald-300" : "text-amber-300"}`}>
                      {Object.values(checks).filter(Boolean).length}/{CHECKLIST_ITEMS.length}
                    </span>
                  </div>
                  {CHECKLIST_ITEMS.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-2 text-[10px] text-white/85 leading-snug cursor-pointer active:opacity-70"
                    >
                      <input
                        type="checkbox"
                        checked={!!checks[item.id]}
                        onChange={() => toggleCheck(item.id)}
                        className="mt-0.5 h-3.5 w-3.5 accent-emerald-500 shrink-0"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                  {!allChecked && (
                    <p className="text-[10px] text-amber-300/90 mt-1">
                      Marque todos os itens para liberar o download do HTML.
                    </p>
                  )}
                </div>

                {(() => {
                  const label = buildTvLauncherLabel(school);
                  const html = buildTvLauncherHtml(compatLink, label);
                  const fileName = buildTvLauncherFileName(school);
                  // valida usando o nome curto p/ TVs antigas (8.3); o arquivo salvo usa o nome descritivo
                  const results: HtmlValidationItem[] = validateTvLauncherHtml("PAINELTV.HTM", html);
                  const allValid = results.every((r) => r.pass);
                  const okCount = results.filter((r) => r.pass).length;
                  const canDownload = allChecked && allValid;
                  return (
                    <>
                      <div className="rounded-xl border border-white/15 bg-[hsl(220,50%,12%)] p-2 flex flex-col gap-1 max-h-36 overflow-y-auto">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider text-white/70 font-bold">
                            🛡️ Validação automática do HTML
                          </span>
                          <span className={`text-[10px] font-bold ${allValid ? "text-emerald-300" : "text-red-300"}`}>
                            {okCount}/{results.length}
                          </span>
                        </div>
                        {results.map((r) => (
                          <div key={r.id} className="flex items-start gap-2 text-[10px] leading-snug">
                            <span className={`mt-0.5 shrink-0 ${r.pass ? "text-emerald-400" : "text-red-400"}`}>
                              {r.pass ? "✓" : "✗"}
                            </span>
                            <span className={r.pass ? "text-white/85" : "text-red-200"}>
                              {r.label}
                              {r.detail && <span className="text-white/40"> — {r.detail}</span>}
                            </span>
                          </div>
                        ))}
                        {!allValid && (
                          <p className="text-[10px] text-red-300/90 mt-1">
                            Há itens que podem impedir TVs antigas de abrir o arquivo.
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          if (!canDownload) return;
                          downloadTextFile(fileName, html);
                        }}
                        disabled={!canDownload}
                         className="h-10 rounded-xl border border-amber-400/60 bg-amber-400/20 hover:bg-amber-400/30 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                      >
                        <Download className="h-4 w-4" />
                        <span className="text-xs">💾 Baixar arquivo p/ pendrive</span>
                      </button>
                    </>
                  );
                })()}

                <button
                  onClick={() => downloadTextFile("TESTE.HTM", buildTvDiagnosticHtml())}
                  className="h-10 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" />
                  <span className="text-xs">🧪 Baixar teste de reconhecimento</span>
                </button>

                <button
                  onClick={async () => {
                    const { buildTvLauncherMinimalHtml, buildTvLauncherMinimalFileName } = await import("@/lib/tvLauncherHtml");
                    const label = buildTvLauncherLabel(school);
                    downloadTextFile(buildTvLauncherMinimalFileName(), buildTvLauncherMinimalHtml(compatLink, label));
                  }}
                  className="h-10 rounded-xl border border-emerald-400/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" />
                  <span className="text-[11px] leading-tight">⚡ Baixar PTVMIN.HTM (minificado, sem JS)</span>
                </button>

                <button
                  onClick={async () => {
                    const { buildTvBoxDiagnosticHtml, buildTvDiagnosticFileName } = await import("@/lib/tvLauncherHtml");
                    downloadTextFile(buildTvDiagnosticFileName(), buildTvBoxDiagnosticHtml());
                  }}
                  className="h-10 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" />
                  <span className="text-xs">🩺 Baixar DIAG.HTM (limites da TV)</span>
                </button>


                <p className="text-[10px] text-white/70 leading-snug bg-white/5 border border-white/10 rounded-lg p-1.5">
                  <b>Como usar:</b><br />
                  1. Baixe <b>TESTE.HTM</b> primeiro. Se ele não aparecer na TV, a USB da TV só reconhece mídia, não páginas HTML.<br />
                  2. Baixe <b>PAINELTV.HTM</b> e copie para um pendrive formatado em FAT32.<br />
                  3. Na TV, abra pelo <b>Navegador</b> ou <b>Gerenciador de arquivos</b>. Se não avançar, pressione <b>OK</b> no botão verde.
                </p>
              </>
            )}
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border border-white/15 bg-transparent text-white/80 font-semibold text-sm mt-0 active:scale-[0.98]"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
