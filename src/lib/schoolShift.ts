export type SchoolShift = "manha" | "tarde" | "noite";

type SchoolPeriodLike = {
  shift: SchoolShift | string | null | undefined;
  period_number?: number | null | undefined;
  start_time: string | null | undefined;
  end_time: string | null | undefined;
};

const SHIFT_ORDER: SchoolShift[] = ["manha", "tarde", "noite"];

function toHHMMSS(value: string | null | undefined): string {
  const [h = "00", m = "00", s = "00"] = (value ?? "00:00:00").split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

export function clockShift(date: Date): SchoolShift {
  const h = date.getHours();
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export function schoolTimeShift(periods: SchoolPeriodLike[], date: Date, fallback: SchoolShift = clockShift(date)): SchoolShift {
  const nowTime = toHHMMSS(`${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`);
  const ranges = SHIFT_ORDER
    .map((shift) => {
      const times = periods
        .filter((p) => p.shift === shift && p.start_time && p.end_time)
        .map((p) => ({ start: toHHMMSS(p.start_time), end: toHHMMSS(p.end_time) }))
        .sort((a, b) => a.start.localeCompare(b.start));
      if (times.length === 0) return null;
      return {
        shift,
        firstStart: times[0].start,
        lastEnd: times.reduce((max, p) => (p.end > max ? p.end : max), times[0].end),
      };
    })
    .filter((r): r is { shift: SchoolShift; firstStart: string; lastEnd: string } => !!r);

  if (ranges.length === 0) return fallback;
  if (nowTime < ranges[0].firstStart) return ranges[0].shift;

  for (const range of ranges) {
    if (nowTime >= range.firstStart && nowTime <= range.lastEnd) return range.shift;
  }

  let lastStarted = ranges[0];
  for (const range of ranges) {
    if (nowTime < range.firstStart) return lastStarted.shift;
    lastStarted = range;
  }
  return ranges[ranges.length - 1].shift;
}

export function currentSchoolPeriod<T extends SchoolPeriodLike>(periods: T[], shift: SchoolShift, date: Date): T | undefined {
  const nowTime = toHHMMSS(`${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`);
  const shiftPeriods = periods
    .filter((p) => p.shift === shift)
    .sort((a, b) => (a.period_number ?? 0) - (b.period_number ?? 0));
  if (shiftPeriods.length === 0) return undefined;
  const active = shiftPeriods.find((p) => toHHMMSS(p.start_time) <= nowTime && toHHMMSS(p.end_time) > nowTime);
  if (active) return active;
  const started = shiftPeriods.filter((p) => toHHMMSS(p.start_time) <= nowTime);
  if (started.length > 0) return started[started.length - 1];
  return shiftPeriods[0];
}