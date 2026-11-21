import { getTranslations } from 'next-intl/server';

/**
 * Loading state of a panel page: a still outline of a header, KPI row and table. No shimmer or pulse,
 * because merchant screens stay motion-free; the text is for screen readers.
 */
export default async function PanelLoading() {
  const t = await getTranslations('MerchantUI');
  return (
    <div aria-busy="true" className="grid gap-6">
      <p className="sr-only">{t('loading')}</p>
      <div aria-hidden="true" className="grid gap-2 border-b border-border pb-5">
        <div className="h-8 w-56 rounded-control-ui bg-border" />
        <div className="h-4 w-80 max-w-full rounded-control-ui bg-border/70" />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-28 rounded-card-ui border border-border bg-surface" />
        ))}
      </div>
      <div aria-hidden="true" className="h-64 rounded-card-ui border border-border bg-surface" />
    </div>
  );
}
