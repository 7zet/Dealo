/**
 * Security headers for the web app. Pages get a per-request nonce-based Content-Security-Policy from
 * the proxy (`src/proxy.ts`); every response, including API routes and static files, gets the static
 * headers from `next.config.ts`.
 *
 * Kept free of Next.js imports so `next.config.ts` and unit tests can load it.
 */

/** OpenStreetMap raster tiles used by the Leaflet maps (map page, deal and business pages). */
const MAP_TILE_ORIGIN = 'https://tile.openstreetmap.org';

/** Development seed images only; seed data never reaches production. */
export const SEED_IMAGE_ORIGIN = 'https://images.unsplash.com';

/**
 * Whether the development seed images may load. Never on a deployed production build; a production
 * build served on this machine (`next start` for the E2E suite, previews) still shows the seed.
 * Deployments must set NEXT_PUBLIC_SITE_URL to their public address, so a local address means
 * "not deployed".
 */
export function allowSeedImages(nodeEnv: string | undefined, siteUrl: string | undefined): boolean {
  if (nodeEnv !== 'production') return true;
  try {
    const { hostname } = new URL(siteUrl ?? 'http://localhost:3000');
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export type CspOptions = {
  nonce: string;
  /** `next dev`: React needs eval for its debugging aids and HMR uses a websocket. */
  development: boolean;
  /** See allowSeedImages. */
  seedImages: boolean;
  /** NEXT_PUBLIC_API_BASE_URL: media served by the API's local storage adapter. */
  apiBaseUrl?: string | undefined;
  /** MEDIA_PUBLIC_BASE: public media host when it differs from the API (S3, CDN). */
  mediaPublicBase?: string | undefined;
  /** NEXT_PUBLIC_SITE_URL: on HTTPS, mixed-content requests are upgraded. */
  siteUrl?: string | undefined;
  /** NEXT_PUBLIC_USE_MSW: browser code calls the absolute API URL that the mock worker intercepts. */
  msw?: boolean;
};

/** The page Content-Security-Policy for one request. */
export function contentSecurityPolicy(options: CspOptions): string {
  const api = originOf(options.apiBaseUrl);
  const media = originOf(options.mediaPublicBase);
  const unique = (values: (string | null | false | undefined)[]) => [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];

  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      unique([
        "'self'",
        `'nonce-${options.nonce}'`,
        "'strict-dynamic'",
        options.development && "'unsafe-eval'",
      ]),
    ],
    // Style attributes (React `style`, Leaflet popups) cannot carry a nonce, and a nonce in this list
    // would disable 'unsafe-inline', so styles are not nonce-restricted. Scripts are.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    [
      'img-src',
      unique([
        "'self'",
        'data:',
        'blob:',
        MAP_TILE_ORIGIN,
        api,
        media,
        options.seedImages && SEED_IMAGE_ORIGIN,
      ]),
    ],
    ['font-src', ["'self'", 'data:']],
    [
      'connect-src',
      unique([
        "'self'",
        options.development && 'ws:',
        options.development && 'wss:',
        options.msw && api,
      ]),
    ],
    ['media-src', ["'self'", 'blob:']],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`);
  if (originOf(options.siteUrl)?.startsWith('https:')) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/** A fresh, unguessable nonce for one response. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Camera is used by the merchant voucher scanner (@zxing/browser). Nothing reads the location,
 * microphone or payment APIs, so they are off, as are other powerful features.
 */
export const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'browsing-topics=()',
].join(', ');

/** Two years, the value browsers expect for a long-lived HSTS policy. */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

/** API routes answer JSON or files, never pages: nothing may run in or frame them. */
export const API_ROUTE_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Headers sent on every response. HSTS only in production, so http://localhost keeps working. */
export function staticSecurityHeaders(production: boolean): { key: string; value: string }[] {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  ];
  if (production) headers.push({ key: 'Strict-Transport-Security', value: HSTS_VALUE });
  return headers;
}
