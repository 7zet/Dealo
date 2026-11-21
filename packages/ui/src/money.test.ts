import { describe, expect, it, vi } from 'vitest';
import { discountPercent, formatMoney } from './money';

// Vitest runs in Node; this package does not depend on @types/node for one variable.
declare const process: { env: Record<string, string | undefined> };

describe('money helpers', () => {
  it('formats UZS by locale', () => {
    expect(formatMoney(15000000, 'uz', 'UZS')).toBe("150 000 so'm");
    expect(formatMoney(15000000, 'en', 'UZS')).toBe('150,000 UZS');
  });
  it('rounds discounts', () => expect(discountPercent(250000, 150000)).toBe(40));
});

describe('formatMoney determinism', () => {
  it('formats every locale by hand, with no Intl or toLocaleString', () => {
    const numberFormat = vi.spyOn(Intl, 'NumberFormat');
    const toLocale = vi.spyOn(Number.prototype, 'toLocaleString');
    try {
      expect(formatMoney(22_500_000, 'uz', 'UZS')).toBe("225 000 so'm");
      expect(formatMoney(22_500_000, 'ru', 'UZS')).toBe('225 000 сум');
      expect(formatMoney(22_500_000, 'en', 'UZS')).toBe('225,000 UZS');
      expect(numberFormat).not.toHaveBeenCalled();
      expect(toLocale).not.toHaveBeenCalled();
    } finally {
      numberFormat.mockRestore();
      toLocale.mockRestore();
    }
  });

  it('takes integer tiyin and shows whole so’m', () => {
    expect(formatMoney(0, 'en', 'UZS')).toBe('0 UZS');
    expect(formatMoney(99, 'en', 'UZS')).toBe('1 UZS');
    expect(formatMoney(149, 'en', 'UZS')).toBe('1 UZS');
    expect(formatMoney(-7_500_000, 'en', 'UZS')).toBe('-75,000 UZS');
    // The API's upper bound for one amount (commerce.MaxMoneyAmount) still formats exactly.
    expect(formatMoney(1_000_000_000_000_000, 'uz', 'UZS')).toBe("10 000 000 000 000 so'm");
  });

  it('gives the same text whatever the process time zone or default locale', () => {
    const original = process.env.TZ;
    const outputs = ['Asia/Tashkent', 'Europe/London', 'America/New_York'].map((zone) => {
      process.env.TZ = zone;
      return ['uz', 'ru', 'en'].map((locale) =>
        formatMoney(123_456_789, locale as 'uz' | 'ru' | 'en', 'UZS'),
      );
    });
    process.env.TZ = original;
    expect(new Set(outputs.map((row) => row.join('|'))).size).toBe(1);
  });

  it('refuses any currency other than UZS', () => {
    expect(() => formatMoney(100, 'en', 'USD' as 'UZS')).toThrow(RangeError);
  });
});
