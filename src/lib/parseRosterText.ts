// Leitura local (sem IA) de um quadro de professores colado em texto.
// Formato aceito por linha (separadores: tab, ; ou |):
//   SEG | 1 | 101 | Anderson Lima | Matemática | Sala 3
// Dia e tempo podem vir em qualquer ordem nos dois primeiros campos.

export interface RosterRowInput {
  weekday: number;         // 1=seg ... 6=sáb
  period_number: number;
  class_name: string;
  teacher_name: string;
  discipline: string | null;
  room_name: string | null;
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/^(seg|segunda|2a|2ª)/i, 1],
  [/^(ter|terca|terça|3a|3ª)/i, 2],
  [/^(qua|quarta|4a|4ª)/i, 3],
  [/^(qui|quinta|5a|5ª)/i, 4],
  [/^(sex|sexta|6a|6ª)/i, 5],
  [/^(sab|sáb|sabado|sábado)/i, 6],
];

export function weekdayFromToken(token: string): number | null {
  const t = token.trim();
  for (const [re, n] of WEEKDAYS) if (re.test(t)) return n;
  const num = Number(t);
  if (num >= 1 && num <= 6) return num;
  return null;
}

export function parseRosterTextLocally(text: string): RosterRowInput[] {
  const out: RosterRowInput[] = [];
  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(dia|weekday|turma|professor)\b/i.test(line)) continue;
    const parts = line.split(/\t|\s*[;|]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 4) continue;

    let weekday = weekdayFromToken(parts[0]);
    let periodIdx = 1;
    if (weekday === null) {
      weekday = weekdayFromToken(parts[1]);
      periodIdx = 0;
    }
    if (weekday === null) continue;

    const period = parseInt((parts[periodIdx] ?? "").replace(/\D/g, ""), 10);
    if (!period || period > 20) continue;

    const rest = parts.slice(2);
    const class_name = (rest[0] ?? "").trim();
    const teacher_name = (rest[1] ?? "").trim();
    if (!class_name || !teacher_name) continue;

    out.push({
      weekday,
      period_number: period,
      class_name,
      teacher_name,
      discipline: rest[2] ? rest[2] : null,
      room_name: rest[3] ? rest[3] : null,
    });
  }
  return out;
}
