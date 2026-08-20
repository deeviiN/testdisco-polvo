import { supabase } from "@/integrations/supabase/client";

interface Params {
  topic?: string | null;
  description?: string | null;
  visitorName?: string | null;
  visitorInfo?: string | null;
  sector: string;
  bookingDate: string; // yyyy-MM-dd
  startTime: string;   // HH:mm or HH:mm:ss
  endTime: string;
  requesterName?: string | null; // nome do usuário logado (solicitante)
}

/**
 * Gera uma SOLICITAÇÃO curta (até 5 linhas) dirigida ao gestor,
 * pedindo a liberação do ambiente para uso externo.
 * Falha silenciosamente: retorna texto local se a IA não estiver disponível.
 */
export async function generateGestorCommunique(p: Params): Promise<string> {
  const dateBR = (() => {
    try {
      const [y, m, d] = p.bookingDate.split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return p.bookingDate;
    }
  })();
  const horario = `${p.startTime?.slice(0, 5)} - ${p.endTime?.slice(0, 5)}`;
  const solicitante = (p.requesterName || "").trim();

  // Fallback local — solicitação curta ao gestor (até 5 linhas)
  const fallback =
    `Prezado(a) Gestor(a),\n` +
    `${solicitante ? `${solicitante} solicita` : "Solicito"} a liberação do ambiente "${p.sector}" no dia ${dateBR}, das ${horario}, para uso externo.\n` +
    `Assunto: ${p.topic || "—"}.${p.visitorName ? ` Solicitante externo: ${p.visitorName}.` : ""}\n` +
    (p.description ? `Justificativa: ${p.description}\n` : "") +
    `Aguardo deferimento.`;

  try {
    const { data, error } = await supabase.functions.invoke("generate-comunicado", {
      body: {
        eventType: "solicitacao_externa",
        eventName: p.topic || p.visitorName || "Uso externo do ambiente",
        audience: p.visitorName || "Público externo",
        sector: p.sector,
        dates: dateBR,
        times: horario,
        department: p.description || p.visitorInfo || "",
        requesterName: solicitante || undefined,
      },
    });
    if (error) throw error;
    const text: string = data?.comunicado ?? "";
    if (!text) return fallback;
    return enforceFiveLines(text, {
      sector: p.sector,
      dateBR,
      horario,
      solicitante,
    });
  } catch {
    return enforceFiveLines(fallback, {
      sector: p.sector,
      dateBR,
      horario,
      solicitante,
    });
  }
}

/**
 * Garante no máximo 5 linhas. Se exceder, prioriza preservar:
 * 1) "Prezado(a) Gestor(a),"
 * 2) Linha com solicitante + setor + data/horário (essenciais)
 * 3) Linha de encerramento (deferimento/atenciosamente)
 * 4) Demais linhas (justificativa/assunto) — descartadas primeiro
 */
export function enforceFiveLines(
  text: string,
  ctx: { sector: string; dateBR: string; horario: string; solicitante: string },
): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 5) return lines.join("\n");

  const isGreeting = (l: string) => /prezad[ao]\(a\)\s*gestor/i.test(l);
  const isClosing = (l: string) =>
    /(deferimento|atenciosamente|aguardo|grato|obrigad)/i.test(l);
  const hasEssentials = (l: string) => {
    const lc = l.toLowerCase();
    const hasSector = lc.includes(ctx.sector.toLowerCase());
    const hasDate = l.includes(ctx.dateBR);
    const hasTime = l.includes(ctx.horario.split(" ")[0]);
    const hasReq =
      !ctx.solicitante || lc.includes(ctx.solicitante.toLowerCase());
    return (hasSector || hasDate || hasTime) && hasReq;
  };

  const greeting = lines.find(isGreeting) ?? "Prezado(a) Gestor(a),";
  const closing = lines.find(isClosing) ?? "Aguardo deferimento.";
  const essential =
    lines.find((l) => !isGreeting(l) && !isClosing(l) && hasEssentials(l)) ??
    `${ctx.solicitante ? `${ctx.solicitante} solicita` : "Solicito"} a liberação do ambiente "${ctx.sector}" no dia ${ctx.dateBR}, das ${ctx.horario}, para uso externo.`;

  // Linhas restantes (justificativa/assunto) — NUNCA descartar conteúdo:
  // se exceder 5 linhas, mesclamos as extras numa única linha de justificativa.
  const taken = new Set([greeting, essential, closing]);
  const extras = lines.filter(
    (l) => !taken.has(l) && !isGreeting(l) && !isClosing(l) && l !== essential,
  );

  // Espaço disponível para extras = 5 - greeting - essential - closing = 2 linhas
  const maxExtras = 2;
  let middle: string[] = extras;
  if (extras.length > maxExtras) {
    // Mantém as primeiras (maxExtras-1) e mescla o restante numa única linha
    const head = extras.slice(0, maxExtras - 1);
    const merged = extras.slice(maxExtras - 1).join(" ");
    middle = [...head, merged];
  }

  return [greeting, essential, ...middle, closing].join("\n");
}
