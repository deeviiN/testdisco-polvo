// Brazilian holidays for calendar highlighting
// National, regional (Roraima), and municipal (Boa Vista) holidays

export interface Holiday {
  date: string; // MM-DD format
  name: string;
  type: "national" | "state" | "municipal" | "custom";
}

// Feriados Nacionais (fixos)
export const NATIONAL_HOLIDAYS: Holiday[] = [
  { date: "01-01", name: "Confraternização Universal", type: "national" },
  { date: "04-21", name: "Tiradentes", type: "national" },
  { date: "05-01", name: "Dia do Trabalho", type: "national" },
  { date: "09-07", name: "Independência do Brasil", type: "national" },
  { date: "10-12", name: "Nossa Sra. Aparecida", type: "national" },
  { date: "11-02", name: "Finados", type: "national" },
  { date: "11-15", name: "Proclamação da República", type: "national" },
  { date: "11-20", name: "Consciência Negra", type: "national" },
  { date: "12-25", name: "Natal", type: "national" },
];

// Feriados Estaduais — Roraima
export const STATE_HOLIDAYS_RR: Holiday[] = [
  { date: "10-05", name: "Criação do Estado de Roraima", type: "state" },
];

// Feriados Municipais — Boa Vista/RR
export const MUNICIPAL_HOLIDAYS_BV: Holiday[] = [
  { date: "06-09", name: "Aniversário de Boa Vista", type: "municipal" },
];

// Feriados móveis — precalculados por ano
// Carnival, Good Friday, Corpus Christi depend on Easter
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getMovableHolidays(year: number): Holiday[] {
  const easter = getEasterDate(year);
  const ms = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const carnival1 = new Date(easter);
  carnival1.setDate(easter.getDate() - 48); // Monday
  const carnival2 = new Date(easter);
  carnival2.setDate(easter.getDate() - 47); // Tuesday

  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);

  return [
    { date: ms(carnival1), name: "Carnaval (segunda)", type: "national" },
    { date: ms(carnival2), name: "Carnaval (terça)", type: "national" },
    { date: ms(goodFriday), name: "Sexta-feira Santa", type: "national" },
    { date: ms(easter), name: "Páscoa", type: "national" },
    { date: ms(corpusChristi), name: "Corpus Christi", type: "national" },
  ];
}

export function getAllHolidaysForYear(year: number, customHolidays: Holiday[] = []): Holiday[] {
  return [
    ...NATIONAL_HOLIDAYS,
    ...getMovableHolidays(year),
    ...STATE_HOLIDAYS_RR,
    ...MUNICIPAL_HOLIDAYS_BV,
    ...customHolidays,
  ];
}

export function getHolidayForDate(date: Date, holidays: Holiday[]): Holiday | undefined {
  const key = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return holidays.find((h) => h.date === key);
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export const HOLIDAY_COLORS: Record<Holiday["type"], string> = {
  national: "bg-destructive/20 text-destructive font-bold",
  state: "bg-primary/20 text-primary font-bold",
  municipal: "bg-warning/20 text-warning font-bold",
  custom: "bg-accent/20 text-accent font-bold",
};

// Storage key for custom holidays
export const CUSTOM_HOLIDAYS_KEY = "salavida_custom_holidays";

export function loadCustomHolidays(): Holiday[] {
  try {
    const raw = localStorage.getItem(CUSTOM_HOLIDAYS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomHolidays(holidays: Holiday[]) {
  localStorage.setItem(CUSTOM_HOLIDAYS_KEY, JSON.stringify(holidays));
}
