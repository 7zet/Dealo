import type { PublicConfig } from '@dealo/api-client';
import type { Locale } from '@dealo/config';
import {
  ArrowRight,
  Dumbbell,
  FerrisWheel,
  Sparkles,
  Tag,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { categoryLabel, subcategoryLabel } from '@/lib/catalog-labels';

const icons: Record<string, LucideIcon> = {
  'beauty-and-spas': Sparkles,
  'food-and-drink': UtensilsCrossed,
  'things-to-do': FerrisWheel,
  'health-and-fitness': Dumbbell,
};

/** Large category tiles: name on the left, a glowing icon on the right, subcategories on hover. */
export async function CategoryTiles({
  categories,
  locale,
}: {
  categories: PublicConfig['categories'];
  locale: Locale;
}) {
  const [t, catalog] = await Promise.all([getTranslations('Home'), getTranslations('Catalog')]);
  const tile =
    'group relative flex min-h-20 items-center justify-between gap-2 rounded-card-ui bg-surface px-4 py-3 text-small sm:min-h-24 sm:gap-3 sm:px-5 sm:py-4 sm:text-body ring-1 ring-border transition duration-300 hover:-translate-y-0.5 hover:ring-neon/50 hover:shadow-[0_14px_36px_-14px_rgb(255_106_0/55%)]';
  return (
    <nav
      aria-label={t('categories')}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
    >
      {categories.map((category) => {
        const Icon = icons[category.slug] ?? Tag;
        return (
          <div key={category.id} className="group/tile relative">
            <Link className={tile} href={`/tashkent/${category.slug}`}>
              <span className="font-bold leading-snug text-ink">
                {categoryLabel(catalog, category, locale)}
              </span>
              <span className="relative grid size-11 shrink-0 place-items-center rounded-[0.9rem] sm:size-14 sm:rounded-[1.1rem] bg-gradient-to-br from-[#ff9a3c] to-brand text-surface shadow-[0_8px_24px_-6px_rgb(255_106_0/70%)] transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-110">
                <Icon className="size-6 sm:size-7" strokeWidth={2.2} />
              </span>
            </Link>
            {category.subcategories.length > 0 && (
              <div className="invisible absolute inset-x-0 top-full z-30 hidden translate-y-1 pt-2 opacity-0 transition group-hover/tile:visible group-hover/tile:translate-y-0 group-hover/tile:opacity-100 lg:block">
                <div className="grid gap-1 rounded-card-ui border bg-surface p-2 shadow-floating-ui">
                  {category.subcategories.map((sub) => (
                    <Link
                      className="rounded-control-ui px-3 py-2 text-small hover:bg-brand-tint hover:text-brand"
                      href={`/tashkent/${category.slug}?subcategory=${sub.slug}`}
                      key={sub.id}
                    >
                      {subcategoryLabel(catalog, category.slug, sub, locale)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Link className={tile} href="/tashkent">
        <span className="font-bold leading-snug text-ink">{t('allDeals')}</span>
        <span className="grid size-11 shrink-0 place-items-center rounded-[0.9rem] bg-night sm:size-14 sm:rounded-[1.1rem] text-surface transition duration-300 group-hover:bg-brand group-hover:shadow-[0_0_24px_rgb(255_122_26/60%)]">
          <ArrowRight className="size-6" />
        </span>
      </Link>
    </nav>
  );
}
