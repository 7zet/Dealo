import { describe, expect, it } from 'vitest';

import { safeNextPath, stripLocalePrefix } from './safe-next';

describe('safeNextPath', () => {
  it('keeps same-site relative paths without a locale', () => {
    expect(safeNextPath('/merchant/register')).toBe('/merchant/register');
    expect(safeNextPath('/deal/spa-day?option=2')).toBe('/deal/spa-day?option=2');
  });

  it('drops a locale prefix so the locale-aware router cannot produce /en/en/…', () => {
    // Server guards build return paths like `/${locale}/account/profile`.
    expect(safeNextPath('/en/account/profile')).toBe('/account/profile');
    expect(safeNextPath('/uz/merchant/dashboard')).toBe('/merchant/dashboard');
    expect(safeNextPath('/ru/merchant/deals?page=2')).toBe('/merchant/deals?page=2');
    expect(safeNextPath('/en')).toBe('/');
    expect(safeNextPath('/en?x=1')).toBe('/?x=1');
  });

  it('leaves paths that only start like a locale untouched', () => {
    expect(safeNextPath('/english')).toBe('/english');
    expect(safeNextPath('/de/account')).toBe('/de/account');
  });

  it('rejects absolute, protocol-relative and backslash targets', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/en//evil.example')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});

describe('stripLocalePrefix', () => {
  it('strips only a known locale segment', () => {
    expect(stripLocalePrefix('/uz')).toBe('/');
    expect(stripLocalePrefix('/uz/')).toBe('/');
    expect(stripLocalePrefix('/en/en/account')).toBe('/en/account');
    expect(stripLocalePrefix('/account')).toBe('/account');
  });
});
