'use client';

import { publicApi, type DealSummary } from '@dealo/api-client';
import type { Currency, Locale } from '@dealo/config';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FEED_CHUNK as CHUNK, FEED_MORE } from '@/lib/feed';
import { DealCard } from './deal-card';

/**
 * Deal feed with a "Load more" button: the first 30 deals render with the page, each click adds about
 * 50 more. Cards outside the viewport skip rendering work (content-visibility), so long feeds stay smooth.
 */
export function DealFeed({
  initial,
  total,
  query,
  locale,
  currency,
}: {
  initial: DealSummary[];
  total: number;
  query: Record<string, string>;
  locale: Locale;
  currency: Currency;
}) {
  const t = useTranslations('Home');
  const [deals, setDeals] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const done = deals.length >= total;

  const loadMore = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const firstPage = Math.floor(deals.length / CHUNK) + 1;
      const pages = await Promise.all(
        Array.from({ length: FEED_MORE / CHUNK }, (_, index) =>
          publicApi.deals(
            new URLSearchParams({
              ...query,
              page_size: String(CHUNK),
              page: String(firstPage + index),
            }),
          ),
        ),
      );
      setDeals((current) => {
        const seen = new Set(current.map((deal) => deal.id));
        const fresh = pages.flatMap((page) => page.items).filter((deal) => !seen.has(deal.id));
        return [...current, ...fresh];
      });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="deal-grid deal-grid--long">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} locale={locale} currency={currency} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 py-10 text-small text-ink-muted">
        {failed && <p>{t('feedError')}</p>}
        {done ? (
          <span>{t('feedEnd')}</span>
        ) : (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex min-w-48 items-center justify-center gap-2 rounded-round-ui bg-night px-7 py-3 font-bold text-surface transition hover:bg-brand hover:shadow-[0_0_28px_rgb(255_122_26/55%)] disabled:opacity-70"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {loading ? t('feedLoading') : t('loadMore')}
          </button>
        )}
        <span className="text-label text-ink-faint">
          {t('feedCount', { shown: deals.length, total })}
        </span>
      </div>
    </>
  );
}
