import type { components } from '@dealo/api-client';
import { getTranslations } from 'next-intl/server';

import { BusinessForm, LocationsPanel } from '@/components/merchant-business';
import { PageHeader, Panel } from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type Merchant = components['schemas']['Merchant'];
type Location = components['schemas']['MerchantLocation'];
type LocationList = components['schemas']['LocationList'];
type Config = components['schemas']['PublicConfig'];

export default async function BusinessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/business');
  const [t, ui] = await Promise.all([getTranslations('Panel'), getTranslations('MerchantUI')]);
  const [business, list, config] = await loadForVisitor(locale, '/merchant/business', () =>
    Promise.all([
      accountGet<Merchant>('/merchant/business'),
      accountGet<LocationList>('/merchant/locations'),
      accountGet<Config>('/config'),
    ]),
  );
  // The API decides what each role may change; this only hides controls the membership cannot use.
  const canEdit = access.can('workspace.edit');
  const cities = config.cities.map((city) => ({
    id: city.id,
    label: pickText(city.name, locale),
    lat: city.lat,
    lng: city.lng,
  }));
  const locations: Location[] = list.items;

  return (
    <>
      <PageHeader title={t('businessTitle')} description={ui('businessSubtitle')} />
      <Panel title={t('profile')} titleId="profile-title" bodyClassName="p-5 sm:p-6">
        <dl className="mb-5 grid gap-1 border-b border-border pb-5 text-small sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-muted">{ui('legalName')}</dt>
          <dd className="font-medium text-ink">{business.legal_name}</dd>
        </dl>
        <BusinessForm
          business={{
            display_name: business.display_name,
            phone: business.phone,
            website: business.website ?? null,
            instagram: business.instagram ?? null,
            telegram: business.telegram ?? null,
          }}
          canEdit={canEdit}
        />
      </Panel>
      <LocationsPanel locations={locations} cities={cities} canEdit={canEdit} locale={locale} />
    </>
  );
}
