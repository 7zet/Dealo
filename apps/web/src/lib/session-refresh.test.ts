import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshSession } from './session-refresh';
import { accessTokenIn, publicBody } from './session-cookies';

afterEach(() => vi.unstubAllGlobals());

function rotated() {
  const headers = new Headers();
  headers.append('Set-Cookie', 'access_token=new-access; Path=/; Max-Age=900; HttpOnly');
  headers.append(
    'Set-Cookie',
    'refresh_token=new-refresh; Path=/api/v1; Max-Age=2592000; HttpOnly',
  );
  return new Response('{}', { status: 200, headers });
}

describe('refreshSession', () => {
  it('rotates a refresh token once for concurrent callers', async () => {
    const fetchMock = vi.fn(async () => rotated());
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([refreshSession('r-1', 'ua'), refreshSession('r-1', 'ua')]);
    const late = await refreshSession('r-1', 'ua');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.accessToken).toBe('new-access');
    expect(b).toBe(a);
    expect(late).toBe(a);
    // Cookies are re-scoped to the whole site.
    expect(a.setCookies.every((cookie) => /Path=\//.test(cookie))).toBe(true);
    expect(a.setCookies.some((cookie) => cookie.includes('Path=/api'))).toBe(false);
  });

  it('drops a rejected refresh token from the browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    const result = await refreshSession('r-2', 'ua');
    expect(result.accessToken).toBeNull();
    expect(result.setCookies).toContain(
      'refresh_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
  });

  it('lets the next request retry after the API was unreachable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(rotated());
    vi.stubGlobal('fetch', fetchMock);
    expect((await refreshSession('r-3', 'ua')).accessToken).toBeNull();
    await Promise.resolve();
    expect((await refreshSession('r-3', 'ua')).accessToken).toBe('new-access');
  });
});

describe('publicBody', () => {
  it('removes the tokens from a sign-in body and adds extra fields', () => {
    const body = JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 900,
      user: { id: 'u' },
    });
    expect(accessTokenIn(body)).toBe('a');
    expect(JSON.parse(publicBody(body, true, { landing: '/merchant/redeem' }))).toEqual({
      expires_in: 900,
      user: { id: 'u' },
      landing: '/merchant/redeem',
    });
  });

  it('passes problems through untouched', () => {
    const problem = JSON.stringify({ code: 'otp_invalid' });
    expect(publicBody(problem, false)).toBe(problem);
  });
});
