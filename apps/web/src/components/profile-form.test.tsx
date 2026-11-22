import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@dealo/i18n/messages/en';

import {
  formatPhone,
  initials,
  isPlaceholderEmail,
  membershipHref,
  profileErrorKey,
  staffAreas,
} from '@/lib/profile';

import { ProfileForm } from './profile-form';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProfileForm', () => {
  it('sends only the changed name and confirms the save', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { name: 'Aziz Karimov', locale: 'en' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ProfileForm initial={{ name: 'Foydalanuvchi', locale: 'en' }} currentLocale="en" />, {
      wrapper: Wrapper,
    });

    const name = screen.getByLabelText('Full name');
    // The generated default name is not prefilled.
    expect(name).toHaveValue('');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await user.type(name, 'Aziz Karimov');
    await user.click(save);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bff/me',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Aziz Karimov' }) }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved.');
  });

  it('blocks an empty name and shows the API validation error', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(422, { code: 'validation_failed', errors: { name: ['invalid_length'] } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ProfileForm initial={{ name: 'Dilnoza', locale: 'ru' }} currentLocale="en" />, {
      wrapper: Wrapper,
    });

    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a name of 1 to 200 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(name, 'D');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a name of 1 to 200 characters.',
    );
  });
});

describe('profile helpers', () => {
  it('formats Uzbekistan phones and hides placeholder emails', () => {
    expect(formatPhone('+998900000002')).toBe('+998 90 000 00 02');
    expect(formatPhone(null)).toBeNull();
    expect(isPlaceholderEmail('998901111111@phone.dealo.local')).toBe(true);
    expect(isPlaceholderEmail('aziz@example.com')).toBe(false);
    expect(initials('Aziz Karimov')).toBe('AK');
    expect(initials('Foydalanuvchi')).toBeNull();
  });

  it('lists only the admin areas each role can open', () => {
    expect(staffAreas(['user'])).toEqual([]);
    expect(staffAreas(['moderator'])).toEqual(['moderation', 'merchants', 'reports']);
    expect(staffAreas(['support'])).toEqual(['finance']);
    expect(staffAreas(['admin'])).toEqual(['moderation', 'merchants', 'reports', 'audit']);
    expect(staffAreas(['superadmin'])).toHaveLength(5);
    expect(membershipHref('approved')).toBe('/merchant/dashboard');
    expect(membershipHref('in_review')).toBe('/merchant/review');
    expect(profileErrorKey(422, { code: 'phone_change_requires_verification' })).toBe('errorPhone');
    expect(profileErrorKey(401, {})).toBe('errorSession');
  });
});
