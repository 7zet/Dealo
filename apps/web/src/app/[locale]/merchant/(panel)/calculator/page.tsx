import { getTranslations } from 'next-intl/server';

import { CampaignCalculator } from '@/components/campaign-calculator';
import { PageHeader, Panel } from '@/components/merchant-ui';
import { requirePanelPermission } from '@/lib/merchant-session';

/** Deal calculator: shows the merchant's take per voucher and in total before the deal is created. */
export default async function CalculatorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePanelPermission('workspace.view', '/merchant/calculator');
  const [t, ui] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
  ]);
  return (
    <>
      <PageHeader title={t('calcTitle')} description={ui('calculatorSubtitle')} />
      <Panel bodyClassName="p-5 sm:p-6">
        <CampaignCalculator locale={locale as 'uz' | 'ru' | 'en'} />
      </Panel>
    </>
  );
}
