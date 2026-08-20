// Leitura de PDF com a tabela de horários dos professores.
// O arquivo NÃO é armazenado: só extraímos o texto e devolvemos os tempos.

export type ParsedShift = "manha" | "tarde" | "noite";

export interface ParsedPeriod {
  shift: ParsedShift;
  period_number: number;
  label: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
}

const pad = (n: number) => String(n).padStart(2, "0");

function normHM(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})[:hH.](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

function shiftFromStart(hm: string): ParsedShift {
  const h = Number(hm.slice(0, 2));
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

/**
 * Extrai tempos de um texto solto (linhas do PDF).
 * Aceita formatos como:
 *   "1º Tempo 07:00 às 07:50"
 *   "2 TEMPO  07h50 - 08h40"
 *   "07:00 07:50 1º"
 *   "1  07:00  07:50"
 */
export function parsePeriodsFromText(text: string, shiftHint?: ParsedShift): ParsedPeriod[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: ParsedPeriod[] = [];
  let currentShift: ParsedShift | null = shiftHint ?? null;
  let autoNumber = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Cabeçalho de turno dentro do PDF
    if (/\bmanh[aã]\b|\bmatutino\b/.test(lower)) currentShift = "manha";
    else if (/\btarde\b|\bvespertino\b/.test(lower)) currentShift = "tarde";
    else if (/\bnoite\b|\bnoturno\b/.test(lower)) currentShift = "noite";

    if (/intervalo|recreio|merenda/.test(lower)) continue;

    const times = (line.match(/\d{1,2}[:hH.]\d{2}/g) ?? [])
      .map(normHM)
      .filter((t): t is string => !!t);
    if (times.length < 2) continue;

    const start = times[0];
    const end = times[1];
    if (start === end) continue;

    const numMatch = line.match(/(\d{1,2})\s*[ºo°]?\s*(?:tempo|aula|hor[aá]rio)/i) || line.match(/^(\d{1,2})\b/);
    autoNumber += 1;
    const period_number = numMatch ? Number(numMatch[1]) : autoNumber;
    if (!period_number || period_number < 1 || period_number > 10) continue;

    const shift = shiftHint ?? currentShift ?? shiftFromStart(start);

    out.push({
      shift,
      period_number,
      label: `${period_number}º Tempo`,
      start_time: start,
      end_time: end,
    });
  }

  // Remove duplicidades por (turno, número) mantendo o primeiro
  const seen = new Set<string>();
  return out
    .filter((p) => {
      const k = `${p.shift}-${p.period_number}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.period_number - b.period_number);
}

/** Extrai o texto de todas as páginas do PDF (client-side, sem upload). */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const chunks: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Reagrupa por linha usando a coordenada Y
    const rows = new Map<number, string[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const y = Math.round((item.transform?.[5] ?? 0) / 4);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push(item.str);
    }
    const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]);
    chunks.push(sorted.map(([, parts]) => parts.join(" ")).join("\n"));
  }

  try { await doc.destroy(); } catch { /* ignore */ }
  return chunks.join("\n");
}

/** Lê o PDF e devolve os tempos encontrados (o arquivo é descartado depois). */
export async function readPeriodsFromPdf(file: File, shiftHint?: ParsedShift): Promise<ParsedPeriod[]> {
  const text = await extractPdfText(file);
  return parsePeriodsFromText(text, shiftHint);
}
