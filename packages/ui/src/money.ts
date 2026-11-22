import type { Currency, Locale } from '@dealo/config';

/** Money is stored and sent as tiyin (1 so'm = 100 tiyin), per ADR-0003. */
export const TIYIN_PER_SOM = 100;

/** Converts a so'm figure typed by a person into the tiyin amount the API expects. */
export function tiyinFromSom(som: number): number {
  return Math.round(som * TIYIN_PER_SOM);
}

export function formatMoney(tiyin: number, locale: Locale, currency: Currency): string {
  const som = Math.round(tiyin / TIYIN_PER_SOM);
  // Grouped by hand: server (Node ICU) and browsers disagree on uz-UZ separators, which breaks hydration.
  const separator = locale === 'en' ? ',' : ' ';
  const value = String(Math.abs(som)).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const signed = som < 0 ? `-${value}` : value;
  if (currency !== 'UZS') throw new RangeError(`unsupported currency ${currency}`);
  if (locale === 'ru') return `${signed} сум`;
  if (locale === 'en') return `${signed} UZS`;
  return `${signed} so'm`;
}

export function discountPercent(original: number, deal: number): number {
  return original <= 0 ? 0 : Math.round(((original - deal) * 100) / original);
}
