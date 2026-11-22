import { publicApi, type DealSummary } from '@dealo/api-client';
import { localized, type Locale } from '@dealo/config';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { categoryLabel, subcategoryLabel } from '@/lib/catalog-labels';
import { buildDealQuery, listingPageWindow, LISTING_FILTER_KEYS } from '@/lib/deal-query';
import { getCurrency } from '@/lib/preferences';
import { DealGrid } from './deal-grid';
import { ListingControls } from './listing-controls';

type Search = Record<string, string | string[] | undefined>;
export async function ListingPage({
  locale,
  citySlug,
  categorySlug,
  searchParams,
  searchQuery,
}: {
  locale: Locale;
  citySlug?: string | undefined;
  categorySlug?: string | undefined;
  searchParams: Search;
  searchQuery?: string | undefined;
}) {
  const [config, t, common, nav, home, catalog, currency] = await Promise.all([
    publicApi.config(),
    getTranslations('Listing'),
    getTranslations('Common'),
    getTranslations('Navigation'),
    getTranslations('Home'),
    getTranslations('Catalog'),
    getCurrency(),
  ]);
  const city = config.cities.find((item) => item.slug === citySlug) ?? config.cities[0]!;
  const category = config.categories.find((item) => item.slug === categorySlug);
  const query = buildDealQuery({ citySlug, categorySlug, searchQuery, searchParams });
  // "Load more" appends: page N shows every page up to N (within a window), so the browser's Back
  // button returns to the shorter list and a shared link opens the same results.
  const pages = await Promise.all(
    listingPageWindow(query.get('page')).map((page) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set('page', String(page));
      return publicApi.deals(pageQuery);
    }),
  );
  const result = pages.at(-1)!;
  const seen = new Set<string>();
  const deals: DealSummary[] = pages
    .flatMap((page) => page.items)
    .filter((deal) => !seen.has(deal.id) && Boolean(seen.add(deal.id)));
  // Pagination links keep the friendly URL params (not the API names) so they round-trip.
  const nextPageParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams))
    if (typeof value === 'string' && value && key !== 'page') nextPageParams.set(key, value);
  nextPageParams.set('page', String(result.page + 1));
  const title = searchQuery
    ? t('queryFor', { query: searchQuery })
    : category
      ? t('categoryTitle', {
          category: categoryLabel(catalog, category, locale),
          city: localized(city.name, locale),
        })
      : t('allDeals', { city: localized(city.name, locale) });
  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));

  // An empty result offers a way out: drop the filters of this listing, or browse every deal.
  const onSearchPage = searchQuery !== undefined;
  const basePath = onSearchPage
    ? searchQuery
      ? `/search?${new URLSearchParams({ q: searchQuery })}`
      : '/search'
    : `/${citySlug ?? city.slug}${categorySlug ? `/${categorySlug}` : ''}`;
  const hasFilters = LISTING_FILTER_KEYS.some((key) => searchParams[key]);
  const emptyAction = hasFilters
    ? { href: basePath, label: common('clearFilters') }
    : searchQuery || categorySlug
      ? { href: `/${city.slug}`, label: home('allDeals') }
      : undefined;
  return (
    <div className="mx-auto max-w-layout px-4 py-10 sm:px-6 lg:px-8">
      <nav className="mb-4 flex items-center gap-1 text-small text-ink-muted">
        <Link href="/">{nav('home')}</Link>
        <ChevronRight className="size-4" />
        <span>{title}</span>
      </nav>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-ink-muted">{common('results', { count: result.total })}</p>
        </div>
      </div>
      <ListingControls
        subcategories={(category?.subcategories ?? []).map((item) => ({
          slug: item.slug,
          label: subcategoryLabel(catalog, category!.slug, item, locale),
        }))}
      />
      <DealGrid deals={deals} locale={locale} currency={currency} emptyAction={emptyAction} />
      {result.page < totalPages && (
        <div className="mt-10 text-center">
          <Link
            className="inline-block rounded-control-ui border bg-surface px-6 py-3 font-semibold text-brand"
            href={`?${nextPageParams}`}
            scroll={false}
          >
            {common('loadMore')}
          </Link>
        </div>
      )}
    </div>
  );
}
