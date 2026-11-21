import type { components } from '@grupon/api-client';
import type { Locale } from '@grupon/config';
import { getTranslations } from 'next-intl/server';

import { DealWizard } from '@/components/deal-wizard';
import type { MediaAsset } from '@/components/merchant-media-library';
import { PageHeader } from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { categoryLabel, subcategoryLabel } from '@/lib/catalog-labels';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type Config = components['schemas']['PublicConfig'];
type LocationList = components['schemas']['LocationList'];

export default async function NewDealPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePanelPermission('workspace.edit', '/merchant/deals/new');
  const [t, ui, catalog] = await Promise.all([
    getTranslations('Deals'),
    getTranslations('MerchantUI'),
    getTranslations('Catalog'),
  ]);
  const [config, locations, media] = await loadForVisitor(locale, '/merchant/deals/new', () =>
    Promise.all([
      accountGet<Config>('/config'),
      accountGet<LocationList>('/merchant/locations'),
      accountGet<{ items: MediaAsset[] }>('/merchant/media'),
    ]),
  );
  const categories = config.categories.map((category) => ({
    id: category.id,
    label: categoryLabel(catalog, category, locale as Locale),
    subcategories: category.subcategories.map((sub) => ({
      id: sub.id,
      label: subcategoryLabel(catalog, category.slug, sub, locale as Locale),
    })),
  }));
  const options = locations.items.map((location) => ({
    id: location.id,
    label: `${pickText(location.city.name, locale)} — ${location.address}`,
  }));

  return (
    <>
      <PageHeader title={t('createTitle')} description={ui('createDealSubtitle')} />
      <DealWizard categories={categories} locations={options} media={media.items} />
    </>
  );
}
