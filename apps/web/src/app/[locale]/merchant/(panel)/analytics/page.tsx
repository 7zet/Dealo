import type { components } from '@grupon/api-client';
import type { Locale } from '@grupon/config';
import { formatMoney } from '@grupon/ui';
import { BarChart3, Percent, Ticket, TicketCheck, Wallet } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import {
  EmptyState,
  fieldClass,
  KpiCard,
  PageHeader,
  Panel,
  primaryButtonClass,
} from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { requirePanelPermission } from '@/lib/merchant-session';

type MerchantAnalytics = components['schemas']['MerchantAnalytics'];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sales for a period (default: the last 30 days). Shows totals, redemption rate and a day-by-day bar list. */
export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { locale } = await params;
  await requirePanelPermission('workspace.view', '/merchant/analytics');
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const to = query.to && DATE.test(query.to) ? query.to : today;
  const from =
    query.from && DATE.test(query.from)
      ? query.from
      : new Date(Date.parse(to) - 29 * DAY_MS).toISOString().slice(0, 10);
  const [t, ui, format] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const data = await loadForVisitor(locale, `/merchant/analytics?from=${from}&to=${to}`, () =>
    accountGet<MerchantAnalytics>(`/merchant/analytics?from=${from}&to=${to}`),
  );
  const money = (amount: number) => formatMoney(amount, locale as Locale, 'UZS');
  const peak = Math.max(1, ...data.sales.map((point) => point.value));
  const percent = Math.round(data.redemption_rate * 100);

  return (
    <>
      <PageHeader
        title={t('analyticsTitle')}
        description={ui('analyticsSubtitle')}
        actions={
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="grid gap-1 text-small font-semibold">
              {t('fromDate')}
              <input type="date" name="from" defaultValue={from} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-small font-semibold">
              {t('toDate')}
              <input type="date" name="to" defaultValue={to} className={fieldClass} />
            </label>
            <button type="submit" className={primaryButtonClass}>
              {t('apply')}
            </button>
          </form>
        }
      />
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label={t('grossSales')} value={money(data.gross_sales.amount)} icon={Wallet} />
        <KpiCard
          label={t('vouchersSold')}
          value={format.number(data.vouchers_sold)}
          icon={Ticket}
        />
        <KpiCard
          label={t('vouchersRedeemed')}
          value={format.number(data.vouchers_redeemed)}
          icon={TicketCheck}
        />
        <KpiCard label={t('redemptionRate')} value={`${percent}%`} icon={Percent} />
      </dl>
      <Panel title={t('salesByDay')} titleId="sales-by-day">
        {data.sales.length === 0 ? (
          <EmptyState icon={BarChart3} title={t('analyticsEmpty')} />
        ) : (
          <ul className="grid gap-2.5">
            {data.sales.map((point) => (
              <li
                key={point.date}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-small"
              >
                <span className="text-ink-muted">
                  {format.dateTime(new Date(point.date), { dateStyle: 'medium' })}
                </span>
                <span className="h-2.5 overflow-hidden rounded-round-ui bg-page">
                  <span
                    className="block h-full rounded-round-ui bg-brand"
                    style={{ width: `${Math.max(1, Math.round((point.value / peak) * 100))}%` }}
                  />
                </span>
                <span className="tabular-nums text-ink">{money(point.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
