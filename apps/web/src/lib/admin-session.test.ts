import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_AREAS, type AdminArea } from './admin-access';

// The real guard runs: requireAdminArea → loadForVisitor → getMe → GET /me → roles. Only the Next.js
// request APIs and the network are stubbed.
vi.mock('next-intl/server', () => ({ getLocale: async () => 'uz' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'access_token' ? { value: 'token' } : undefined),
  }),
}));
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  redirect: (url: string) => redirect(url),
}));

function meAnswers(roles: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/me')
        ? new Response(JSON.stringify({ id: 'u1', roles, memberships: [] }), { status: 200 })
        : new Response('{}', { status: 404 }),
    ),
  );
}

const AREAS = ADMIN_AREAS.map(({ area }) => area);

beforeEach(() => {
  notFound.mockClear();
  redirect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('requireAdminArea', () => {
  it('admits a superadmin to all five admin areas', async () => {
    const { requireAdminArea } = await import('./admin-session');
    meAnswers(['buyer', 'superadmin']);
    expect(AREAS).toHaveLength(5);
    for (const area of AREAS) {
      await expect(requireAdminArea(area, 'uz')).resolves.toMatchObject({
        roles: ['buyer', 'superadmin'],
      });
    }
    expect(notFound).not.toHaveBeenCalled();
  });

  it('hides areas a role does not admit behind a 404', async () => {
    const { requireAdminArea } = await import('./admin-session');
    meAnswers(['finance']);
    await expect(requireAdminArea('finance' satisfies AdminArea, 'uz')).resolves.toBeTruthy();
    await expect(requireAdminArea('audit', 'uz')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sends a signed-out visitor to sign in and back to the area', async () => {
    const { requireAdminArea } = await import('./admin-session');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    await expect(requireAdminArea('audit', 'uz')).rejects.toThrow(
      'NEXT_REDIRECT /uz/login?next=%2Fadmin%2Faudit',
    );
  });
});
