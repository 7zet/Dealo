import type { components } from '@grupon/api-client';
import { formatMoney } from '@grupon/ui';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { AccountShell } from '@/components/account-shell';
import { accountGetOrNull, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';

type Order = components['schemas']['Order'];

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations('Account');
  const format = await getFormatter();
  const order = await loadForVisitor(locale, `/${locale}/account/orders/${id}`, () =>
    accountGetOrNull<Order>(`/me/orders/${encodeURIComponent(id)}`),
  );
  if (!order) notFound();
  const money = (amount: number) =>
    formatMoney(amount, locale as Parameters<typeof formatMoney>[1], 'UZS');

  return (
    <AccountShell section="orders" detail>
      <h2 className="text-lead font-semibold text-ink">
        {t('orderTitle')} {order.number}
      </h2>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t('placedAt')}</dt>
          <dd>{format.dateTime(new Date(order.created_at), { dateStyle: 'medium' })}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t('status')}</dt>
          <dd>{t(`orderStatus.${order.status}`)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t('total')}</dt>
          <dd className="font-semibold text-ink">{money(order.total.amount)}</dd>
        </div>
      </dl>
      <ul className="mt-6 grid gap-3">
        {order.items.map((item) => (
          <li key={item.id} className="rounded-card border border-border bg-surface p-4">
            {/* Option title and price come from the purchase snapshot, not the live deal. */}
            <span className="block font-semibold text-ink">
              {pickText(item.title_snapshot, locale)}
            </span>
            <dl className="mt-2 grid gap-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t('unitPrice')}</dt>
                <dd className="tabular-nums text-ink">{money(item.unit_price.amount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t('quantity')}</dt>
                <dd className="tabular-nums text-ink">{item.quantity}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t('total')}</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {money(item.unit_price.amount * item.quantity)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </AccountShell>
  );
}
