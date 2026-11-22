import type { components } from '@dealo/api-client';
import type { Locale } from '@dealo/config';
import { formatMoney } from '@dealo/ui';
import {
  BadgeCheck,
  BarChart3,
  CreditCard,
  PlusCircle,
  QrCode,
  Receipt,
  Tag,
  Ticket,
  TicketCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import {
  dealTone,
  EmptyState,
  KpiCard,
  orderTone,
  PageHeader,
  Panel,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
  TableCard,
  Td,
  Th,
} from '@/components/merchant-ui';
import { Link } from '@/i18n/navigation';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { pickText } from '@/lib/localized';
import type { MerchantPermission } from '@/lib/merchant-access';
import { requirePanelPermission } from '@/lib/merchant-session';

type Dashboard = components['schemas']['MerchantDashboard'];
type Metric = components['schemas']['Metric'];

const ORDER_STATUS_KEYS = {
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

/** Overview of the last 30 days. Every number comes from GET /merchant/dashboard; nothing is invented. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/dashboard');
  const [t, ui, nav, deals, format] = await Promise.all([
    getTranslations('Panel'),
    getTranslations('MerchantUI'),
    getTranslations('MerchantPanel'),
    getTranslations('Deals'),
    getFormatter(),
  ]);
  const dashboard = await loadForVisitor(locale, '/merchant/dashboard', () =>
    accountGet<Dashboard>('/merchant/dashboard'),
  );
  const money = (amount: number) => formatMoney(amount, locale as Locale, 'UZS');
  const count = (value: number) => format.number(value);
  const peak = Math.max(1, ...dashboard.sales_chart.map((point) => point.value));
  const status = access.membership?.review_status;

  const change = (metric: Metric) => {
    // No previous window (active deals): nothing to compare, so no change line.
    if (metric.previous_value === undefined) return { text: undefined, tone: 'neutral' as const };
    // The previous window had nothing: a percentage would be meaningless, so say it is new.
    if (metric.previous_value === 0) {
      return metric.value > 0
        ? { text: ui('changeNew'), tone: 'up' as const }
        : { text: ui('changeNoBaseline'), tone: 'neutral' as const };
    }
    const percent = Math.abs(metric.change_percent).toFixed(1);
    if (metric.change_percent > 0)
      return { text: ui('changeUp', { percent }), tone: 'up' as const };
    if (metric.change_percent < 0)
      return { text: ui('changeDown', { percent }), tone: 'down' as const };
    return { text: ui('changeFlat'), tone: 'neutral' as const };
  };
  const kpis: { label: string; metric: Metric; value: string; icon: LucideIcon }[] = [
    {
      label: t('totalSales'),
      metric: dashboard.total_sales,
      value: money(dashboard.total_sales.value),
      icon: Wallet,
    },
    {
      label: t('vouchersSold'),
      metric: dashboard.vouchers_sold,
      value: count(dashboard.vouchers_sold.value),
      icon: Ticket,
    },
    {
      label: t('vouchersRedeemed'),
      metric: dashboard.vouchers_redeemed,
      value: count(dashboard.vouchers_redeemed.value),
      icon: TicketCheck,
    },
    {
      label: t('activeDeals'),
      metric: dashboard.active_deals,
      value: count(dashboard.active_deals.value),
      icon: Tag,
    },
  ];

  // Shortcuts only for what the member's permissions allow.
  const actions: {
    href: string;
    label: string;
    icon: LucideIcon;
    permission: MerchantPermission;
  }[] = [
    {
      href: '/merchant/deals/new',
      label: t('navCreateDeal'),
      icon: PlusCircle,
      permission: 'workspace.edit',
    },
    { href: '/merchant/redeem', label: t('navRedeem'), icon: QrCode, permission: 'redeem' },
    {
      href: '/merchant/analytics',
      label: nav('navAnalytics'),
      icon: BarChart3,
      permission: 'workspace.view',
    },
    {
      href: '/merchant/payouts',
      label: nav('navPayouts'),
      icon: CreditCard,
      permission: 'payouts.view',
    },
  ];
  const permittedActions = actions.filter((action) => access.can(action.permission));

  return (
    <>
      <PageHeader
        title={t('overviewTitle')}
        description={ui('dashboardSubtitle')}
        actions={
          access.can('workspace.edit') ? (
            <Link href="/merchant/deals/new" className={primaryButtonClass}>
              <PlusCircle aria-hidden="true" className="size-4" />
              {t('navCreateDeal')}
            </Link>
          ) : undefined
        }
      />

      {status && status !== 'approved' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card-ui border border-brand/30 bg-brand-tint p-5">
          <div className="flex min-w-0 items-start gap-3">
            <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{ui('reviewBannerTitle')}</p>
              <p className="mt-0.5 text-small text-ink-muted">
                {access.can('business.manage')
                  ? ui(`status.${status}`)
                  : ui('reviewBannerReadOnly')}
              </p>
            </div>
          </div>
          {access.can('business.manage') && (
            <Link href="/merchant/review" className={primaryButtonClass}>
              {ui('reviewBannerCta')}
            </Link>
          )}
        </div>
      )}

      <dl className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const delta = change(kpi.metric);
          return (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              change={delta.text}
              changeTone={delta.tone}
            />
          );
        })}
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title={t('salesChart')} titleId="chart-title">
          {dashboard.sales_chart.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('noChart')} text={ui('chartEmptyHint')} />
          ) : (
            <div
              className="flex h-48 items-end justify-center gap-1 border-b border-border"
              role="img"
              aria-label={t('salesChart')}
            >
              {dashboard.sales_chart.map((point) => (
                <div
                  key={point.date}
                  title={`${format.dateTime(new Date(point.date), { dateStyle: 'medium' })}: ${money(point.value)}`}
                  className="max-w-10 flex-1 rounded-t-sm bg-brand hover:bg-neon"
                  style={{ height: `${Math.max(2, (point.value / peak) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={ui('quickActions')} titleId="actions-title" bodyClassName="grid gap-2 p-4">
          {permittedActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`justify-start ${secondaryButtonClass}`}
            >
              <action.icon aria-hidden="true" className="size-4 text-brand" />
              {action.label}
            </Link>
          ))}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-labelledby="orders-title" className="grid min-w-0 grid-cols-1 content-start gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="orders-title" className="font-semibold text-ink">
              {nav('ordersTitle')}
            </h2>
            <Link href="/merchant/orders" className="text-small font-semibold text-brand">
              {ui('viewAll')}
            </Link>
          </div>
          {dashboard.latest_orders.length === 0 ? (
            <EmptyState icon={Receipt} title={nav('ordersEmpty')} text={ui('ordersEmptyHint')} />
          ) : (
            <TableCard minWidth={420}>
              <thead>
                <tr>
                  <Th>{nav('colOrder')}</Th>
                  <Th>{nav('colStatus')}</Th>
                  <Th align="right">{nav('colTotal')}</Th>
                </tr>
              </thead>
              <tbody>
                {dashboard.latest_orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <Td>
                      <span className="font-semibold">{order.number}</span>
                      <span className="block text-ink-muted">
                        {format.dateTime(new Date(order.created_at), { dateStyle: 'medium' })}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge tone={orderTone(order.status)}>
                        {order.status in ORDER_STATUS_KEYS
                          ? nav(ORDER_STATUS_KEYS[order.status as keyof typeof ORDER_STATUS_KEYS])
                          : order.status}
                      </StatusBadge>
                    </Td>
                    <Td align="right">{money(order.total.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </section>

        <section aria-labelledby="pending-title" className="grid min-w-0 grid-cols-1 content-start gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pending-title" className="font-semibold text-ink">
              {t('pendingDeals')}
            </h2>
            <Link href="/merchant/deals" className="text-small font-semibold text-brand">
              {ui('viewAll')}
            </Link>
          </div>
          {dashboard.pending_deals.length === 0 ? (
            <EmptyState icon={Tag} title={t('noPending')} />
          ) : (
            <ul className="divide-y divide-border rounded-card-ui border border-border bg-surface">
              {dashboard.pending_deals.map((deal) => (
                <li key={deal.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 truncate font-medium text-ink">
                    {pickText(deal.title, locale)}
                  </span>
                  <StatusBadge tone={dealTone(deal.status)}>
                    {deals(`status_${deal.status}` as 'status_active')}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
