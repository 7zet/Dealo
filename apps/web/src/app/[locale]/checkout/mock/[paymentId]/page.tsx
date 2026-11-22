import type { components } from '@dealo/api-client';
import { formatMoney } from '@dealo/ui';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { MockPaymentActions } from '@/components/mock-payment-actions';
import { accountGetOrNull, loadForVisitor } from '@/lib/account-api';

type Order = components['schemas']['Order'];

/**
 * Stand-in for the payment provider's page. It belongs to the signed-in buyer's own order: an
 * unknown or foreign order is a 404, and an order that is no longer awaiting payment goes to its
 * result page instead of offering to pay again.
 */
export default async function MockPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; paymentId: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const [{ locale, paymentId }, { order: orderId }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('Checkout'),
  ]);
  if (!orderId) notFound();
  const self = `/${locale}/checkout/mock/${paymentId}?order=${encodeURIComponent(orderId)}`;
  const order = await loadForVisitor(locale, self, () =>
    accountGetOrNull<Order>(`/me/orders/${encodeURIComponent(orderId)}`),
  );
  if (!order) notFound();
  if (order.status !== 'awaiting_payment') {
    redirect(`/${locale}/checkout/success/${encodeURIComponent(order.id)}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-title font-bold">{t('mockTitle')}</h1>
      <dl className="mt-6 grid gap-2 rounded-card border border-border bg-surface p-4">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">{t('orderNumber')}</dt>
          <dd className="font-mono text-ink">{order.number}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">{t('total')}</dt>
          <dd className="font-semibold text-ink">
            {formatMoney(order.total.amount, locale as Parameters<typeof formatMoney>[1], 'UZS')}
          </dd>
        </div>
      </dl>
      <div className="mt-8">
        <MockPaymentActions paymentId={paymentId} orderId={order.id} />
      </div>
    </div>
  );
}
