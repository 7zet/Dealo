import { Lock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { primaryButtonClass } from '@/components/merchant-ui';
import { Link } from '@/i18n/navigation';
import { fallbackHref, NO_ACCESS_HREF } from '@/lib/merchant-access';
import { getMerchantAccess } from '@/lib/merchant-session';

/** Shown when the API refuses a merchant operation (403) for the visitor's role. */
export default async function NoAccessPage() {
  const [t, ui, access] = await Promise.all([
    getTranslations('Panel'),
    getTranslations('MerchantUI'),
    getMerchantAccess(),
  ]);
  const section = fallbackHref(access?.permissions ?? [], NO_ACCESS_HREF);
  // A role without any section has nowhere to go inside the panel.
  const home = section === NO_ACCESS_HREF ? null : section;
  return (
    <div className="grid justify-items-center gap-3 rounded-card-ui border border-border bg-surface px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-round-ui bg-brand-tint text-brand">
        <Lock aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-lead font-bold text-ink">{t('noAccessTitle')}</h1>
      <p className="max-w-md text-ink-muted">{t('noAccessText')}</p>
      <Link href={home ?? '/'} className={`mt-2 ${primaryButtonClass}`}>
        {home ? t('noAccessCta') : ui('noAccessHome')}
      </Link>
    </div>
  );
}
