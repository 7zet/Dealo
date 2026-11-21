import { ACCESS_COOKIE, REFRESH_COOKIE, apiBaseUrl, rescopeCookie } from './session-cookies';

/** A rotated session: the new access token and the Set-Cookie headers to hand to the browser. */
export type RefreshedSession = { accessToken: string | null; setCookies: string[] };

/**
 * The API revokes the whole session when one refresh token is presented twice. A page often fires
 * several BFF calls at once right after the access cookie expired, all carrying the same refresh
 * token, so one rotation per token is shared by every caller for a short while.
 */
const REUSE_WINDOW_MS = 30_000;
const inFlight = new Map<string, Promise<RefreshedSession>>();

function accessTokenOf(setCookies: string[]): string | null {
  for (const cookie of setCookies) {
    const match = new RegExp(`^${ACCESS_COOKIE}=([^;]*)`).exec(cookie);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function rotate(refresh: string, userAgent: string): Promise<RefreshedSession> {
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Cookie: `${REFRESH_COOKIE}=${refresh}`,
        'User-Agent': userAgent,
      },
      cache: 'no-store',
    });
  } catch {
    // API unreachable: keep the cookies, the caller answers 401 and the next request tries again.
    return { accessToken: null, setCookies: [] };
  }
  const setCookies = upstream.headers.getSetCookie().map(rescopeCookie);
  const accessToken = upstream.ok ? accessTokenOf(setCookies) : null;
  // A rejected refresh token must not stay in the browser, or every request would retry it.
  if (!accessToken && !setCookies.some((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`))) {
    setCookies.push(`${REFRESH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }
  return { accessToken, setCookies };
}

/** Rotates the session for this refresh token once; concurrent and near-simultaneous callers share it. */
export function refreshSession(refresh: string, userAgent: string): Promise<RefreshedSession> {
  const existing = inFlight.get(refresh);
  if (existing) return existing;
  const pending = rotate(refresh, userAgent);
  inFlight.set(refresh, pending);
  void pending.then((result) => {
    // Only a rotation is shared; after a network failure the next request may try again at once.
    if (!result.accessToken && result.setCookies.length === 0) {
      inFlight.delete(refresh);
      return;
    }
    setTimeout(() => inFlight.delete(refresh), REUSE_WINDOW_MS).unref?.();
  });
  return pending;
}
