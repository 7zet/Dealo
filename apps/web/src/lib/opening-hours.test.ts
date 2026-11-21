import { describe, expect, it } from 'vitest';

import { formatDayHours, groupOpeningHours } from './opening-hours';

describe('opening hours', () => {
  it('formats an [open, close] pair with an en dash instead of a comma', () => {
    expect(formatDayHours(['09:00', '20:00'])).toBe('09:00–20:00');
    expect(formatDayHours('09:00-20:00')).toBe('09:00–20:00');
    expect(
      formatDayHours([
        ['09:00', '13:00'],
        ['14:00', '20:00'],
      ]),
    ).toBe('09:00–13:00, 14:00–20:00');
    expect(formatDayHours(null)).toBeNull();
  });

  it('groups consecutive days with the same hours and keeps closed days', () => {
    const week = ['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => [day, ['09:00', '20:00']]);
    expect(
      groupOpeningHours({ ...Object.fromEntries(week), sat: ['10:00', '18:00'], sun: null }),
    ).toEqual([
      { from: 'mon', to: 'fri', hours: '09:00–20:00' },
      { from: 'sat', to: 'sat', hours: '10:00–18:00' },
      { from: 'sun', to: 'sun', hours: null },
    ]);
    expect(groupOpeningHours({})).toEqual([]);
  });
});
