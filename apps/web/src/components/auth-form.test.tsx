import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@dealo/i18n/messages/en';

import { AuthForm, formatWait, retryAfterSeconds } from './auth-form';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('wait helpers', () => {
  it('formats a wait as minutes and seconds', () => {
    expect(formatWait(165)).toBe('2:45');
    expect(formatWait(59.2)).toBe('1:00');
    expect(formatWait(5)).toBe('0:05');
    expect(formatWait(-3)).toBe('0:00');
  });

  it('reads the wait from the body, then the Retry-After header', () => {
    expect(retryAfterSeconds({ retry_after_seconds: 165 }, '900')).toBe(165);
    expect(retryAfterSeconds({}, '42')).toBe(42);
    expect(retryAfterSeconds({}, null)).toBe(0);
    expect(retryAfterSeconds({}, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(0);
  });
});

describe('AuthForm', () => {
  it('counts down the exact wait and lets another number through at once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        problem(429, { code: 'rate_limited', retry_after_seconds: 165 }, { 'Retry-After': '165' }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cooldown_seconds: 60 }), { status: 202 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuthForm next="/" />, { wrapper: Wrapper });

    const phone = screen.getByLabelText(messages.Auth.phoneLabel);
    await user.type(phone, '901234567');
    await user.click(screen.getByRole('button', { name: messages.Auth.sendCode }));

    // Announced once to screen readers, and shown as a countdown.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 2:45.',
    );
    expect(screen.getAllByText('Too many attempts. Try again in 2:45.')).toHaveLength(2);
    expect(screen.getByRole('button', { name: messages.Auth.sendCode })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // Five seconds later (plus a little real time while the test runs) the countdown has moved on.
    expect(
      screen.getByText(/^Too many attempts\. Try again in 2:(40|39|38)\.$/),
    ).toBeInTheDocument();

    // A different number is a different limit: the wait does not apply to it.
    await user.clear(phone);
    await user.type(phone, '907654321');
    const send = screen.getByRole('button', { name: messages.Auth.sendCode });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/phone-code',
      expect.objectContaining({ body: JSON.stringify({ phone: '+998907654321' }) }),
    );
  });

  it('tells the visitor when the code has expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ cooldown_seconds: 0 }), { status: 202 }))
      .mockResolvedValueOnce(problem(401, { code: 'otp_expired' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AuthForm next="/" />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(messages.Auth.phoneLabel), '901234567');
    await user.click(screen.getByRole('button', { name: messages.Auth.sendCode }));
    await user.type(await screen.findByLabelText(messages.Auth.codeLabel), '123456');
    await user.click(screen.getByRole('button', { name: messages.Auth.verifyCode }));

    expect(await screen.findByRole('alert')).toHaveTextContent(messages.Auth.errorOtpExpired);
  });

  it('sends the code once when Enter is pressed twice in a row', async () => {
    let finish: (value: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ cooldown_seconds: 0 }), { status: 202 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)))
      .mockResolvedValue(problem(401, { code: 'otp_invalid' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AuthForm />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(messages.Auth.phoneLabel), '901234567{Enter}');
    const code = await screen.findByLabelText(messages.Auth.codeLabel);
    await user.type(code, '123456{Enter}{Enter}');
    finish(
      new Response(JSON.stringify({ user: {}, landing: '/merchant/redeem' }), { status: 200 }),
    );

    await act(async () => undefined);
    const verifies = fetchMock.mock.calls.filter(([url]) => url === '/api/auth/phone-verify');
    expect(verifies).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
