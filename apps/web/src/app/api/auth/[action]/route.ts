import { NextResponse } from 'next/server';

import { rejectCrossSite } from '@/lib/csrf';
import { forwardHeaders } from '@/lib/forward-headers';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  apiBaseUrl,
  accessTokenIn,
  publicBody,
  rescopeCookie,
} from '@/lib/session-cookies';
import { landingPath } from '@/lib/landing';
import type { MeSummary } from '@/lib/merchant-access';

/**
 * Same-origin proxy for sign-in and sign-out. The Go API sets httpOnly session cookies on its own
 * origin; this route forwards the request and re-issues those cookies on the web origin so the
 * browser keeps them for every page on this site. Only these steps are reachable.
 */
const API_PATHS: Record<string, string> = {
  'phone-code': '/auth/phone/code',
  'phone-verify': '/auth/phone/verify',
  logout: '/auth/logout',
};

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/** The role landing of the account behind a fresh access token; the homepage if it cannot be read. */
async function landingFor(token: string | null): Promise<string> {
  if (!token) return '/';
  try {
    const response = await fetch(`${apiBaseUrl()}/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    return response.ok ? landingPath((await response.json()) as MeSummary) : '/';
  } catch {
    return '/';
  }
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  // Sign-in and sign-out set or clear the session, so a forged cross-site post is refused.
  const forged = rejectCrossSite(request);
  if (forged) return forged;
  const { action } = await context.params;
  const path = API_PATHS[action];
  if (!path) {
    return NextResponse.json({ code: 'not_found' }, { status: 404 });
  }

  if (action === 'logout') {
    // The API identifies the session by its refresh cookie and revokes it.
    const refresh = cookieValue(request, REFRESH_COOKIE);
    if (refresh) {
      await fetch(`${apiBaseUrl()}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', Cookie: `${REFRESH_COOKIE}=${refresh}` },
        cache: 'no-store',
      }).catch(() => undefined);
    }
    // Sign the browser out even if the API could not revoke the token (for example, it had expired).
    const response = new NextResponse(null, { status: 204 });
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      response.cookies.set(name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
    }
    return response;
  }

  const upstream = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: forwardHeaders(request),
    body: await request.text(),
    cache: 'no-store',
  });

  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
  });
  // The sign-in page counts down from this value when a limit is hit.
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) headers.set('Retry-After', retryAfter);
  const text = await upstream.text();
  // After a sign-in the form needs to know where this account lands when no `next` was asked for.
  const extra =
    action === 'phone-verify' && upstream.ok
      ? { landing: await landingFor(accessTokenIn(text)) }
      : undefined;
  const response = new NextResponse(publicBody(text, upstream.ok, extra), {
    status: upstream.status,
    headers,
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', rescopeCookie(cookie));
  }
  return response;
}
