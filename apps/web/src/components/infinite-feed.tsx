'use client';

import { publicApi, type DealSummary } from '@grupon/api-client';
import type { Currency, Locale } from '@grupon/config';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { DealCard } from './deal-card';

/** Deal feed that loads the next page whenever the visitor nears the bottom. */
export function InfiniteFeed({
  initial,
  total,
  pageSize,
  query,
  locale,
  currency,
}: {
  initial: DealSummary[];
  total: number;
  pageSize: number;
  query: Record<string, string>;
  locale: Locale;
  currency: Currency;
}) {
  const t = useTranslations('Home');
  const [deals, setDeals] = useState(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const done = page * pageSize >= total;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || done || loading || failed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setLoading(true);
        publicApi
          .deals(new URLSearchParams({ ...query, page: String(page + 1) }))
          .then((result) => {
            setDeals((current) => {
              const seen = new Set(current.map((deal) => deal.id));
              return [...current, ...result.items.filter((deal) => !seen.has(deal.id))];
            });
            setPage(result.page);
          })
          .catch(() => setFailed(true))
          .finally(() => setLoading(false));
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [done, loading, failed, page, query]);

  return (
    <>
      <div className="deal-grid">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} locale={locale} currency={currency} />
        ))}
      </div>
      <div ref={sentinel} className="flex justify-center py-10 text-small text-ink-muted">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin text-brand" />
            {t('feedLoading')}
          </span>
        ) : (
          done && <span>{t('feedEnd')}</span>
        )}
      </div>
    </>
  );
}
