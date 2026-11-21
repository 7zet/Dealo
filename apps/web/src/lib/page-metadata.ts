import type { Locale } from '@grupon/config';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/** Head tags for a localized 404, so the tab never shows the generic site title. */
export async function notFoundMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'ErrorPage' });
  return { title: t('notFoundTitle'), robots: { index: false } };
}
