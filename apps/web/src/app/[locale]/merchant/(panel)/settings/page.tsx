import type { components } from '@dealo/api-client';
import { getTranslations } from 'next-intl/server';

import { MerchantSettingsForm } from '@/components/merchant-settings-form';
import { PageHeader, Panel } from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type MerchantSettings = components['schemas']['MerchantSettings'];
type LocationList = components['schemas']['LocationList'];

/** Notification choices and the default branch. Only the owner and managers can save; the API enforces it. */
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/settings');
  const [t, ui] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
  ]);
  const [settings, locations] = await loadForVisitor(locale, '/merchant/settings', () =>
    Promise.all([
      accountGet<MerchantSettings>('/merchant/settings'),
      accountGet<LocationList>('/merchant/locations'),
    ]),
  );

  return (
    <>
      <PageHeader title={t('settingsTitle')} description={ui('settingsSubtitle')} />
      <Panel bodyClassName="p-5 sm:p-6">
        <MerchantSettingsForm
          canEdit={access.can('workspace.edit')}
          initial={settings}
          locations={locations.items.map((location) => ({
            id: location.id,
            label: `${pickText(location.city.name, locale)} — ${location.address}`,
          }))}
        />
      </Panel>
    </>
  );
}
