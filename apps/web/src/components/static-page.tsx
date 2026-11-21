import { brandConfig, type Locale } from '@grupon/config';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type TitleKey = 'helpTitle' | 'termsTitle' | 'privacyTitle';

/** generateMetadata for a static page: its heading becomes the tab title. */
export function staticPageMetadata(
  titleKey: TitleKey,
  textKey: 'helpText' | 'termsText' | 'privacyText',
) {
  return async ({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Static' });
    return { title: t(titleKey), description: t(textKey) };
  };
}
export async function StaticPage({
  titleKey,
  textKey,
}: {
  titleKey: TitleKey;
  textKey: 'helpText' | 'termsText' | 'privacyText';
}) {
  const t = await getTranslations('Static');
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-title font-bold">{t(titleKey)}</h1>
      <p className="mt-5 text-lead leading-8 text-ink-muted">{t(textKey)}</p>
      {titleKey === 'helpTitle' && (
        <a
          className="mt-8 inline-block rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface"
          href={`mailto:${brandConfig.supportEmail}`}
        >
          {t('contact')}
        </a>
      )}
    </div>
  );
}
