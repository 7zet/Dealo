'use client';

import { discountPercent, formatMoney, tiyinFromSom } from '@dealo/ui';
import type { Currency, Locale } from '@dealo/config';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const inputClass = 'rounded-control-ui border border-border bg-surface px-4 py-3 text-ink';

/**
 * Shows what a merchant earns from a deal before it is created; nothing is sent to the API. Inputs are
 * typed in so'm, converted to integer tiyin once, and shown through formatMoney.
 */
export function CampaignCalculator({ locale }: { locale: Locale }) {
  const t = useTranslations('MerchantPanel');
  const currency: Currency = 'UZS';
  const [original, setOriginal] = useState(100000);
  const [deal, setDeal] = useState(50000);
  const [capacity, setCapacity] = useState(100);
  const [commission, setCommission] = useState(15);

  const valid =
    original > 0 &&
    deal > 0 &&
    deal < original &&
    capacity > 0 &&
    commission >= 0 &&
    commission < 100;
  // Integer arithmetic in tiyin: the commission is converted to basis points (15% = 1500 bps) and
  // the merchant's share is rounded down once per voucher, so no float ever touches money.
  const commissionBps = Math.round(commission * 100);
  const dealTiyin = tiyinFromSom(deal);
  const discount = valid ? discountPercent(original, deal) : 0;
  const perVoucher = valid ? Math.floor((dealTiyin * (10000 - commissionBps)) / 10000) : 0;
  const totalReceive = perVoucher * capacity;
  const customersPay = dealTiyin * capacity;
  const show = (tiyin: number) => formatMoney(tiyin, locale, currency);

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">{t('calcHint')}</p>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <NumberField
          label={t('calcOriginal')}
          value={original}
          onChange={setOriginal}
          className={inputClass}
        />
        <NumberField label={t('calcDeal')} value={deal} onChange={setDeal} className={inputClass} />
        <NumberField
          label={t('calcCapacity')}
          value={capacity}
          onChange={setCapacity}
          className={inputClass}
        />
        <NumberField
          label={t('calcCommission')}
          value={commission}
          onChange={setCommission}
          className={inputClass}
        />
      </div>
      {valid && (
        <dl className="grid max-w-2xl gap-3 rounded-card-ui border border-border bg-page p-5 text-sm sm:grid-cols-2">
          <Row label={t('calcDiscount')} value={`${discount}%`} />
          <Row label={t('calcPerVoucher')} value={show(perVoucher)} />
          <Row label={t('calcCustomerPays')} value={show(customersPay)} />
          <Row label={t('calcTotal')} value={show(totalReceive)} />
        </dl>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        type="number"
        min={0}
        className={className}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
