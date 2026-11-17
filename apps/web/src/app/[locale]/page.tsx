import { publicApi } from '@grupon/api-client';
import { brandConfig, localized, type Locale } from '@grupon/config';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CategoryTiles } from '@/components/category-tiles';
import { CursorGlow } from '@/components/cursor-glow';
import { DealCarousel } from '@/components/deal-carousel';
import { InfiniteFeed } from '@/components/infinite-feed';
import { HeroMotion } from '@/components/hero-motion';
import { SearchBox } from '@/components/search-box';
import { SectionHeading } from '@/components/section-heading';
import { Link } from '@/i18n/navigation';
import { getCurrency } from '@/lib/preferences';

const RAIL_SIZE = '12';
const FEED_SIZE = 24;

/** Splits "Great experiences. Better prices." so the second sentence can be highlighted. */
function splitTitle(title: string): [string, string] {
  const index = title.indexOf('. ');
  return index === -1 ? [title, ''] : [title.slice(0, index + 1), title.slice(index + 2)];
}

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const nav = await getTranslations('Navigation');
  const deals = (params: Record<string, string>) =>
    publicApi.deals(new URLSearchParams({ city: 'tashkent', ...params }));
  const config = await publicApi.config();
  const categories = config.categories.filter((category) => category.searchable);
  const feedQuery = { city: 'tashkent', sort: 'recommended', page_size: String(FEED_SIZE) };
  const [trending, endingSoon, newest, feed, currency] = await Promise.all([
    Promise.all(
      categories.map((category) =>
        deals({ category: category.slug, sort: 'popular', page_size: RAIL_SIZE }),
      ),
    ),
    deals({ ending_soon: 'true', sort: 'ending_soon', page_size: RAIL_SIZE }),
    deals({ sort: 'newest', page_size: RAIL_SIZE }),
    publicApi.deals(new URLSearchParams(feedQuery)),
    getCurrency(),
  ]);
  const [titleLead, titleAccent] = splitTitle(t('title'));

  return (
    <>
      <section className="relative overflow-hidden bg-night text-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,rgb(255_122_26/28%),transparent_65%)]"
        />
        <svg
          aria-hidden
          className="hero-streaks pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[60%] md:block"
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
        >
          {[
            ['#ff6a00', 0],
            ['#ff8a1f', 14],
            ['#ffb347', 28],
            ['#ffd27a', 42],
          ].map(([color, offset]) => (
            <g key={offset}>
              <path
                d={`M ${-40 + Number(offset)} ${430} C 260 ${380 - Number(offset)}, 420 ${120 + Number(offset)}, 840 ${-20 + Number(offset)}`}
                stroke={String(color)}
                strokeOpacity="0.55"
                strokeWidth="9"
              />
              <path
                className="flow"
                d={`M ${-40 + Number(offset)} ${430} C 260 ${380 - Number(offset)}, 420 ${120 + Number(offset)}, 840 ${-20 + Number(offset)}`}
                stroke="#fff3e0"
                strokeOpacity="0.9"
                strokeWidth="3"
                style={{ animationDelay: `${Number(offset) / 10}s` }}
              />
            </g>
          ))}
        </svg>
        <HeroMotion>
          <div className="relative mx-auto grid max-w-layout items-center gap-8 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-6">
            <div>
              <p data-hero className="text-label font-bold uppercase tracking-[0.3em] text-neon">
                {t('eyebrow')}
              </p>
              <h1
                data-hero
                className="mt-3 text-[clamp(3rem,8vw,6.5rem)] font-extrabold leading-[0.9] tracking-[-0.04em]"
              >
                {brandConfig.name}
                <span className="text-neon drop-shadow-[0_0_24px_rgb(255_122_26/70%)]">.</span>
              </h1>
              <p
                data-hero
                className="mt-4 text-[clamp(1.25rem,2.2vw,1.875rem)] font-light leading-tight"
              >
                {titleLead}{' '}
                {titleAccent && <span className="font-bold text-neon">{titleAccent}</span>}
              </p>
              <div data-hero id="hero-search" className="mt-6 max-w-2xl">
                <SearchBox tone="dark" size="lg" submitLabel={nav('search')} />
              </div>
            </div>
          </div>
        </HeroMotion>
      </section>

      <CursorGlow>
        <div className="mx-auto max-w-layout space-y-12 px-4 py-10 sm:px-6 lg:px-8">
          <CategoryTiles categories={categories} locale={locale} />
          {categories.map((category, index) => {
            const items = trending[index]?.items ?? [];
            if (!items.length) return null;
            return (
              <section key={category.id}>
                <SectionHeading
                  title={t('trendingIn', { category: localized(category.name, locale) })}
                  href={`/tashkent/${category.slug}?sort=popular`}
                />
                <DealCarousel deals={items} locale={locale} currency={currency} />
              </section>
            );
          })}
          {endingSoon.items.length > 0 && (
            <section>
              <SectionHeading
                title={t('limited')}
                href="/tashkent?endingSoon=true&sort=ending_soon"
              />
              <DealCarousel deals={endingSoon.items} locale={locale} currency={currency} />
            </section>
          )}
          {newest.items.length > 0 && (
            <section>
              <SectionHeading title={t('newest')} href="/tashkent?sort=newest" />
              <DealCarousel deals={newest.items} locale={locale} currency={currency} />
            </section>
          )}
          <section>
            <SectionHeading title={t('allDeals')} href="/tashkent" />
            <InfiniteFeed
              initial={feed.items}
              total={feed.total}
              pageSize={feed.page_size}
              query={feedQuery}
              locale={locale}
              currency={currency}
            />
          </section>
          <section className="relative overflow-hidden rounded-panel-ui bg-night text-surface">
            <div className="absolute -bottom-24 -right-24 size-96 rounded-full bg-[radial-gradient(circle,rgb(255_122_26/45%),transparent_65%)]" />
            <div className="relative p-8 sm:p-12">
              <p className="text-label font-bold uppercase tracking-[0.3em] text-neon">
                {t('merchantTitle')}
              </p>
              <h2 className="mt-3 max-w-2xl text-title-small font-extrabold">
                {t('merchantText')}
              </h2>
              <Link
                className="mt-7 inline-flex items-center gap-2 rounded-round-ui bg-brand px-6 py-3 font-bold text-surface shadow-[0_0_24px_rgb(255_122_26/55%)] transition hover:bg-brand-hover"
                href="/merchant"
              >
                {t('merchantCta')}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        </div>
      </CursorGlow>
    </>
  );
}
