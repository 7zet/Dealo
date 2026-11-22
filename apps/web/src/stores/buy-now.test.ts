import { afterEach, describe, expect, it } from 'vitest';

import { clearBuyNow, useBuyNow, type BuyNowItem } from './buy-now';

const item = (optionId: string, unitPrice: number): BuyNowItem => ({
  optionId,
  quantity: 1,
  title: optionId,
  dealSlug: optionId,
  unitPrice,
  originalPrice: unitPrice,
});

afterEach(() => clearBuyNow());

describe('buy-now selection', () => {
  it('replaces the previous selection instead of adding to it (no cart)', () => {
    useBuyNow.getState().select([item('deal-a', 22_500_000)]);
    useBuyNow.getState().select([item('deal-b', 42_780_000)]);
    expect(useBuyNow.getState().items.map((entry) => entry.optionId)).toEqual(['deal-b']);
  });

  it('lives in tab storage, never in the old persistent localStorage cart', () => {
    window.localStorage.setItem('dealo-cart', '{"state":{"items":[]}}');
    useBuyNow.getState().select([item('deal-a', 1)]);
    expect(window.localStorage.getItem('dealo-buy-now')).toBeNull();
    expect(window.sessionStorage.getItem('dealo-buy-now')).toContain('deal-a');
  });

  it('is emptied by clearBuyNow', () => {
    useBuyNow.getState().select([item('deal-a', 1)]);
    clearBuyNow();
    expect(useBuyNow.getState().items).toEqual([]);
  });
});
