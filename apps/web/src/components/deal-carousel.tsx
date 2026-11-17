'use client';

import type { DealSummary } from '@grupon/api-client';
import type { Currency, Locale } from '@grupon/config';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DealCard } from './deal-card';

/** One horizontal row of deals with side arrows; the number of visible cards follows the screen width. */
export function DealCarousel({
  deals,
  locale,
  currency,
}: {
  deals: DealSummary[];
  locale: Locale;
  currency: Currency;
}) {
  const t = useTranslations('Home');
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const element = rail.current;
    if (!element) return;
    setEdges({
      start: element.scrollLeft <= 4,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const element = rail.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: 'smooth' });
  };

  const arrow =
    'absolute top-[38%] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-round-ui bg-surface text-ink shadow-floating-ui ring-1 ring-border transition hover:bg-night hover:text-surface hover:shadow-[0_0_24px_rgb(255_122_26/55%)] md:grid';

  return (
    <div className="relative">
      <div ref={rail} className="deal-rail" onScroll={measure}>
        {deals.map((deal) => (
          <div className="deal-rail-item" key={deal.id}>
            <DealCard deal={deal} locale={locale} currency={currency} />
          </div>
        ))}
      </div>
      {!edges.start && (
        <button
          type="button"
          aria-label={t('previous')}
          className={`${arrow} -left-5`}
          onClick={() => page(-1)}
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {!edges.end && (
        <button
          type="button"
          aria-label={t('next')}
          className={`${arrow} -right-5`}
          onClick={() => page(1)}
        >
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}
