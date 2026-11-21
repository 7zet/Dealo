import type { components } from '@grupon/api-client';
import type { Locale } from '@grupon/config';
import { formatMoney } from '@grupon/ui';
import { CreditCard } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import {
  EmptyState,
  PageHeader,
  StatusBadge,
  TableCard,
  Td,
  Th,
  type Tone,
} from '@/components/merchant-ui';
import { StatementsDownload, type StatementRow } from '@/components/statements-download';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { requirePanelPermission } from '@/lib/merchant-session';

type PayoutPage = components['schemas']['PayoutPage'];

const STATUS: Record<
  string,
  { key: 'payoutPending' | 'payoutProcessing' | 'payoutPaid'; tone: Tone }
> = {
  pending: { key: 'payoutPending', tone: 'neutral' },
  processing: { key: 'payoutProcessing', tone: 'brand' },
  paid: { key: 'payoutPaid', tone: 'success' },
};

/** Tiyin as an exact so'm decimal for the CSV ("1234.50"), without float division. */
function somString(tiyin: number): string {
  const sign = tiyin < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(tiyin));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Payout runs with gross, commission and net. The statement button downloads the same rows as CSV. */
export default async function PayoutsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePanelPermission('payouts.view', '/merchant/payouts');
  const [t, ui, format] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const list = await loadForVisitor(locale, '/merchant/payouts', () =>
    accountGet<PayoutPage>('/merchant/payouts'),
  );
  const money = (amount: number) => formatMoney(amount, locale as Locale, 'UZS');
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  const rows: StatementRow[] = list.items.map((payout) => ({
    period: `${payout.period_start} – ${payout.period_end}`,
    gross: somString(payout.gross.amount),
    commission: somString(payout.commission.amount),
    net: somString(payout.net.amount),
    status: payout.status,
    paid_on: payout.paid_at ? payout.paid_at : '',
  }));

  return (
    <>
      <PageHeader
        title={t('payoutsTitle')}
        description={ui('payoutsSubtitle')}
        actions={
          <StatementsDownload
            rows={rows}
            filename={`payouts-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        }
      />
      {list.items.length === 0 ? (
        <EmptyState icon={CreditCard} title={t('payoutsEmpty')} text={ui('payoutsEmptyHint')} />
      ) : (
        <TableCard minWidth={720}>
          <thead>
            <tr>
              <Th>{t('colPeriod')}</Th>
              <Th align="right">{t('colGross')}</Th>
              <Th align="right">{t('colCommission')}</Th>
              <Th align="right">{t('colNet')}</Th>
              <Th>{t('colPaid')}</Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((payout) => {
              const status = STATUS[payout.status] ?? STATUS.pending!;
              return (
                <tr key={payout.id}>
                  <Td className="whitespace-nowrap">
                    {day(payout.period_start)} – {day(payout.period_end)}
                  </Td>
                  <Td align="right">{money(payout.gross.amount)}</Td>
                  <Td align="right" className="text-ink-muted">
                    {money(payout.commission.amount)}
                  </Td>
                  <Td align="right" className="font-semibold">
                    {money(payout.net.amount)}
                  </Td>
                  <Td>
                    {payout.status === 'paid' && payout.paid_at ? (
                      <span className="whitespace-nowrap">{day(payout.paid_at)}</span>
                    ) : (
                      <StatusBadge tone={status.tone}>{t(status.key)}</StatusBadge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
    </>
  );
}
