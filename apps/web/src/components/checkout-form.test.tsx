import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@dealo/i18n/messages/en';

import { useBuyNow } from '@/stores/buy-now';

import { CheckoutForm } from './checkout-form';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  useBuyNow.setState({
    items: [
      {
        optionId: '018f0000-0000-7000-8000-000000000001',
        quantity: 1,
        title: 'Special local offer',
        dealSlug: 'special-local-offer',
        unitPrice: 22_500_000,
        originalPrice: 30_000_000,
      },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useBuyNow.setState({ items: [] });
});

describe('CheckoutForm', () => {
  it('keeps the pay button visibly unavailable until the terms are accepted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CheckoutForm />, { wrapper: Wrapper });

    const pay = screen.getByRole('button', { name: 'Continue to payment' });
    const terms = screen.getByRole('checkbox', { name: messages.Checkout.terms });
    const hint = screen.getByText(messages.Checkout.termsHint);

    expect(pay).toBeDisabled();
    expect(pay).toHaveAttribute('aria-disabled', 'true');
    expect(pay).toHaveClass('cursor-not-allowed', 'bg-border', 'text-ink-muted');
    expect(pay).not.toHaveClass('bg-deal');
    expect(pay).toHaveAccessibleDescription(messages.Checkout.termsHint);
    expect(terms).toHaveAttribute('aria-describedby', hint.id);

    await user.click(pay);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(terms);
    expect(pay).toBeEnabled();
    expect(pay).toHaveAttribute('aria-disabled', 'false');
    expect(pay).toHaveClass('bg-deal');
    expect(pay).not.toHaveClass('cursor-not-allowed');
    expect(screen.queryByText(messages.Checkout.termsHint)).not.toBeInTheDocument();

    // Unticking takes the button back to its unavailable look.
    await user.click(terms);
    expect(pay).toBeDisabled();
    expect(pay).toHaveClass('bg-border');
  });

  it('names the consent checkbox after the terms text', () => {
    render(<CheckoutForm />, { wrapper: Wrapper });
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(messages.Checkout.terms);
  });

  it('shows non-cart copy when nothing was selected', () => {
    useBuyNow.setState({ items: [] });
    render(<CheckoutForm />, { wrapper: Wrapper });
    expect(screen.getByText(messages.Checkout.noSelection)).toBeInTheDocument();
  });

  it('forgets the selection once the order is created', async () => {
    const orderId = '018f0000-0000-7000-8000-0000000000bb';
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
      url === '/api/bff/orders'
        ? new Response(JSON.stringify({ id: orderId }), { status: 201 })
        : new Response(JSON.stringify({ payment_id: 'p1' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CheckoutForm />, { wrapper: Wrapper });

    await user.click(screen.getByRole('checkbox', { name: messages.Checkout.terms }));
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      items: { deal_option_id: string }[];
    };
    expect(body.items).toHaveLength(1);
    expect(useBuyNow.getState().items).toEqual([]);
  });

  it('shows money through formatMoney (tiyin to so’m, fixed grouping)', () => {
    render(<CheckoutForm />, { wrapper: Wrapper });
    expect(screen.getAllByText('225,000 UZS').length).toBeGreaterThan(0);
    expect(screen.getByText('You save 75,000 UZS')).toBeInTheDocument();
  });
});
