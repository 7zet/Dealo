import { describe, expect, it } from 'vitest';

import {
  PERMISSIONS_POLICY,
  allowSeedImages,
  contentSecurityPolicy,
  createNonce,
  staticSecurityHeaders,
} from './security-headers';

function directive(policy: string, name: string): string[] {
  const entry = policy.split('; ').find((part) => part.startsWith(`${name} `));
  return entry ? entry.split(' ').slice(1) : [];
}

describe('contentSecurityPolicy', () => {
  const production = contentSecurityPolicy({
    nonce: 'abc123',
    development: false,
    seedImages: false,
    apiBaseUrl: 'https://api.dealo.uz/api/v1',
    mediaPublicBase: 'https://media.dealo.uz/media',
    siteUrl: 'https://dealo.uz',
  });

  it('restricts scripts to the nonce without eval in production', () => {
    expect(directive(production, 'script-src')).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
    expect(production).not.toContain('unsafe-eval');
  });

  it('allows media, map tiles and the API, but not seed images, in production', () => {
    const img = directive(production, 'img-src');
    expect(img).toEqual(
      expect.arrayContaining([
        'https://tile.openstreetmap.org',
        'https://api.dealo.uz',
        'https://media.dealo.uz',
      ]),
    );
    expect(img).not.toContain('https://images.unsplash.com');
  });

  it('forbids framing, plugins and foreign forms and upgrades http on an https site', () => {
    expect(directive(production, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(production, 'object-src')).toEqual(["'none'"]);
    expect(directive(production, 'form-action')).toEqual(["'self'"]);
    expect(production).toContain('upgrade-insecure-requests');
    expect(directive(production, 'connect-src')).toEqual(["'self'"]);
  });

  it('adds eval, HMR websockets, seed images and the mocked API in development', () => {
    const dev = contentSecurityPolicy({
      nonce: 'n',
      development: true,
      seedImages: true,
      apiBaseUrl: 'http://localhost:8080/api/v1',
      siteUrl: 'http://localhost:3000',
      msw: true,
    });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toEqual([
      "'self'",
      'ws:',
      'wss:',
      'http://localhost:8080',
    ]);
    expect(directive(dev, 'img-src')).toContain('https://images.unsplash.com');
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('ignores malformed origins', () => {
    const policy = contentSecurityPolicy({
      nonce: 'n',
      development: false,
      seedImages: false,
      apiBaseUrl: 'not a url',
    });
    expect(directive(policy, 'img-src')).not.toContain('not');
  });
});

describe('allowSeedImages', () => {
  it('allows seed images in development and on local production builds only', () => {
    expect(allowSeedImages('development', 'https://dealo.uz')).toBe(true);
    expect(allowSeedImages('production', undefined)).toBe(true);
    expect(allowSeedImages('production', 'http://127.0.0.1:3000')).toBe(true);
    expect(allowSeedImages('production', 'https://dealo.uz')).toBe(false);
    expect(allowSeedImages('production', 'not a url')).toBe(false);
  });
});

describe('static headers', () => {
  it('sends HSTS only in production', () => {
    const keys = (production: boolean) => staticSecurityHeaders(production).map(({ key }) => key);
    expect(keys(true)).toContain('Strict-Transport-Security');
    expect(keys(false)).not.toContain('Strict-Transport-Security');
    expect(keys(false)).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'Referrer-Policy',
        'X-Frame-Options',
        'Permissions-Policy',
      ]),
    );
  });

  it('allows the camera for the voucher scanner only on this site', () => {
    expect(PERMISSIONS_POLICY).toContain('camera=(self)');
    expect(PERMISSIONS_POLICY).toContain('geolocation=()');
  });

  it('creates a different nonce each time', () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
