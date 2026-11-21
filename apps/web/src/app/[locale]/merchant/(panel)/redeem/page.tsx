import type { components } from '@grupon/api-client';
import { TicketCheck } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
  TableCard,
  Td,
  Th,
} from '@/components/merchant-ui';
import { VoucherRedeemPanel } from '@/components/voucher-redeem-panel';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type LocationList = components['schemas']['LocationList'];
type RedemptionPage = components['schemas']['MerchantRedemptionPage'];

export default async function RedeemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('redeem', '/merchant/redeem');
  const [t, ui, format] = await Promise.all([
    getTranslations('Redeem'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const [list, history] = await loadForVisitor(locale, '/merchant/redeem', () =>
    Promise.all([
      accountGet<LocationList>('/merchant/locations'),
      accountGet<RedemptionPage>('/merchant/redemptions'),
    ]),
  );
  const locations = list.items.map((location) => ({
    id: location.id,
    label: `${pickText(location.city.name, locale)} — ${location.address}`,
  }));
  return (
    <>
      <PageHeader title={t('title')} description={ui('redeemSubtitle')} />
      <Panel bodyClassName="p-5 sm:p-6">
        <VoucherRedeemPanel locations={locations} locale={locale} />
      </Panel>
      <section aria-labelledby="history-title" className="grid gap-3">
        <h2 id="history-title" className="font-semibold text-ink">
          {access.can('redemptions.view_all') ? t('historyTitle') : t('historyOwnTitle')}
        </h2>
        {history.items.length === 0 ? (
          <EmptyState
            icon={TicketCheck}
            title={t('historyEmpty')}
            text={ui('redemptionsEmptyHint')}
          />
        ) : (
          <TableCard minWidth={760}>
            <thead>
              <tr>
                {(
                  ['time', 'deal', 'option', 'buyer', 'branch', 'cashier', 'reversed'] as const
                ).map((key) => (
                  <Th key={key}>{t(`history.${key}`)}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.items.map((item) => (
                <tr key={item.id}>
                  <Td className="whitespace-nowrap">
                    {format.dateTime(new Date(item.time), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Td>
                  <Td className="font-medium">{pickText(item.deal, locale)}</Td>
                  <Td>{pickText(item.option, locale)}</Td>
                  <Td>{item.buyer}</Td>
                  <Td>{item.branch}</Td>
                  <Td>{item.cashier}</Td>
                  <Td>
                    <StatusBadge tone={item.reversed ? 'danger' : 'neutral'}>
                      {item.reversed ? t('yes') : t('no')}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        )}
      </section>
    </>
  );
}
