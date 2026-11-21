import { describe, expect, it } from 'vitest';

import { formatVoucherCode, isCompleteVoucherCode } from './voucher-code';

describe('formatVoucherCode', () => {
  it('uppercases, strips spaces and inserts the dash', () => {
    expect(formatVoucherCode('ab12cd34')).toBe('AB12-CD34');
    expect(formatVoucherCode(' ab12 cd34 ')).toBe('AB12-CD34');
    expect(formatVoucherCode('ab12-cd34')).toBe('AB12-CD34');
    expect(formatVoucherCode('ab1')).toBe('AB1');
    expect(formatVoucherCode('ab12c')).toBe('AB12-C');
  });

  it('switches to the backup shape for nine or ten characters', () => {
    expect(formatVoucherCode('abcde fghjk')).toBe('ABCDE-FGHJK');
    expect(formatVoucherCode('ABCD-EFGHJ')).toBe('ABCDE-FGHJ');
    expect(formatVoucherCode('abcdefghjkmn')).toBe('ABCDE-FGHJK');
  });
});

describe('isCompleteVoucherCode', () => {
  it('accepts both shapes only', () => {
    expect(isCompleteVoucherCode('AB12-CD34')).toBe(true);
    expect(isCompleteVoucherCode('ABCDE-FGHJK')).toBe(true);
    expect(isCompleteVoucherCode('AB12-CD3')).toBe(false);
    expect(isCompleteVoucherCode('')).toBe(false);
  });
});
