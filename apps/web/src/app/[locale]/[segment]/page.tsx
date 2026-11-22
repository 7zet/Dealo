import { publicApi } from '@dealo/api-client';
import { isCategorySlug, isCitySlug, localized, type Locale } from '@dealo/config';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ListingPage } from '@/components/listing-page';
import { ListingSkeleton } from '@/components/listing-skeleton';
import { notFoundMetadata } from '@/lib/page-metadata';

type Props = {
  params: Promise<{ locale: Locale; segment: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, segment } = await params;
  if (!isCitySlug(segment)) return notFoundMetadata(locale);
  const [config, t] = await Promise.all([
    publicApi.config(),
    getTranslations({ locale, namespace: 'Listing' }),
  ]);
  const city = config.cities.find((item) => item.slug === segment);
  return city
    ? { title: t('allDeals', { city: localized(city.name, locale) }) }
    : notFoundMetadata(locale);
}

export default async function SegmentPage({ params, searchParams }: Props) {
  const { locale, segment } = await params;
  if (isCategorySlug(segment)) redirect(`/${locale}/tashkent/${segment}`);
  // Checked before the Suspense boundary below, so an unknown slug answers with a real 404 status.
  if (!isCitySlug(segment)) notFound();
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <ListingPage locale={locale} citySlug={segment} searchParams={await searchParams} />
    </Suspense>
  );
}
