import type { DealSummary } from '@dealo/api-client';
import type { Currency, Locale } from '@dealo/config';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { DealCard } from './deal-card';

export async function DealGrid({
  deals,
  locale,
  currency,
  emptyAction,
}: {
  deals: DealSummary[];
  locale: Locale;
  currency: Currency;
  /** The way out of an empty result, such as clearing the filters of the current listing. */
  emptyAction?: { href: string; label: string } | undefined;
}) {
  const t = await getTranslations('Common');
  if (!deals.length)
    return (
      <div className="rounded-panel-ui border bg-surface px-6 py-16 text-center">
        <h2 className="text-subtitle font-semibold">{t('emptyTitle')}</h2>
        <p className="mt-2 text-ink-muted">{t('emptyText')}</p>
        {emptyAction && (
          <Link
            className="mt-6 inline-block rounded-control-ui bg-brand px-4 py-3 font-semibold text-surface"
            href={emptyAction.href}
          >
            {emptyAction.label}
          </Link>
        )}
      </div>
    );
  return (
    <div className="deal-grid">
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} locale={locale} currency={currency} />
      ))}
    </div>
  );
}
