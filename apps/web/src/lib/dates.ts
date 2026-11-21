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
