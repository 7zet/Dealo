import { describe, expect, it } from 'vitest';

import { landingPath, postLoginPath } from './landing';

const cashier = {
  roles: ['buyer', 'merchant_cashier'],
  memberships: [{ role: 'cashier', permissions: ['redeem' as const] }],
};
const owner = {
  roles: ['buyer', 'merchant_owner'],
  memberships: [
    {
      role: 'owner',
      permissions: ['workspace.view' as const, 'workspace.edit' as const, 'redeem' as const],
    },
  ],
};

describe('landingPath', () => {
  it('lands each role on its own start page', () => {
    expect(landingPath(cashier)).toBe('/merchant/redeem');
    expect(landingPath(owner)).toBe('/merchant/dashboard');
    expect(landingPath({ roles: ['finance'] })).toBe('/admin/finance');
    expect(landingPath({ roles: ['superadmin'] })).toBe('/admin/moderation');
    expect(landingPath({ roles: ['buyer'] })).toBe('/');
    expect(landingPath(null)).toBe('/');
  });
});

describe('postLoginPath', () => {
  it('honours a safe next over the role landing', () => {
    expect(postLoginPath('/merchant/deals', owner)).toBe('/merchant/deals');
    expect(postLoginPath('/uz/merchant/redeem', owner)).toBe('/merchant/redeem');
  });

  it('never redirects off-site', () => {
    expect(postLoginPath('//evil.example', cashier)).toBe('/');
    expect(postLoginPath('https://evil.example', cashier)).toBe('/');
  });

  it('falls back to the role landing without next', () => {
    expect(postLoginPath(undefined, cashier)).toBe('/merchant/redeem');
    expect(postLoginPath('', cashier)).toBe('/merchant/redeem');
  });
});
