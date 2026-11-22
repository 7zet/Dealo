import { publicApi } from '@dealo/api-client';
import { brandConfig, localized, type Locale } from '@dealo/config';
import { MapPin, Star } from 'lucide-react';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DealGrid } from '@/components/deal-grid';
import { MapView } from '@/components/map-view';
import { getCurrency } from '@/lib/preferences';
type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const merchant = await publicApi.merchant(slug);
    const description = localized(merchant.description, locale);
    return {
      title: merchant.display_name,
      description,
      alternates: { canonical: `/${locale}/business/${slug}` },
      openGraph: {
        title: merchant.display_name,
        description,
        images: merchant.cover_url ? [merchant.cover_url] : [],
      },
    };
  } catch {
    const t = await getTranslations({ locale, namespace: 'ErrorPage' });
    return { title: t('notFoundTitle'), robots: { index: false } };
  }
}

/** First letters of the first two words, for the logo placeholder ("Silk Road Cafe" → "SR"). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export default async function BusinessPage({ params }: Props) {
  const { locale, slug } = await params;
  let merchant;
  try {
    merchant = await publicApi.merchant(slug);
  } catch {
    notFound();
  }
  const [t, currency] = await Promise.all([getTranslations('Merchant'), getCurrency()]);
  const locations = merchant.locations ?? [];
  return (
    <div>
      <section className="relative h-56 overflow-hidden bg-night sm:h-80">
        {merchant.cover_url ? (
          <Image src={merchant.cover_url} alt="" fill className="object-cover" priority />
        ) : (
          // Branded placeholder until the merchant uploads a cover: the same glow as the home hero.
          <div aria-hidden className="absolute inset-0">
            <div className="absolute -left-24 -top-32 size-[30rem] rounded-full bg-[radial-gradient(circle,rgb(255_122_26/45%),transparent_65%)]" />
            <div className="absolute -bottom-40 right-0 size-[26rem] rounded-full bg-[radial-gradient(circle,rgb(255_122_26/25%),transparent_65%)]" />
            <span className="absolute bottom-6 right-6 text-title font-extrabold tracking-tight text-surface/15 sm:right-10">
              {brandConfig.name}
            </span>
          </div>
        )}
      </section>
      <div className="mx-auto max-w-layout px-4 sm:px-6 lg:px-8">
        <div className="-mt-12 relative flex items-end gap-4">
          {merchant.logo_url ? (
            <Image
              src={merchant.logo_url}
              alt={merchant.display_name}
              width={112}
              height={112}
              className="size-28 rounded-panel-ui border-4 border-surface bg-surface object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-28 shrink-0 place-items-center rounded-panel-ui border-4 border-surface bg-gradient-to-br from-neon to-brand text-title-small font-extrabold text-surface shadow-[0_8px_24px_-6px_rgb(255_106_0/70%)]"
            >
              {initials(merchant.display_name)}
            </span>
          )}
          <div className="pb-2">
            <h1 className="text-title-small font-bold">{merchant.display_name}</h1>
            <p className="mt-1 flex items-center gap-1 text-small text-ink-muted">
              <Star className="size-4 fill-rating text-rating" />
              {merchant.rating_avg.toFixed(1)} ({merchant.rating_count})
            </p>
          </div>
        </div>
        <section className="py-10">
          <h2 className="text-subtitle font-bold">{t('about')}</h2>
          <p className="mt-3 max-w-3xl leading-7 text-ink-muted">
            {localized(merchant.description, locale)}
          </p>
        </section>
        <section className="pb-12">
          <h2 className="mb-5 text-subtitle font-bold">
            {t('profileDeals', { name: merchant.display_name })}
          </h2>
          <DealGrid deals={merchant.deals} locale={locale} currency={currency} />
        </section>
        {locations.length > 0 && (
          <section className="pb-12">
            <h2 className="mb-5 text-subtitle font-bold">{t('locations')}</h2>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {locations.map((location) => (
                <div className="rounded-card-ui border bg-surface p-4" key={location.id}>
                  <MapPin className="text-brand" />
                  <p className="mt-2 font-semibold">{location.address}</p>
                </div>
              ))}
            </div>
            <MapView locations={locations} />
          </section>
        )}
        <section className="pb-12">
          <h2 className="text-subtitle font-bold">{t('allReviews')}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {merchant.reviews.slice(0, 6).map((review) => (
              <article className="rounded-card-ui border bg-surface p-5" key={review.id}>
                <span className="text-rating">{'★'.repeat(review.rating)}</span>
                <p className="mt-3 text-ink-muted">{review.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
