import { describe, expect, it } from 'vitest';

import { checkSameOrigin, rejectCrossSite } from './csrf';

const SITE = 'https://dealo.uz';

function request(
  method: string,
  headers: Record<string, string>,
  url = 'https://dealo.uz/api/bff/orders',
) {
  return new Request(url, { method, headers });
}

describe('checkSameOrigin', () => {
  it('lets safe methods through without any header', () => {
    expect(checkSameOrigin(request('GET', { origin: 'https://evil.example' }), SITE).ok).toBe(true);
    expect(checkSameOrigin(request('HEAD', {}), SITE).ok).toBe(true);
  });

  it('accepts a POST from the configured site origin', () => {
    expect(checkSameOrigin(request('POST', { origin: SITE, host: 'internal:3000' }), SITE).ok).toBe(
      true,
    );
  });

  it('accepts a POST whose origin matches the request host (dev, tunnels)', () => {
    const req = request(
      'PATCH',
      { origin: 'http://localhost:3000', host: 'localhost:3000' },
      'http://localhost:3000/api/bff/me',
    );
    expect(checkSameOrigin(req, undefined).ok).toBe(true);
  });

  it('accepts the forwarded host behind a reverse proxy', () => {
    const req = request('DELETE', {
      origin: 'https://abc.ngrok-free.app',
      host: 'localhost:3000',
      'x-forwarded-host': 'abc.ngrok-free.app',
    });
    expect(checkSameOrigin(req, 'http://localhost:3000').ok).toBe(true);
  });

  it('rejects a foreign origin', () => {
    const verdict = checkSameOrigin(
      request('POST', { origin: 'https://evil.example', host: 'dealo.uz' }),
      SITE,
    );
    expect(verdict).toEqual({ ok: false, reason: 'foreign_origin' });
  });

  it('rejects a look-alike host', () => {
    const verdict = checkSameOrigin(
      request('POST', { origin: 'https://dealo.uz.evil.example', host: 'dealo.uz' }),
      SITE,
    );
    expect(verdict.ok).toBe(false);
  });

  it('rejects an opaque origin', () => {
    expect(checkSameOrigin(request('PUT', { origin: 'null', host: 'dealo.uz' }), SITE)).toEqual({
      ok: false,
      reason: 'opaque_origin',
    });
  });

  it('falls back to Sec-Fetch-Site', () => {
    expect(checkSameOrigin(request('POST', { 'sec-fetch-site': 'same-origin' }), SITE).ok).toBe(
      true,
    );
    expect(checkSameOrigin(request('POST', { 'sec-fetch-site': 'same-site' }), SITE).ok).toBe(
      false,
    );
    expect(checkSameOrigin(request('POST', { 'sec-fetch-site': 'cross-site' }), SITE).ok).toBe(
      false,
    );
  });

  it('falls back to Referer', () => {
    expect(
      checkSameOrigin(request('POST', { referer: 'https://dealo.uz/uz/checkout/x' }), SITE).ok,
    ).toBe(true);
    expect(checkSameOrigin(request('POST', { referer: 'https://evil.example/' }), SITE).ok).toBe(
      false,
    );
  });

  it('lets non-browser clients without browser headers through', () => {
    expect(checkSameOrigin(request('POST', {}), SITE).ok).toBe(true);
  });
});

describe('rejectCrossSite', () => {
  it('answers a forged request with a 403 problem document', async () => {
    const response = rejectCrossSite(
      request('POST', { origin: 'https://evil.example', host: 'dealo.uz' }),
    );
    expect(response?.status).toBe(403);
    expect(response?.headers.get('content-type')).toBe('application/problem+json');
    expect(await response?.json()).toMatchObject({ code: 'csrf_rejected', status: 403 });
  });

  it('returns null for a same-origin request', () => {
    expect(rejectCrossSite(request('POST', { 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });
});
