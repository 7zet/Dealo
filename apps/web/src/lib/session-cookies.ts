/**
 * The Go API scopes the refresh cookie to its own /api/v1 path. The web app re-issues every session
 * cookie at Path=/ so the browser sends it to all pages of this site, including the sign-in proxy.
 */
export function rescopeCookie(cookie: string): string {
  return /;\s*Path=/i.test(cookie)
    ? cookie.replace(/;\s*Path=[^;]*/i, '; Path=/')
    : `${cookie}; Path=/`;
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1';
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/**
 * The session lives in httpOnly cookies. The API also returns the tokens in the sign-in body for
 * native clients; browser code must never be able to read them, so they are removed here. `extra`
 * fields (such as the post-sign-in landing page) are added to a successful body.
 */
export function publicBody(body: string, ok: boolean, extra?: Record<string, unknown>): string {
  if (!ok) return body;
  try {
    const data = JSON.parse(body) as Record<string, unknown>;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return body;
    delete data.access_token;
    delete data.refresh_token;
    return JSON.stringify({ ...data, ...extra });
  } catch {
    return body;
  }
}

/** The access token of a sign-in body, read on the server only. */
export function accessTokenIn(body: string): string | null {
  try {
    const token = (JSON.parse(body) as { access_token?: unknown }).access_token;
    return typeof token === 'string' && token !== '' ? token : null;
  } catch {
    return null;
  }
}
