'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { formatMoney } from '@dealo/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Link, useRouter } from '@/i18n/navigation';
import { clearBuyNow, useBuyNow, type BuyNowItem } from '@/stores/buy-now';

type Values = { terms: boolean };

const termsSchema = z.object({
  terms: z.boolean().refine((accepted) => accepted),
});

/** Maps stable API problem codes to checkout messages. */
function problemKey(code: string | undefined) {
  switch (code) {
    case 'option_unavailable':
      return 'errorUnavailable' as const;
    case 'insufficient_stock':
      return 'errorStock' as const;
    case 'max_per_user_exceeded':
      return 'errorLimit' as const;
    case 'unauthenticated':
      return 'errorSession' as const;
    default:
      return 'errorGeneric' as const;
  }
}

const subscribeNothing = () => () => {};

export function CheckoutForm() {
  const t = useTranslations('Checkout');
  const locale = useLocale();
  const router = useRouter();
  const items = useBuyNow((state) => state.items);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // Set once the order exists and the page is navigating to payment, so the cleared selection does
  // not flash the "nothing selected" state.
  const [leaving, setLeaving] = useState(false);

  // False during server render and first hydration pass; true once the stored selection is readable.
  const ready = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const form = useForm<Values>({
    resolver: zodResolver(termsSchema),
    defaultValues: { terms: false },
  });
  // The pay button stays visibly unavailable until the buyer agrees to the terms.
  const accepted = useWatch({ control: form.control, name: 'terms' }) === true;

  if (!ready) return <p className="text-ink-muted">…</p>;
  if (leaving) return <p className="text-ink-muted">{t('placing')}</p>;
  if (items.length === 0) {
    return (
      <div className="grid gap-4">
        <p className="text-ink-muted">{t('noSelection')}</p>
        <Link href="/" className="font-semibold text-brand">
          {t('backToDeals')}
        </Link>
      </div>
    );
  }

  const money = (amount: number) =>
    formatMoney(amount, locale as Parameters<typeof formatMoney>[1], 'UZS');
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const savings = items.reduce(
    (sum, item) => sum + (item.originalPrice - item.unitPrice) * item.quantity,
    0,
  );

  async function submit() {
    setError(null);
    const orderBody = {
      items: items.map(({ optionId, quantity }: BuyNowItem) => ({
        deal_option_id: optionId,
        quantity,
      })),
    };

    const orderResponse = await fetch('/api/bff/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(orderBody),
    });
    if (!orderResponse.ok) {
      const problem = (await orderResponse.json().catch(() => ({}))) as { code?: string };
      setError(t(problemKey(problem.code)));
      if (problem.code === 'unauthenticated') router.replace('/login?next=/checkout');
      return;
    }
    const order = (await orderResponse.json()) as { id: string };

    const payResponse = await fetch(`/api/bff/orders/${order.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'mock', terms_accepted: true }),
    });
    // The order now holds the selection; forget it so it cannot be bought twice or by another account.
    setLeaving(true);
    clearBuyNow();
    if (!payResponse.ok) {
      // The order exists: its failed-payment page offers the retry while the reservation lasts.
      router.push(`/checkout/failed/${order.id}`);
      return;
    }
    const payment = (await payResponse.json()) as { payment_id: string };
    router.push(`/checkout/mock/${payment.payment_id}?order=${order.id}`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="summary-heading" className="grid gap-4">
        <h2 id="summary-heading" className="text-lead font-semibold">
          {t('summary')}
        </h2>
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.optionId} className="rounded-card border border-border bg-surface p-4">
              <span className="block font-semibold text-ink">{item.title}</span>
              <span className="text-sm text-ink-muted">
                {t('quantity')}: {item.quantity}
              </span>
              <span className="block font-semibold text-ink tabular-nums">
                {money(item.unitPrice * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        {savings > 0 && (
          <p className="rounded-control-ui bg-save-tint px-4 py-2 font-semibold text-save">
            {t('savings', { amount: money(savings) })}
          </p>
        )}
      </section>

      <form className="grid content-start gap-5" noValidate onSubmit={form.handleSubmit(submit)}>
        <div className="text-lead font-bold tabular-nums">
          {t('total')}: {money(total)}
        </div>
        <p className="text-sm text-ink-muted">{t('paymentNote')}</p>

        <div className="grid gap-1">
          <label htmlFor="checkout-terms" className="flex items-start gap-2 text-sm">
            <input
              id="checkout-terms"
              type="checkbox"
              className="mt-1"
              aria-labelledby="checkout-terms-label"
              aria-describedby={accepted ? undefined : 'terms-hint'}
              {...form.register('terms')}
            />
            <span id="checkout-terms-label">{t('terms')}</span>
          </label>
          {!accepted && (
            <p id="terms-hint" className="pl-6 text-sm text-ink-muted">
              {t('termsHint')}
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control-ui bg-error-tint p-3 text-error"
          >
            <span aria-hidden="true">!</span>
            <span>{error}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={!accepted || form.formState.isSubmitting}
          aria-disabled={!accepted || form.formState.isSubmitting}
          aria-describedby={accepted ? undefined : 'terms-hint'}
          className={
            accepted
              ? 'rounded-control-ui bg-deal px-5 py-3 font-semibold text-surface hover:bg-deal-hover disabled:cursor-not-allowed disabled:opacity-60'
              : 'cursor-not-allowed rounded-control-ui bg-border px-5 py-3 font-semibold text-ink-muted'
          }
        >
          {form.formState.isSubmitting ? t('placing') : t('placeOrder')}
        </button>
      </form>
    </div>
  );
}
