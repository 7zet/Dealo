import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { DealSummary } from '@dealo/api-client';
import messages from '@dealo/i18n/messages/en';
import { deals } from '@/mocks/data';
import { DealFeed } from './deal-feed';

const TOTAL = 120;
const all: DealSummary[] = Array.from({ length: TOTAL }, (_, index) => ({
  ...deals[0]!,
  id: `deal-${index}`,
  slug: `deal-${index}`,
}));

const dealsApi = vi.hoisted(() => vi.fn());
vi.mock('@dealo/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publicApi: { deals: dealsApi },
}));
dealsApi.mockImplementation(async (query: URLSearchParams) => {
  const size = Number(query.get('page_size'));
  const page = Number(query.get('page'));
  return { items: all.slice((page - 1) * size, page * size), page, page_size: size, total: TOTAL };
});

describe('DealFeed', () => {
  it('shows 30 deals, then adds the next 50 on each "Load more"', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DealFeed
          initial={all.slice(0, 30)}
          total={TOTAL}
          query={{ city: 'tashkent' }}
          locale="en"
          currency="UZS"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole('article')).toHaveLength(30);

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 80 of 120')).toBeInTheDocument();
    const links = screen
      .getAllByRole('article')
      .map((card) => card.querySelector('a')?.getAttribute('href'));
    expect(links).toEqual(all.slice(0, 80).map((deal) => `/deal/${deal.slug}`));

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 120 of 120')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});
