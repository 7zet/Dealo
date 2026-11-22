/**
 * Dates are shown in Uzbekistan time, whatever the time zone of the server or the visitor's browser:
 * a voucher that expires at 23:59 in Tashkent must show the same date in London or Tokyo.
 * next-intl formats with this zone (i18n/request.ts); client components use formatTashkentDateTime.
 */
export const APP_TIME_ZONE = 'Asia/Tashkent';

/** Uzbekistan has used UTC+5 without daylight saving since 1992, so a fixed offset is exact. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * "21.11.2026 14:05" in Tashkent time. Built from digits only, so the server render and the browser
 * render are identical (Intl output differs between Node and browsers and breaks hydration).
 */
export function formatTashkentDateTime(value: string | Date): string {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  if (Number.isNaN(time)) return '';
  const local = new Date(time + TASHKENT_OFFSET_MS);
  const date = `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.${local.getUTCFullYear()}`;
  return `${date} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** "2026-11-21T14:05" for a datetime-local field, in Tashkent time. */
export function toTashkentInput(value: string | Date): string {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  if (Number.isNaN(time)) return '';
  const local = new Date(time + TASHKENT_OFFSET_MS);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/**
 * The instant a datetime-local value means when read as Tashkent time, so a deal starts at the same
 * moment whatever the time zone of the browser it was entered in. Invalid Date for an empty field.
 */
export function fromTashkentInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - TASHKENT_OFFSET_MS);
}

/** Midnight of the current Tashkent day. */
export function startOfTashkentDay(now: Date): Date {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TASHKENT_OFFSET_MS,
  );
}
