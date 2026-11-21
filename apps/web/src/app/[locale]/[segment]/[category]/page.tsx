import { publicApi } from '@grupon/api-client';
import { isCategorySlug, isCitySlug, localized, type Locale } from '@grupon/config';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ListingPage } from '@/components/listing-page';
import { ListingSkeleton } from '@/components/listing-skeleton';
import { categoryLabel } from '@/lib/catalog-labels';
import { notFoundMetadata } from '@/lib/page-metadata';

type Props = {
  params: Promise<{ locale: Locale; segment: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, segment, category } = await params;
  if (!isCitySlug(segment) || !isCategorySlug(category)) return notFoundMetadata(locale);
  const [config, t, catalog] = await Promise.all([
    publicApi.config(),
    getTranslations({ locale, namespace: 'Listing' }),
    getTranslations({ locale, namespace: 'Catalog' }),
  ]);
  const city = config.cities.find((item) => item.slug === segment);
  const found = config.categories.find((item) => item.slug === category);
  if (!city || !found) return notFoundMetadata(locale);
  return {
    title: t('categoryTitle', {
      category: categoryLabel(catalog, found, locale),
      city: localized(city.name, locale),
    }),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, segment, category } = await params;
  // Checked before the Suspense boundary below, so an unknown slug answers with a real 404 status.
  if (!isCitySlug(segment) || !isCategorySlug(category)) notFound();
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <ListingPage
        locale={locale}
        citySlug={segment}
        categorySlug={category}
        searchParams={await searchParams}
      />
    </Suspense>
  );
}
