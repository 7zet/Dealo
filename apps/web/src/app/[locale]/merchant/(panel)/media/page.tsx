import { getTranslations } from 'next-intl/server';

import { MerchantMediaLibrary, type MediaAsset } from '@/components/merchant-media-library';
import { PageHeader } from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { requirePanelPermission } from '@/lib/merchant-session';

export default async function MediaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/media');
  const [t, ui] = await Promise.all([getTranslations('Deals'), getTranslations('MerchantUI')]);
  const list = await loadForVisitor(locale, '/merchant/media', () =>
    accountGet<{ items: MediaAsset[] }>('/merchant/media'),
  );
  return (
    <>
      <PageHeader title={t('mediaTitle')} description={ui('mediaSubtitle')} />
      <MerchantMediaLibrary assets={list.items} canEdit={access.can('workspace.edit')} />
    </>
  );
}
