import type { NextConfig } from 'next';
import path from 'node:path';

import {
  API_ROUTE_CSP,
  SEED_IMAGE_ORIGIN,
  allowSeedImages,
  staticSecurityHeaders,
} from './src/lib/security-headers';

const production = process.env.NODE_ENV === 'production';
const seedImages = allowSeedImages(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SITE_URL);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pages get their nonce-based Content-Security-Policy from src/proxy.ts; these apply everywhere.
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders(production) },
      {
        source: '/api/:path*',
        headers: [{ key: 'Content-Security-Policy', value: API_ROUTE_CSP }],
      },
    ];
  },
  // Browser components (search suggestions, "Load more") read public catalog data through these
  // same-origin paths; the API has no CORS. Only public reads are exposed, never account routes.
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(
      /\/+$/,
      '',
    );
    return [
      { source: '/api/public/deals', destination: `${api}/deals` },
      { source: '/api/public/search/suggestions', destination: `${api}/search/suggestions` },
    ];
  },
  // ngrok tunnels for sharing the dev server.
  allowedDevOrigins: [
    '127.0.0.1',
    '*.ngrok-free.app',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.ngrok.dev',
  ],
  transpilePackages: ['@dealo/api-client', '@dealo/config', '@dealo/i18n', '@dealo/ui'],
  images: {
    remotePatterns: [
      // Development seed images; seed data never reaches a deployed production site.
      ...(!seedImages
        ? []
        : [{ protocol: 'https' as const, hostname: new URL(SEED_IMAGE_ORIGIN).hostname }]),
      // Local API media (MEDIA_PUBLIC_BASE in development).
      { protocol: 'http', hostname: 'localhost', port: '8080', pathname: '/media/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8080', pathname: '/media/**' },
    ],
    // Development serves media from localhost; production media is on a public host.
    dangerouslyAllowLocalIP: !production,
  },
  experimental: { useTypeScriptCli: true, workerThreads: true },
  typescript: { ignoreBuildErrors: true },
  turbopack: { resolveAlias: { 'next-intl/config': './src/i18n/request.ts' } },
  webpack(config) {
    config.resolve.alias['next-intl/config'] = path.resolve(process.cwd(), 'src/i18n/request.ts');
    return config;
  },
};
export default nextConfig;
