import type { components } from '@dealo/api-client';
import { MessageSquare, Star } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import { MerchantReviewReply } from '@/components/merchant-review-reply';
import { EmptyState, PageHeader } from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { requirePanelPermission } from '@/lib/merchant-session';

type ReviewList = components['schemas']['ReviewList'];

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const reviewsRenderTime = Date.now();

/** Reviews of this business. One reply per review; the API allows edits for 24 hours after the reply is first written. */
export default async function ReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/reviews');
  const canReply = access.can('workspace.edit');
  const [t, ui, format] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const list = await loadForVisitor(locale, '/merchant/reviews', () =>
    accountGet<ReviewList>('/merchant/reviews'),
  );
  return (
    <>
      <PageHeader title={t('reviewsTitle')} description={ui('reviewsSubtitle')} />
      {list.items.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t('reviewsEmpty')} text={ui('reviewsEmptyHint')} />
      ) : (
        <ul className="grid gap-4">
          {list.items.map((review) => (
            <li
              key={review.id}
              className="grid gap-3 rounded-card-ui border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-small">
                <span
                  className="flex items-center gap-1 font-semibold text-ink"
                  aria-label={`${t('rating')}: ${review.rating}/5`}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      aria-hidden="true"
                      className={`size-4 ${value <= review.rating ? 'fill-rating text-rating' : 'text-border'}`}
                    />
                  ))}
                  <span className="ml-1 tabular-nums">{review.rating}/5</span>
                </span>
                <span className="text-ink-muted">
                  {format.dateTime(new Date(review.created_at), { dateStyle: 'medium' })}
                </span>
              </div>
              <p className="text-ink">{review.text}</p>
              {canReply ? (
                <MerchantReviewReply
                  reviewId={review.id}
                  initialText={review.reply?.text ?? null}
                  canEdit={
                    review.reply
                      ? reviewsRenderTime - Date.parse(review.reply.created_at) <= REPLY_WINDOW_MS
                      : true
                  }
                />
              ) : (
                review.reply && (
                  <p className="rounded-control-ui border-l-2 border-brand bg-page p-3 text-small text-ink-muted">
                    {review.reply.text}
                  </p>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
