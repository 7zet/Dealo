import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';
import { allowSeedImages, contentSecurityPolicy, createNonce } from './lib/security-headers';
import { ACCESS_COOKIE, REFRESH_COOKIE, apiBaseUrl, rescopeCookie } from './lib/session-cookies';

const intl = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy({
    nonce: createNonce(),
    development: process.env.NODE_ENV === 'development',
    seedImages: allowSeedImages(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SITE_URL),
    apiBaseUrl: apiBaseUrl(),
    mediaPublicBase: process.env.MEDIA_PUBLIC_BASE,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    msw: process.env.NEXT_PUBLIC_USE_MSW === 'true',
  });
  const renewed = await renewSession(request);
  if (renewed) {
    renewed.headers.set('Content-Security-Policy', csp);
    return renewed;
  }
  // Next.js reads the nonce from the request's CSP header and puts it on its own scripts, so the
  // header travels with the request to the renderer as well as on the response. Every page renders
  // per request (the locale layout reads cookies), so each response gets a fresh nonce.
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  const response = intl(new NextRequest(request, { headers }));
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * The access cookie lives 15 minutes; the refresh cookie lives 30 days. When the access cookie has
 * expired but a refresh cookie remains, rotate the session and reload the same URL with the new
 * cookies, so signed-in visitors stay signed in.
 *
 * The API revokes the whole session if one refresh token is used twice, so this runs only for real
 * navigations, never for router prefetches that the browser may fire in parallel.
 */
async function renewSession(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== 'GET') return null;
  if (request.cookies.has(ACCESS_COOKIE)) return null;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  if (
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('sec-purpose')?.includes('prefetch')
  ) {
    return null;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Cookie: `${REFRESH_COOKIE}=${refresh}`,
        'User-Agent': request.headers.get('user-agent') ?? '',
      },
      cache: 'no-store',
    });
  } catch {
    return null; // API unreachable: render the page as a guest rather than loop.
  }

  const response = NextResponse.redirect(request.nextUrl, 307);
  response.headers.set('Cache-Control', 'no-store');
  const cookies = upstream.headers.getSetCookie();
  for (const cookie of cookies) response.headers.append('Set-Cookie', rescopeCookie(cookie));
  // A failed or unexpected refresh must not leave the refresh cookie behind, or every page would redirect again.
  if (!upstream.ok || !cookies.some((cookie) => cookie.startsWith(`${ACCESS_COOKIE}=`))) {
    response.cookies.delete(REFRESH_COOKIE);
  }
  return response;
}

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
