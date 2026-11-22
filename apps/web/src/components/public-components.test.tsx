import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import messages from '@dealo/i18n/messages/en';
import { deals } from '@/mocks/data';
import { DealCard } from './deal-card';
import { ListingControls } from './listing-controls';
import { PurchasePanel } from './purchase-panel';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>{children}</NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
}

describe('public marketplace components', () => {
  it('renders an accessible deal card with prices and one deal destination', () => {
    render(<DealCard deal={deals[0]!} locale="en" currency="UZS" />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: new RegExp(deals[0]!.title.en) })).toHaveAttribute(
      'href',
      `/deal/${deals[0]!.slug}`,
    );
    expect(screen.getAllByText(/UZS/).length).toBeGreaterThanOrEqual(2);
  });
  it('hides the rating on a card until the deal has a review', () => {
    const deal = { ...deals[0]!, rating_avg: 0, rating_count: 0, sold_count: 722 };
    render(<DealCard deal={deal} locale="en" currency="UZS" />, { wrapper: Wrapper });
    expect(screen.queryByText('0.0')).toBeNull();
    expect(screen.getByText('722+ sold')).toBeInTheDocument();
  });
  it('updates purchase quantity without exceeding the selected option', async () => {
    const user = userEvent.setup();
    render(<PurchasePanel deal={deals[0]!} locale="en" currency="UZS" />, { wrapper: Wrapper });
    const plus = screen.getByRole('button', { name: 'Increase quantity' });
    await user.click(plus);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy now' })).toBeEnabled();
  });
  it('names each option radio after the option and explains the quantity limit', async () => {
    const user = userEvent.setup();
    const deal = { ...deals[0]!, max_per_user: 2 };
    const { container } = render(<PurchasePanel deal={deal} locale="en" currency="UZS" />, {
      wrapper: Wrapper,
    });
    const panel = within(container);
    const radio = panel.getByRole('radio', { name: 'Premium package' });
    expect(radio).toHaveAttribute('value', deal.options[1]!.id);
    expect(panel.getByRole('radio', { name: 'Standard package' })).toBeChecked();

    const plus = panel.getByRole('button', { name: 'Increase quantity' });
    expect(panel.queryByText('Up to 2 per customer')).not.toBeInTheDocument();
    await user.click(plus);
    expect(plus).toBeDisabled();
    expect(plus).toHaveAccessibleDescription('Up to 2 per customer');
  });
  it('exposes listing filters and every required sort', () => {
    render(<ListingControls subcategories={[{ slug: 'massage', label: 'Massage' }]} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByLabelText('Subcategory')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Biggest discount' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ending soon' })).toBeInTheDocument();
  });
});
