'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { primaryButtonClass } from '@/components/merchant-ui';

/** Error state of a panel page. The sidebar stays, so the member can retry or open another section. */
export default function PanelError({ reset }: { reset: () => void }) {
  const t = useTranslations('MerchantUI');
  return (
    <div
      role="alert"
      className="grid justify-items-center gap-2 rounded-card-ui border border-border bg-surface px-6 py-14 text-center"
    >
      <span className="grid size-12 place-items-center rounded-round-ui bg-error-tint text-error">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <p className="mt-2 text-lead font-bold text-ink">{t('errorTitle')}</p>
      <p className="max-w-md text-ink-muted">{t('errorText')}</p>
      <button type="button" onClick={reset} className={`mt-3 ${primaryButtonClass}`}>
        {t('retry')}
      </button>
    </div>
  );
}
