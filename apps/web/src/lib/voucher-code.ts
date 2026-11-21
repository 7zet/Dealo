/**
 * Voucher codes come in two shapes (see codePattern in services/api/internal/domain/redemption):
 * the printed code XXXX-XXXX and the backup code XXXXX-XXXXX. Cashiers type them with or without the
 * dash, in any case, sometimes with spaces; the field formats as they type.
 */
export const VOUCHER_CODE_MAX_LENGTH = 11;

/** Uppercases, drops everything but letters and digits, and inserts the dash for the likely shape. */
export function formatVoucherCode(raw: string): string {
  const chars = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  if (chars.length > 8) return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  if (chars.length > 4) return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  return chars;
}

/** True when the formatted code has one of the two complete shapes, so it is worth a lookup. */
export function isCompleteVoucherCode(code: string): boolean {
  return /^([A-Z0-9]{4}-[A-Z0-9]{4}|[A-Z0-9]{5}-[A-Z0-9]{5})$/.test(code);
}
