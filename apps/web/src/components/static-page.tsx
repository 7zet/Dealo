import { brandConfig, type Locale } from '@dealo/config';
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
type Section = { title: string; body: string };
type Faq = { q: string; a: string };

const SECTIONS = { termsTitle: 'termsSections', privacyTitle: 'privacySections' } as const;

export async function StaticPage({
  titleKey,
  textKey,
}: {
  titleKey: TitleKey;
  textKey: 'helpText' | 'termsText' | 'privacyText';
}) {
  const t = await getTranslations('Static');
  const isHelp = titleKey === 'helpTitle';
  const sections = isHelp ? [] : (t.raw(SECTIONS[titleKey]) as Section[]);
  const faq = isHelp ? (t.raw('helpFaq') as Faq[]) : [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-title font-bold">{t(titleKey)}</h1>
      <p className="mt-5 text-lead leading-8 text-ink-muted">{t(textKey)}</p>
      {!isHelp && <p className="mt-2 text-small text-ink-faint">{t('updated')}</p>}

      {sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="text-lead font-bold text-ink">{section.title}</h2>
          <p className="mt-2 leading-7 text-ink-muted">{section.body}</p>
        </section>
      ))}

      {isHelp && (
        <>
          <h2 className="mt-10 text-lead font-bold text-ink">{t('faqTitle')}</h2>
          <div className="mt-4 grid gap-3">
            {faq.map((item) => (
              <details
                key={item.q}
                className="rounded-control-ui border border-border bg-surface px-5 py-4"
              >
                <summary className="cursor-pointer font-semibold text-ink">{item.q}</summary>
                <p className="mt-3 leading-7 text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
          <section className="mt-10 rounded-control-ui border border-border bg-surface p-5">
            <h2 className="text-lead font-bold text-ink">{t('contactTitle')}</h2>
            <p className="mt-1 text-small text-ink-muted">{t('contactHours')}</p>
            <ul className="mt-4 grid gap-2 text-ink">
              <li>
                <a
                  className="font-semibold text-brand"
                  href={`tel:${brandConfig.supportPhone.replace(/\s/g, '')}`}
                >
                  {brandConfig.supportPhone}
                </a>
              </li>
              <li>
                <a
                  className="font-semibold text-brand"
                  href={`https://t.me/${brandConfig.supportTelegram}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  @{brandConfig.supportTelegram}
                </a>
              </li>
            </ul>
            <a
              className="mt-5 inline-block rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface"
              href={`mailto:${brandConfig.supportEmail}`}
            >
              {t('contact')}
            </a>
          </section>
        </>
      )}
    </div>
  );
}
