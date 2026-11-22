import type { components } from '@dealo/api-client';
import { formatMoney } from '@dealo/ui';
import { getTranslations, getFormatter } from 'next-intl/server';
import QRCode from 'qrcode';
import { notFound } from 'next/navigation';

import { AccountShell } from '@/components/account-shell';
import { ReviewForm } from '@/components/review-form';
import { Link } from '@/i18n/navigation';
import { accountGetOrNull, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';

type Voucher = components['schemas']['Voucher'];
type LocalizedText = components['schemas']['LocalizedText'];
type MyReviewList = components['schemas']['MyReviewList'];

/**
 * Orders placed before terms were snapshotted were backfilled with this placeholder (migrations
 * 00022/00023). It carries no real terms, so the page shows no terms section for it.
 */
const BACKFILLED_TERMS: LocalizedText = { uz: 'Shartlar', ru: 'Условия', en: 'Terms' };

function realTerms(terms: LocalizedText, locale: string): string {
  const placeholder = (['uz', 'ru', 'en'] as const).every(
    (key) => terms[key].trim() === BACKFILLED_TERMS[key],
  );
  return placeholder ? '' : pickText(terms, locale);
}

export default async function VoucherPage({
  params,
}: {
  params: Promise<{ locale: string; voucherId: string }>;
}) {
  const { locale, voucherId } = await params;
  const t = await getTranslations('Account');
  const format = await getFormatter();

  const voucher = await loadForVisitor(locale, `/${locale}/account/coupons/${voucherId}`, () =>
    accountGetOrNull<Voucher>(`/me/vouchers/${encodeURIComponent(voucherId)}`),
  );
  if (!voucher) notFound();

  // Only an active voucher can be shown at the till: a used, expired or refunded one gets no QR.
  const usable = voucher.status === 'active';
  // The QR encodes the server-signed token only, never the raw voucher id.
  const qrDataUrl = usable
    ? await QRCode.toDataURL(voucher.qr_token, { margin: 1, width: 320 })
    : null;
  const terms = realTerms(voucher.terms_snapshot, locale);
  // A used voucher takes one review: show the one already written instead of a form that would fail.
  const review =
    voucher.status === 'redeemed'
      ? ((await accountGetOrNull<MyReviewList>('/me/reviews'))?.items.find(
          (item) => item.voucher_id === voucher.id,
        ) ?? null)
      : null;
  const statusLabel = {
    active: t('voucherActive'),
    redeemed: t('voucherRedeemed'),
    expired: t('voucherExpired'),
    refunded: t('voucherRefunded'),
    cancelled: t('voucherCancelled'),
  }[voucher.status];

  return (
    <AccountShell section="coupons" detail>
      <article className="mx-auto grid max-w-md justify-items-center gap-3 text-center sm:gap-5">
        {/* Title, price and terms come from the purchase snapshot (AT-06), not the live deal. */}
        <h2 className="text-lead font-semibold text-ink">
          {pickText(voucher.title_snapshot ?? voucher.deal.title, locale)}
        </h2>
        {qrDataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, not an optimizable asset */}
            <img
              src={qrDataUrl}
              alt={t('qrAlt')}
              width={320}
              height={320}
              // Capped on phones so the code is visible without scrolling.
              className="h-auto w-64 max-w-full rounded-card bg-surface p-3 sm:w-80"
            />
            <p className="text-sm text-ink-muted">{t('brightnessHint')}</p>
            <p className="text-sm text-ink-muted">
              {t('validUntil', {
                date: format.dateTime(new Date(voucher.valid_until), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Tashkent',
                }),
              })}
            </p>
          </>
        ) : (
          <div
            role="status"
            className="grid w-full gap-1 rounded-card border border-border bg-page p-4"
          >
            <p className="font-semibold text-ink">
              {voucher.status === 'redeemed' ? t('voucherUsedTitle') : t('voucherInactiveTitle')}
            </p>
            <p className="text-sm text-ink-muted">
              {voucher.status === 'redeemed' && voucher.redeemed_at
                ? t('usedAt', {
                    date: format.dateTime(new Date(voucher.redeemed_at), { dateStyle: 'medium' }),
                  })
                : statusLabel}
            </p>
          </div>
        )}
        <dl className="grid w-full gap-2 text-left">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t('codeLabel')}</dt>
            <dd className="font-mono font-semibold text-ink">{voucher.code}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t('merchantLabel')}</dt>
            <dd className="text-ink">{voucher.merchant.display_name}</dd>
          </div>
          {voucher.unit_price_snapshot && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t('pricePaid')}</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatMoney(
                  voucher.unit_price_snapshot.amount,
                  locale as Parameters<typeof formatMoney>[1],
                  'UZS',
                )}
              </dd>
            </div>
          )}
        </dl>
        {terms && (
          <section className="grid w-full gap-1 text-left">
            <h3 className="font-semibold text-ink">{t('termsTitle')}</h3>
            <p className="text-sm whitespace-pre-line text-ink-muted">{terms}</p>
          </section>
        )}
      </article>
      {voucher.status === 'redeemed' && (
        <div className="mx-auto mt-8 max-w-md">
          {review ? (
            <section className="grid gap-2 rounded-card border border-border bg-surface p-4">
              <h3 className="font-semibold text-ink">{t('reviewWritten')}</h3>
              <p aria-label={t('reviewRating', { rating: review.rating })} className="text-brand">
                {'★'.repeat(review.rating)}
                <span className="text-ink-faint">{'★'.repeat(5 - review.rating)}</span>
              </p>
              <p className="text-sm whitespace-pre-line text-ink-muted">{review.text}</p>
              <Link className="text-sm font-semibold text-brand" href="/account/reviews">
                {t('reviewManage')}
              </Link>
            </section>
          ) : (
            <ReviewForm voucherId={voucher.id} locale={locale} />
          )}
        </div>
      )}
    </AccountShell>
  );
}
