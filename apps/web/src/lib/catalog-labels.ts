import { localized, type Locale, type LocalizedText } from '@grupon/config';

/**
 * The `Catalog` translator from `useTranslations('Catalog')` or `getTranslations('Catalog')`.
 * Keys are built at runtime from slugs, so the type only promises `has` and a lookup.
 */
export type CatalogTranslator = ((key: never) => string) & { has: (key: never) => boolean };

type Named = { slug: string; name: Partial<LocalizedText> };

/** Subcategory slugs are stored as `<category>-<subcategory>`; messages are keyed by the short part. */
export function subcategoryKey(categorySlug: string, slug: string): string {
  const prefix = `${categorySlug}-`;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}

function lookup(t: CatalogTranslator, key: string): string | null {
  return t.has(key as never) ? t(key as never) : null;
}

/**
 * Category label in the visitor's language. The fixed pilot categories have reviewed translations
 * in the message catalog; anything else falls back to the name stored in the database.
 */
export function categoryLabel(t: CatalogTranslator, category: Named, locale: Locale): string {
  return lookup(t, `categories.${category.slug}`) ?? localized(category.name, locale);
}

/**
 * Subcategory label in the visitor's language. Seeded subcategories store their slug as the name in
 * every language, so the message catalog is preferred and the stored name is only a fallback.
 */
export function subcategoryLabel(
  t: CatalogTranslator,
  categorySlug: string,
  subcategory: Named,
  locale: Locale,
): string {
  return (
    lookup(t, `subcategories.${subcategoryKey(categorySlug, subcategory.slug)}`) ??
    localized(subcategory.name, locale)
  );
}
