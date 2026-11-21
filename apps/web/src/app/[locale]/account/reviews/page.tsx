import type { components } from '@grupon/api-client';
import { CircleAlert, MessageSquareReply, Star, Ticket } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import { AccountShell } from '@/components/account-shell';
import { MyReviewActions } from '@/components/my-review-actions';
import { Link } from '@/i18n/navigation';
import { accountGet, loadForVisitor, SessionRequiredError } from '@/lib/account-api';
import { pickText } from '@/lib/localized';

type MyReviewList = components['schemas']['MyReviewList'];

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={value <= rating ? 'size-4 fill-current text-rating' : 'size-4 text-ink-faint'}
        />
      ))}
    </span>
  );
}

export default async function ReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, common, format] = await Promise.all([
    getTranslations('Account'),
    getTranslations('Common'),
    getFormatter(),
  ]);
  // A failing review service shows an inline notice instead of taking the whole account page down.
  const list = await loadForVisitor(locale, `/${locale}/account/reviews`, async () => {
    try {
      return await accountGet<MyReviewList>('/me/reviews');
    } catch (error) {
      if (error instanceof SessionRequiredError) throw error;
      return null;
    }
  });

  return (
    <AccountShell section="reviews">
      {list === null ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-panel-ui border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-ink">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-error" />
            {t('reviewsLoadError')}
          </p>
          <Link
            href="/account/reviews"
            className="w-fit rounded-control-ui border border-border px-4 py-2 text-small font-semibold text-ink hover:border-brand"
          >
            {t('retry')}
          </Link>
        </div>
      ) : list.items.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-panel-ui border border-border bg-surface px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-round-ui bg-brand-tint text-brand">
            <Star aria-hidden="true" className="size-6" />
          </span>
          <p className="text-lead font-bold text-ink">{t('reviewsEmptyTitle')}</p>
          <p className="max-w-md text-ink-muted">{t('reviewsEmptyText')}</p>
          <Link
            href="/account/coupons"
            className="mt-2 inline-flex items-center gap-2 rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface hover:bg-brand-hover"
          >
            <Ticket aria-hidden="true" className="size-4" />
            {t('reviewsEmptyCta')}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {list.items.map((review) => (
            <li key={review.id}>
              <article className="grid gap-3 rounded-panel-ui border border-border bg-surface p-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/deal/${review.deal_slug}`}
                      className="font-semibold text-ink hover:text-brand"
                    >
                      {pickText(review.deal_title, locale)}
                    </Link>
                    <p className="text-small text-ink-muted">{review.merchant_name}</p>
                  </div>
                  {review.status !== 'published' && (
                    <span
                      className={
                        review.status === 'hidden'
                          ? 'rounded-round-ui bg-error-tint px-3 py-1 text-label font-semibold text-error'
                          : 'rounded-round-ui bg-brand-tint px-3 py-1 text-label font-semibold text-brand'
                      }
                    >
                      {review.status === 'hidden'
                        ? t('reviewStatusHidden')
                        : t('reviewStatusPending')}
                    </span>
                  )}
                </header>
                <div className="flex flex-wrap items-center gap-3">
                  <Stars
                    rating={review.rating}
                    label={common('rating', { rating: review.rating })}
                  />
                  <time dateTime={review.created_at} className="text-small text-ink-muted">
                    {format.dateTime(new Date(review.created_at), { dateStyle: 'medium' })}
                  </time>
                </div>
                <p className="whitespace-pre-line text-ink">{review.text}</p>
                {review.reply && (
                  <div className="rounded-control-ui bg-page p-4">
                    <p className="inline-flex items-center gap-2 text-small font-semibold text-ink">
                      <MessageSquareReply aria-hidden="true" className="size-4 text-brand" />
                      {t('merchantReply', { merchant: review.merchant_name })}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-small text-ink-muted">
                      {review.reply.text}
                    </p>
                  </div>
                )}
                <MyReviewActions
                  review={{
                    id: review.id,
                    rating: review.rating,
                    text: review.text,
                    locale: review.locale,
                  }}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
