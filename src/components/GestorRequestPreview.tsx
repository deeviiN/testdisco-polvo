import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateGestorCommunique, enforceFiveLines } from "@/lib/generateGestorCommunique";

interface Props {
  topic?: string | null;
  description?: string | null;
  visitorName?: string | null;
  visitorInfo?: string | null;
  sectorLabel: string;
  sectorKey: string;
  bookingDate: string; // yyyy-MM-dd
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  requesterName?: string | null;
}

/**
 * Mostra em tempo real (com debounce) a SOLICITAÇÃO ao gestor
 * que será enviada com este agendamento externo.
 */
export default function GestorRequestPreview(p: Props) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const key = JSON.stringify({
    t: p.topic, d: p.description, vn: p.visitorName, vi: p.visitorInfo,
    s: p.sectorKey, bd: p.bookingDate, st: p.startTime, et: p.endTime,
  });

  useEffect(() => {
    if (!p.bookingDate || !p.startTime || !p.endTime) return;
    const id = ++reqId.current;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const out = await generateGestorCommunique({
          topic: p.topic ?? null,
          description: p.description ?? null,
          visitorName: p.visitorName ?? null,
          visitorInfo: p.visitorInfo ?? null,
          sector: p.sectorLabel,
          bookingDate: p.bookingDate,
          startTime: p.startTime,
          endTime: p.endTime,
          requesterName: p.requesterName ?? null,
        });
        if (id === reqId.current) {
          const dateBRLocal = (() => {
            try { const [y, m, d] = p.bookingDate.split("-"); return `${d}/${m}/${y}`; } catch { return p.bookingDate; }
          })();
          const horario = `${p.startTime?.slice(0,5)} - ${p.endTime?.slice(0,5)}`;
          // Guarda final no front: garante no máx. 5 linhas preservando saudação, essenciais e encerramento.
          const safe = enforceFiveLines(out, {
            sector: p.sectorLabel,
            dateBR: dateBRLocal,
            horario,
            solicitante: (p.requesterName || "").trim(),
          });
          setText(safe);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 700);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const dateBR = (() => {
    try {
      const [y, m, d] = p.bookingDate.split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return p.bookingDate;
    }
  })();

  return (
    <div className="space-y-1 animate-fade-in">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-amber-300" />
        <p className="text-white/80 text-sm font-bold uppercase tracking-wider">
          Solicitação ao gestor (prévia)
        </p>
        {loading && <Loader2 className="h-3 w-3 text-white/60 animate-spin" />}
      </div>

      <div
        className="rounded-xl px-3 py-2 border space-y-1.5"
        style={{
          background: "linear-gradient(135deg, hsla(38, 92%, 50%, 0.10), hsla(28, 95%, 53%, 0.06))",
          borderColor: "hsla(38, 92%, 50%, 0.45)",
          boxShadow: "inset 0 0 10px hsla(38, 92%, 50%, 0.12)",
        }}
      >
        {/* Cabeçalho de campos */}
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div>
            <span className="text-white/40 uppercase tracking-wider">Ambiente</span>
            <p className="text-white font-semibold break-words">{p.sectorLabel}</p>
          </div>
          <div>
            <span className="text-white/40 uppercase tracking-wider">Data</span>
            <p className="text-white font-semibold">{dateBR}</p>
          </div>
          <div>
            <span className="text-white/40 uppercase tracking-wider">Horário</span>
            <p className="text-white font-semibold">{p.startTime} – {p.endTime}</p>
          </div>
          <div>
            <span className="text-white/40 uppercase tracking-wider">Assunto</span>
            <p className="text-white font-semibold break-words">{p.topic || "—"}</p>
          </div>
          {(p.description || p.visitorInfo) && (
            <div className="col-span-2">
              <span className="text-white/40 uppercase tracking-wider">Justificativa</span>
              <p className="text-white font-semibold break-words">
                {p.description || p.visitorInfo}
              </p>
            </div>
          )}
        </div>

        {/* Texto gerado */}
        <div className="border-t border-white/10 pt-1.5">
          <span className="text-white/40 text-[9px] uppercase tracking-wider">Texto que será enviado</span>
          <p className="text-white/90 text-[11px] leading-snug whitespace-pre-line break-words mt-0.5 min-h-[3.5rem]">
            {text || (loading ? "Gerando solicitação…" : "Preencha data e horário para visualizar.")}
          </p>
        </div>
      </div>
    </div>
  );
}
