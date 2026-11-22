import type { Locale } from '@dealo/config';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ListingPage } from '@/components/listing-page';
import { ListingSkeleton } from '@/components/listing-skeleton';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function queryOf(search: Record<string, string | string[] | undefined>): string {
  return typeof search.q === 'string' ? search.q : '';
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const q = queryOf(await searchParams).trim();
  const t = await getTranslations({ locale, namespace: 'Listing' });
  return {
    title: q ? t('queryFor', { query: q.slice(0, 80) }) : t('searchTitle'),
    robots: { index: false },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <ListingPage locale={locale} searchQuery={queryOf(query)} searchParams={query} />
    </Suspense>
  );
}
