import type { components } from '@dealo/api-client';
import type { Locale } from '@dealo/config';
import { formatMoney } from '@dealo/ui';
import { Receipt } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import {
  EmptyState,
  orderTone,
  PageHeader,
  StatusBadge,
  TableCard,
  Td,
  Th,
} from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type OrderPage = components['schemas']['OrderPage'];

const STATUS_KEYS = {
  awaiting_payment: 'orderPending',
  created: 'orderPending',
  paid: 'orderPaid',
  completed: 'orderCompleted',
  expired: 'orderExpired',
  failed: 'orderFailed',
  cancelled: 'orderCancelled',
  partially_refunded: 'orderPartiallyRefunded',
  refunded: 'orderRefunded',
} as const;

/** Orders that include this business's deals, newest first. Shows the deal names and what the buyer paid. */
export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePanelPermission('workspace.view', '/merchant/orders');
  const [t, ui, format] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const list = await loadForVisitor(locale, '/merchant/orders', () =>
    accountGet<OrderPage>('/merchant/orders'),
  );

  return (
    <>
      <PageHeader title={t('ordersTitle')} description={ui('ordersSubtitle')} />
      {list.items.length === 0 ? (
        <EmptyState icon={Receipt} title={t('ordersEmpty')} text={ui('ordersEmptyHint')} />
      ) : (
        <TableCard minWidth={640}>
          <thead>
            <tr>
              <Th>{t('colOrder')}</Th>
              <Th>{t('colDate')}</Th>
              <Th>{t('colStatus')}</Th>
              <Th align="right">{t('colTotal')}</Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((order) => (
              <tr key={order.id}>
                <Td>
                  <div className="font-semibold">{order.number}</div>
                  {order.items.map((item) => (
                    <div key={item.id} className="text-ink-muted">
                      {pickText(item.title_snapshot, locale)} × {item.quantity}
                    </div>
                  ))}
                </Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  {format.dateTime(new Date(order.created_at), { dateStyle: 'medium' })}
                </Td>
                <Td>
                  <StatusBadge tone={orderTone(order.status)}>
                    {order.status in STATUS_KEYS
                      ? t(STATUS_KEYS[order.status as keyof typeof STATUS_KEYS])
                      : order.status}
                  </StatusBadge>
                </Td>
                <Td align="right" className="font-semibold">
                  {formatMoney(order.total.amount, locale as Locale, 'UZS')}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </>
  );
}
