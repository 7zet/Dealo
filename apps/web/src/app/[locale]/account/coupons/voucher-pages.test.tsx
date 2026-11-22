import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@dealo/i18n/messages/en';

// The pages are server components; their server-only collaborators are replaced with plain stubs.
// Translations and dates go through the real request config (src/i18n/request.ts).
vi.mock('next-intl/server', async () => {
  const intl = await import('next-intl');
  type Config = { locale: 'en'; timeZone?: string; messages: typeof messages };
  const requestConfig = async (): Promise<Config> => {
    const { default: load } = await import('@/i18n/request');
    const call = load as unknown as (params: { requestLocale: Promise<string> }) => Promise<Config>;
    return call({ requestLocale: Promise.resolve('en') });
  };
  return {
    getRequestConfig: (fn: unknown) => fn,
    getTranslations: async (namespace: 'Account') => {
      const config = await requestConfig();
      return intl.createTranslator({ locale: 'en', messages: config.messages, namespace });
    },
    getFormatter: async () => {
      const config = await requestConfig();
      return intl.createFormatter({
        locale: 'en',
        ...(config.timeZone ? { timeZone: config.timeZone } : {}),
      });
    },
  };
});
vi.mock('@/components/account-shell', () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/review-form', () => ({ ReviewForm: () => null }));
vi.mock('@/components/buyer-notifications', () => ({ BuyerNotifications: () => null }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA==' } }));

const voucher = {
  id: '018f0000-0000-7000-8000-0000000000aa',
  code: 'ABCD-1234',
  qr_token: 'signed-token',
  status: 'active',
  valid_from: '2026-11-02T18:30:00Z',
  // 23:59:59.999 in Tashkent on 2 December; already 3 December in Tokyo.
  valid_until: '2026-12-02T18:59:59.999Z',
  // The live deal was edited after purchase: new title, new price.
  deal: { title: { uz: 'Yangi', ru: 'Новое', en: 'Renamed deal' } },
  option: { deal_price: { amount: 99_900_000, currency: 'UZS' } },
  merchant: { display_name: 'Spa Lux' },
  // What the buyer agreed to.
  title_snapshot: { uz: 'Massaj 60', ru: 'Массаж 60', en: 'Massage 60 min' },
  unit_price_snapshot: { amount: 22_500_000, currency: 'UZS' },
  terms_snapshot: { uz: 'Shart', ru: 'Условие', en: 'Book a day ahead.' },
};

// The detail page reads this, so a test can swap in another state of the same voucher.
const detail: { voucher: Record<string, unknown>; reviews: unknown[] } = { voucher, reviews: [] };

vi.mock('@/lib/account-api', () => ({
  loadForVisitor: (_locale: string, _path: string, load: () => Promise<unknown>) => load(),
  accountGetOrNull: async (path: string) =>
    path === '/me/reviews' ? { items: detail.reviews } : detail.voucher,
  accountGet: async (path: string) =>
    path.startsWith('/me/vouchers')
      ? { items: [voucher], page: 1, page_size: 24, total: 1 }
      : { items: [] },
}));

const originalTZ = process.env.TZ;
beforeEach(() => {
  // A server or browser outside Uzbekistan.
  process.env.TZ = 'Asia/Tokyo';
});
afterEach(() => {
  cleanup();
  detail.voucher = voucher;
  detail.reviews = [];
  process.env.TZ = originalTZ;
});

describe('voucher pages', () => {
  it('detail shows the purchase snapshot and the Tashkent expiry date', async () => {
    const { default: VoucherPage } = await import('./[voucherId]/page');
    render(await VoucherPage({ params: Promise.resolve({ locale: 'en', voucherId: voucher.id }) }));

    expect(screen.getByRole('heading', { name: 'Massage 60 min' })).toBeInTheDocument();
    expect(screen.queryByText('Renamed deal')).not.toBeInTheDocument();
    expect(screen.getByText('225,000 UZS')).toBeInTheDocument();
    expect(screen.queryByText('999,000 UZS')).not.toBeInTheDocument();
    expect(screen.getByText('Book a day ahead.')).toBeInTheDocument();
    expect(
      screen.getByText(/^Valid until Dec 2, 2026, 11:59\sPM \(Tashkent time\)$/),
    ).toBeInTheDocument();
  });

  it('detail of a used voucher shows the used state and no QR', async () => {
    detail.voucher = { ...voucher, status: 'redeemed', redeemed_at: '2026-11-10T09:00:00Z' };
    const { default: VoucherPage } = await import('./[voucherId]/page');
    render(await VoucherPage({ params: Promise.resolve({ locale: 'en', voucherId: voucher.id }) }));

    expect(screen.queryByAltText(messages.Account.qrAlt)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.Account.brightnessHint)).not.toBeInTheDocument();
    expect(screen.getByText(messages.Account.voucherUsedTitle)).toBeInTheDocument();
    expect(screen.getByText('Used on Nov 10, 2026')).toBeInTheDocument();
  });

  it('detail of a reviewed voucher shows the review instead of the form', async () => {
    detail.voucher = { ...voucher, status: 'redeemed', redeemed_at: '2026-11-10T09:00:00Z' };
    detail.reviews = [
      { voucher_id: voucher.id, rating: 4, text: 'Great massage, friendly staff.' },
    ];
    const { default: VoucherPage } = await import('./[voucherId]/page');
    render(await VoucherPage({ params: Promise.resolve({ locale: 'en', voucherId: voucher.id }) }));

    expect(screen.getByText(messages.Account.reviewWritten)).toBeInTheDocument();
    expect(screen.getByText('Great massage, friendly staff.')).toBeInTheDocument();
  });

  it('detail hides the placeholder terms backfilled for old orders', async () => {
    detail.voucher = { ...voucher, terms_snapshot: { uz: 'Shartlar', ru: 'Условия', en: 'Terms' } };
    const { default: VoucherPage } = await import('./[voucherId]/page');
    render(await VoucherPage({ params: Promise.resolve({ locale: 'en', voucherId: voucher.id }) }));

    expect(screen.getByAltText(messages.Account.qrAlt)).toBeInTheDocument();
    expect(screen.queryByText(messages.Account.termsTitle)).not.toBeInTheDocument();
  });

  it('list shows the purchase snapshot and the Tashkent expiry date', async () => {
    const { default: CouponsPage } = await import('./page');
    render(
      await CouponsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText('Massage 60 min')).toBeInTheDocument();
    expect(screen.queryByText('Renamed deal')).not.toBeInTheDocument();
    expect(screen.getByText('225,000 UZS')).toBeInTheDocument();
    expect(
      screen.getByText(/^Valid until Dec 2, 2026, 11:59\sPM \(Tashkent time\)$/),
    ).toBeInTheDocument();
  });
});
