import type { components } from '@dealo/api-client';
import type { Locale } from '@dealo/config';
import { formatMoney } from '@dealo/ui';
import { UsersRound } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import { EmptyState, PageHeader, TableCard, Td, Th } from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { requirePanelPermission } from '@/lib/merchant-session';

type CustomerPage = components['schemas']['CustomerPage'];

/** Buyers of this business with their order counts and totals. Names are shortened to "Alisher U." by the API. */
export default async function CustomersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePanelPermission('workspace.view', '/merchant/customers');
  const [t, ui, format] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const list = await loadForVisitor(locale, '/merchant/customers', () =>
    accountGet<CustomerPage>('/merchant/customers'),
  );

  return (
    <>
      <PageHeader title={t('customersTitle')} description={ui('customersSubtitle')} />
      {list.items.length === 0 ? (
        <EmptyState icon={UsersRound} title={t('customersEmpty')} text={ui('customersEmptyHint')} />
      ) : (
        <TableCard minWidth={640}>
          <thead>
            <tr>
              <Th>{t('colCustomer')}</Th>
              <Th align="right">{t('colOrders')}</Th>
              <Th align="right">{t('colVouchers')}</Th>
              <Th align="right">{t('colSpent')}</Th>
              <Th>{t('colLast')}</Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((customer) => (
              <tr key={customer.user_id}>
                <Td className="font-medium">{customer.name}</Td>
                <Td align="right">{format.number(customer.orders_count)}</Td>
                <Td align="right">{format.number(customer.vouchers_count)}</Td>
                <Td align="right" className="font-semibold">
                  {formatMoney(customer.total_spent.amount, locale as Locale, 'UZS')}
                </Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  {format.dateTime(new Date(customer.last_order_at), { dateStyle: 'medium' })}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </>
  );
}
