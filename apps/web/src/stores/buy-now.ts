'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The deal option the buyer picked with "Buy now". There is no cart (business rule): the selection
 * only carries the option(s) of the deal being bought right now and lives until the order is created.
 * Display fields are kept so checkout renders without refetching the deal.
 */
export type BuyNowItem = {
  optionId: string;
  quantity: number;
  title: string;
  dealSlug: string;
  unitPrice: number;
  originalPrice: number;
};

type BuyNowState = {
  items: BuyNowItem[];
  /** Replaces any earlier selection: a new "Buy now" never adds to a previous one. */
  select: (items: BuyNowItem[]) => void;
  clear: () => void;
};

/** Key of the persistent cart that older builds kept in localStorage; removed so it cannot leak. */
const LEGACY_CART_KEY = 'grupon-cart';

/** sessionStorage, guarded: it is per tab, ends with the browser session and may be unavailable. */
const tabStorage = createJSONStorage(() => {
  try {
    window.localStorage.removeItem(LEGACY_CART_KEY);
  } catch {
    // Storage blocked: nothing to clean up.
  }
  return window.sessionStorage;
});

export const useBuyNow = create<BuyNowState>()(
  persist(
    (set) => ({
      items: [],
      select: (items) => set({ items }),
      clear: () => set({ items: [] }),
    }),
    { name: 'grupon-buy-now', storage: tabStorage },
  ),
);

/** Forgets the selection; called after the order is created and on sign-out. */
export function clearBuyNow() {
  useBuyNow.getState().clear();
}
