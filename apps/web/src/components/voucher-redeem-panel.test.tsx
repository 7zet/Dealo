import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@dealo/i18n/messages/uz';

import { VoucherRedeemPanel } from './voucher-redeem-panel';

vi.mock('@zxing/browser', () => ({ BrowserQRCodeReader: class {} }));

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="uz" messages={messages}>
      <VoucherRedeemPanel locations={[{ id: 'loc-1', label: 'Toshkent' }]} locale="uz" />
    </NextIntlClientProvider>,
  );
}

function problem(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const input = () => screen.getByLabelText(messages.Redeem.codeLabel);
const check = () => screen.getByRole('button', { name: messages.Redeem.check });

describe('VoucherRedeemPanel', () => {
  it('formats the code as the cashier types and caps its length', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(input(), 'ab12 cd34');
    expect(input()).toHaveValue('AB12-CD34');
    expect(input()).toHaveAttribute('maxlength', '11');
  });

  it('asks for a code instead of calling the API when the field is empty or incomplete', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    const user = userEvent.setup();
    await user.click(check());
    expect(screen.getByRole('alert')).toHaveTextContent(messages.Redeem.codeRequired);
    await user.type(input(), 'AB1');
    await user.click(check());
    expect(screen.getByRole('alert')).toHaveTextContent(messages.Redeem.invalid_code);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a scanner block with the wait from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problem(
          429,
          { code: 'scanner_blocked', retry_after_seconds: 540 },
          { 'Retry-After': '540' },
        ),
      ),
    );
    renderPanel();
    const user = userEvent.setup();
    await user.type(input(), 'AB12CD34');
    await user.click(check());
    expect(await screen.findByRole('alert')).toHaveTextContent('9:00');
    expect(screen.getByRole('alert')).not.toHaveTextContent(messages.Redeem.errorGeneric);
  });

  it('maps invalid_code and keeps the existing specific messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(problem(422, { code: 'invalid_code' }))
      .mockResolvedValueOnce(problem(404, { code: 'voucher_not_found' }))
      .mockResolvedValueOnce(problem(403, { code: 'wrong_merchant' }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    const user = userEvent.setup();
    await user.type(input(), 'AB12CD34');
    await user.click(check());
    expect(await screen.findByText(messages.Redeem.invalid_code)).toBeInTheDocument();
    await user.click(check());
    expect(await screen.findByText(messages.Redeem.voucher_not_found)).toBeInTheDocument();
    await user.click(check());
    expect(await screen.findByText(messages.Redeem.wrong_merchant)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/bff/merchant/vouchers/lookup',
      expect.objectContaining({ body: JSON.stringify({ code: 'AB12-CD34' }) }),
    );
  });

  it('offers to sign in again, back to this screen, when the session has ended', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(401, { code: 'unauthenticated' })),
    );
    renderPanel();
    const user = userEvent.setup();
    await user.type(input(), 'AB12CD34');
    await user.click(check());
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.Redeem.sessionExpired);
    expect(screen.getByRole('link', { name: messages.Redeem.signInAgain })).toHaveAttribute(
      'href',
      '/login?next=%2Fmerchant%2Fredeem',
    );
  });
});
