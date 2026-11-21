import { describe, expect, it } from 'vitest';

import { buildDealQuery, listingPageWindow, LISTING_MAX_PAGES } from './deal-query';

describe('listing pages', () => {
  it('shows every page up to the requested one so "Load more" appends', () => {
    expect(listingPageWindow(null)).toEqual([1]);
    expect(listingPageWindow('3')).toEqual([1, 2, 3]);
    expect(listingPageWindow('abc')).toEqual([1]);
  });

  it('keeps the window bounded on deep pages', () => {
    const window = listingPageWindow('25');
    expect(window).toHaveLength(LISTING_MAX_PAGES);
    expect(window.at(-1)).toBe(25);
  });

  it('maps friendly params to the API names', () => {
    const query = buildDealQuery({
      citySlug: 'tashkent',
      searchParams: { rating: '4', endingSoon: 'true', sort: 'bogus', page: '2' },
    });
    expect(query.toString()).toBe('city=tashkent&min_rating=4&ending_soon=true&page=2');
  });
});
