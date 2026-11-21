import { createFormatter } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_TIME_ZONE, formatTashkentDateTime } from './dates';

// A voucher bought on 2 November with 30 valid days ends at 23:59:59.999 Tashkent time on 2 December,
// which is 18:59:59.999 UTC. Tokyo is already on 3 December at that moment; London is on 2 December.
const EXPIRY = '2026-12-02T18:59:59.999Z';

const originalTZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTZ;
});

describe.each(['Europe/London', 'Asia/Tokyo', 'America/Los_Angeles'])('in a %s browser', (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
  });

  it('shows the Tashkent expiry date and time', () => {
    expect(formatTashkentDateTime(EXPIRY)).toBe('02.12.2026 23:59');
    expect(formatTashkentDateTime(new Date(EXPIRY))).toBe('02.12.2026 23:59');
  });

  it('formats next-intl dates in Tashkent time', () => {
    const format = createFormatter({ locale: 'en', timeZone: APP_TIME_ZONE });
    expect(format.dateTime(new Date(EXPIRY), { dateStyle: 'medium' })).toBe('Dec 2, 2026');
    expect(
      format.dateTime(new Date(EXPIRY), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    ).toBe('23:59');
  });
});

describe('formatTashkentDateTime', () => {
  it('crosses midnight with the Tashkent offset', () => {
    // 19:30 UTC on 21 November is 00:30 on 22 November in Tashkent.
    expect(formatTashkentDateTime('2026-11-21T19:30:00Z')).toBe('22.11.2026 00:30');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatTashkentDateTime('not a date')).toBe('');
  });

  it('would show the wrong day without an explicit zone (the bug this prevents)', () => {
    process.env.TZ = 'Asia/Tokyo';
    const browserZone = createFormatter({ locale: 'en', timeZone: 'Asia/Tokyo' });
    expect(browserZone.dateTime(new Date(EXPIRY), { dateStyle: 'medium' })).toBe('Dec 3, 2026');
  });
});
