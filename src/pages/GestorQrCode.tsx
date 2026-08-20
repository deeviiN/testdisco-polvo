import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildOfficialHeader } from "@/lib/officialHeader";

interface SchoolInfo {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
  network: string;
}

const GestorQrCode = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Carrega dados da escola
  useEffect(() => {
    if (!profile?.school_id) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("id,name,city,state,inep_code,network")
        .eq("id", profile.school_id)
        .single();
      if (!cancel && data) setSchool(data as SchoolInfo);
    })();
    return () => {
      cancel = true;
    };
  }, [profile?.school_id]);

  const qrPayload = useMemo(() => {
    if (!school) return "";
    return `${window.location.origin}/qr-scan?s=${school.id}`;
  }, [school]);

  // Gera QR Code grande, baixa densidade (errorCorrection M)
  useEffect(() => {
    if (!qrPayload) return;
    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 1200,
      color: { dark: "#0a1f44", light: "#ffffff" },
    }).then(setQrDataUrl);
  }, [qrPayload]);

  const header = useMemo(
    () =>
      buildOfficialHeader({
        network: school?.network,
        state: school?.state,
        city: school?.city,
        schoolName: school?.name,
      }),
    [school]
  );

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Toolbar (oculto na impressão) */}
      <div className="print:hidden sticky top-0 z-50 bg-primary text-primary-foreground px-3 py-2 flex items-center gap-2 pr-32">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-white/10"
          onClick={() => navigate("/gestor")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-bold text-base">QR Code do ambiente</span>
      </div>
      <Button
        onClick={() => window.print()}
        className="print:hidden fixed bottom-6 right-6 z-[100] bg-amber-500 hover:bg-amber-600 text-white font-extrabold h-14 px-6 text-base shadow-2xl rounded-full"
      >
        <Printer className="w-5 h-5 mr-2" />
        Imprimir
      </Button>

      {/* Folha A4 */}
      <div className="flex justify-center py-6 print:py-0">
        <div
          className="bg-white text-slate-900 shadow-xl print:shadow-none w-[210mm] min-h-[277mm] p-[8mm] flex flex-col"
          id="qr-a4"
        >
          {/* Cabeçalho oficial */}
          <div className="text-center space-y-0.5 border-b-2 border-slate-300 pb-2">
            {header.governo && (
              <div className="text-[11pt] font-bold uppercase tracking-wide">
                {header.governo}
              </div>
            )}
            {header.secretaria && (
              <div className="text-[10pt] font-semibold">{header.secretaria}</div>
            )}
            {header.escola && (
              <div className="text-[11pt] font-bold mt-1">{header.escola}</div>
            )}
            {school?.inep_code && (
              <div className="text-[9pt] text-slate-600">
                INEP {school.inep_code} • {school.city}/{school.state}
              </div>
            )}
          </div>

          {/* Marca AgenSchool */}
          <div className="text-center mt-1 flex flex-col items-center">
            <img
              src="/app-icon-octopus-512.png"
              alt="AgenSchool"
              className="w-[50mm] h-[50mm] object-contain"
            />
            <h1 className="text-[32pt] font-black tracking-tight text-[#0a1f44] leading-none">
              AgenSchool
            </h1>
            <p className="text-[11pt] font-semibold text-slate-700 mt-0.5">
              Sistema de Agendamento Escolar
            </p>
          </div>

          {/* QR Code grande */}
          <div className="flex-1 flex flex-col items-center justify-center mt-1 min-h-0">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code do ambiente escolar"
                className="w-[105mm] h-[105mm] object-contain"
              />
            ) : (
              <div className="w-[105mm] h-[105mm] bg-slate-100 animate-pulse" />
            )}
            <p className="text-[12pt] font-bold text-center mt-2 text-[#0a1f44]">
              Escaneie ao <span className="underline">iniciar</span> e ao{" "}
              <span className="underline">encerrar</span> o uso do ambiente
            </p>
            <p className="text-[9pt] text-center text-slate-600 mt-1 max-w-[160mm]">
              O sistema registra automaticamente o tempo real de utilização do
              seu agendamento e gera o relatório de uso para a gestão.
            </p>
          </div>


          {/* Rodapé */}
          <div className="border-t border-slate-300 pt-2 text-center text-[8pt] text-slate-500">
            AgenSchool • agenschool.app — Imprima e fixe em local visível do
            ambiente.
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden !important; }
          #qr-a4, #qr-a4 * { visibility: visible !important; }
          #qr-a4 {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 190mm !important;
            min-height: auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>


      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default GestorQrCode;
