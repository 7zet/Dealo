'use client';

import type { DealSummary } from '@dealo/api-client';
import { localized, type Currency, type Locale } from '@dealo/config';
import { discountPercent, formatMoney } from '@dealo/ui';
import { ArrowUpRight, Clock3, Star } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { PointerEvent } from 'react';
import { Link } from '@/i18n/navigation';

const cardRenderTime = Date.now();

export function DealCard({
  deal,
  locale,
  currency,
}: {
  deal: DealSummary;
  locale: Locale;
  currency: Currency;
}) {
  const t = useTranslations('Common');
  const reduced = useReducedMotion();
  const option = deal.options[0];
  const image = deal.media[0];
  if (!option || !image) return null;
  const days = Math.ceil((new Date(deal.ends_at).getTime() - cardRenderTime) / 86400000);
  const discount = discountPercent(option.original_price.amount, option.deal_price.amount);
  const trackCursor = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };
  const resetCursor = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty('--mx');
    event.currentTarget.style.removeProperty('--my');
  };
  return (
    <motion.article
      {...(!reduced ? { whileHover: { y: -4 } } : {})}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      onPointerMove={trackCursor}
      onPointerLeave={resetCursor}
      className="neon-card group h-full rounded-card-ui"
    >
      <Link
        className="relative z-[1] flex h-full flex-col overflow-hidden rounded-card-ui border bg-surface"
        href={`/deal/${deal.slug}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-brand-tint">
          <Image
            className="object-cover transition duration-500 group-hover:scale-[1.05] motion-reduce:transition-none"
            src={image.url}
            alt={localized(deal.title, locale)}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1600px) 20vw, 16vw"
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-night/45 to-transparent" />
          <span className="absolute left-3 top-3 rounded-round-ui bg-brand px-2.5 py-1 text-small font-extrabold text-surface shadow-[0_0_18px_rgb(255_122_26/55%)]">
            -{discount}%
          </span>
          {days > 0 && days <= 3 && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-round-ui bg-night/80 px-2.5 py-1 text-label font-semibold text-neon-soft backdrop-blur">
              <Clock3 className="size-3" />
              {t('daysLeft', { count: days })}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-1 text-label font-semibold uppercase tracking-wider text-ink-muted">
            {deal.merchant.display_name}
          </p>
          <p className="mt-1.5 line-clamp-2 min-h-12 font-bold leading-6 text-ink">
            {localized(deal.title, locale)}
          </p>
          {(deal.rating_count > 0 || deal.sold_count >= 50) && (
            <p className="mt-2 flex items-center gap-1 text-small text-ink-muted">
              {deal.rating_count > 0 && (
                <>
                  <Star className="size-4 fill-rating text-rating" aria-hidden />
                  <span className="font-semibold text-ink">{deal.rating_avg.toFixed(1)}</span>
                </>
              )}
              {deal.sold_count >= 50 && (
                <span className="truncate">
                  {deal.rating_count > 0 && ' · '}
                  {t('sold', { count: deal.sold_count })}
                </span>
              )}
            </p>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-4">
            <div>
              <div className="whitespace-nowrap tabular-nums text-lead font-extrabold text-ink">
                {formatMoney(option.deal_price.amount, locale, currency)}
              </div>
              <div className="whitespace-nowrap tabular-nums text-small text-ink-faint line-through">
                {formatMoney(option.original_price.amount, locale, currency)}
              </div>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-round-ui bg-night text-surface transition group-hover:bg-brand group-hover:shadow-[0_0_20px_rgb(255_122_26/60%)]">
              <ArrowUpRight className="size-4" />
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export function DealCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-card-ui border bg-surface">
      <div className="aspect-[4/3] bg-brand-tint" />
      <div className="space-y-3 p-4">
        <div className="h-5 rounded-control-ui bg-brand-tint" />
        <div className="h-4 w-3/4 rounded-control-ui bg-page" />
        <div className="h-7 w-1/2 rounded-control-ui bg-brand-tint" />
      </div>
    </div>
  );
}
