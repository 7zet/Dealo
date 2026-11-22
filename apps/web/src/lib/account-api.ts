import 'server-only';

import type { components } from '@dealo/api-client';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { NO_ACCESS_HREF } from './merchant-access';
import { stripLocalePrefix } from './safe-next';

/** Thrown when the session is missing or rejected, so the caller can send the visitor to sign in. */
export class SessionRequiredError extends Error {}

/** Path of the panel page explaining that the visitor's role does not include a section. */
export { NO_ACCESS_HREF };

/**
 * A 403 from a merchant operation means the visitor's role lacks the permission. The panel shows a
 * localized "no access" page instead of the generic error page.
 */
async function forbidden(path: string): Promise<never> {
  if (path.startsWith('/merchant/')) {
    redirect(`/${await getLocale()}${NO_ACCESS_HREF}`);
  }
  throw new Error(`account request ${path} failed: 403`);
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1';
}

/**
 * Calls an authenticated API operation on behalf of the signed-in visitor. Account data is personal,
 * so responses are never cached.
 */
export async function accountGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) throw new SessionRequiredError();

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 401) throw new SessionRequiredError();
  if (response.status === 403) return forbidden(path);
  if (!response.ok) throw new Error(`account request ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Sends the visitor to sign in and returns to the page they asked for. The return path is passed
 * without its locale: the sign-in form navigates with the locale-aware router, which adds it again.
 */
export function requireSession(locale: string, returnPath: string): never {
  redirect(`/${locale}/login?next=${encodeURIComponent(stripLocalePrefix(returnPath))}`);
}

/** Runs a visitor-scoped load and converts a missing or rejected session into a sign-in redirect. */
export async function loadForVisitor<T>(
  locale: string,
  returnPath: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof SessionRequiredError) requireSession(locale, returnPath);
    throw error;
  }
}

/** Like accountGet, but a missing resource resolves to null so the caller can show a not-found page. */
export async function accountGetOrNull<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) throw new SessionRequiredError();

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 401) throw new SessionRequiredError();
  if (response.status === 403) return forbidden(path);
  // 400 is a malformed id in the path (not a UUID): to the visitor that is the same as not found.
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`account request ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The signed-in visitor's profile. Memoised for one server render, so the account shell and the page
 * share a single GET /me.
 */
export const getMe = cache(() => accountGetOrNull<components['schemas']['User']>('/me'));
