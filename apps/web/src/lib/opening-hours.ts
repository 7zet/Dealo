export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** One line of a branch timetable: consecutive days that share the same hours (null = closed). */
export type OpeningHoursRow = { from: WeekDay; to: WeekDay; hours: string | null };

/**
 * Formats one day of `opening_hours` as "09:00–20:00". The API stores `[open, close]`; a list of such
 * pairs (a lunch break) and a plain "09:00-20:00" string are accepted too. Anything else is closed.
 */
export function formatDayHours(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() ? raw.trim().replace(/\s*[-,–]\s*/, '–') : null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.every((part) => typeof part === 'string')) {
    return raw.length === 2 ? `${raw[0]}–${raw[1]}` : raw.join(', ');
  }
  const ranges = raw.map(formatDayHours).filter((range): range is string => Boolean(range));
  return ranges.length ? ranges.join(', ') : null;
}

/** Groups the week into rows of consecutive days with equal hours. An empty timetable gives no rows. */
export function groupOpeningHours(hours: Record<string, unknown> | null | undefined) {
  if (!hours || WEEK_DAYS.every((day) => !(day in hours))) return [];
  const rows: OpeningHoursRow[] = [];
  for (const day of WEEK_DAYS) {
    const value = formatDayHours(hours[day]);
    const last = rows.at(-1);
    if (last && last.hours === value) last.to = day;
    else rows.push({ from: day, to: day, hours: value });
  }
  return rows;
}
