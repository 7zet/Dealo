import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@dealo/i18n/messages/en';

import { useBuyNow } from '@/stores/buy-now';

import { ReviewForm } from './review-form';
import { SignOutButton } from './sign-out-button';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('buyer actions', () => {
  it('confirms a submitted review', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 201 })),
    );
    const user = userEvent.setup();
    render(<ReviewForm voucherId="018f0000-0000-7000-8000-0000000000aa" locale="en" />, {
      wrapper: Wrapper,
    });
    await user.type(
      screen.getByLabelText(messages.Reviews.text),
      'A calm, careful massage. Recommended.',
    );
    await user.click(screen.getByRole('button', { name: messages.Reviews.submit }));

    expect(await screen.findByRole('status')).toHaveTextContent(messages.Reviews.submitted);
    expect(screen.queryByRole('button', { name: messages.Reviews.submit })).not.toBeInTheDocument();
  });

  it('clears the buy-now selection on sign-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    useBuyNow.getState().select([
      {
        optionId: 'option-a',
        quantity: 1,
        title: 'A',
        dealSlug: 'a',
        unitPrice: 1,
        originalPrice: 1,
      },
    ]);
    const user = userEvent.setup();
    render(<SignOutButton />, { wrapper: Wrapper });
    await user.click(screen.getByRole('button', { name: messages.Navigation.signOut }));
    expect(useBuyNow.getState().items).toEqual([]);
  });
});
