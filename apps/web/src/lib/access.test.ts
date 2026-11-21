import { describe, expect, it } from 'vitest';

import { adminAreas, canOpenAdminArea } from './admin-access';
import {
  allowedSections,
  can,
  fallbackHref,
  firstAllowedHref,
  merchantEntryFor,
  permissionDescriptionKeys,
  type MerchantPermission,
} from './merchant-access';
import { membershipHref } from './profile';

// Fixtures as the API reports them on GET /me memberships[].permissions.
const OWNER: MerchantPermission[] = [
  'workspace.view',
  'workspace.edit',
  'payouts.view',
  'staff.manage',
  'business.manage',
  'redeem',
  'redemptions.view_all',
];
const MANAGER: MerchantPermission[] = [
  'workspace.view',
  'workspace.edit',
  'payouts.view',
  'redeem',
  'redemptions.view_all',
];
const CASHIER: MerchantPermission[] = ['redeem'];

const hrefs = (permissions: MerchantPermission[]) =>
  allowedSections(permissions).map((section) => section.href);

describe('merchant panel access', () => {
  it('shows the owner every section and opens on the overview', () => {
    expect(hrefs(OWNER)).toHaveLength(14);
    expect(firstAllowedHref(OWNER)).toBe('/merchant/dashboard');
    expect(permissionDescriptionKeys(OWNER)).toEqual([
      'workspaceEdit',
      'payoutsView',
      'staffManage',
      'businessManage',
      'redeemAll',
    ]);
  });

  it('gives the manager every section but no staff or business management', () => {
    expect(hrefs(MANAGER)).toEqual(hrefs(OWNER));
    expect(can(MANAGER, 'staff.manage')).toBe(false);
    expect(can(MANAGER, 'business.manage')).toBe(false);
    expect(permissionDescriptionKeys(MANAGER)).not.toContain('staffManage');
  });

  it('shows the cashier only Redeem and sends every other page there', () => {
    expect(hrefs(CASHIER)).toEqual(['/merchant/redeem']);
    expect(firstAllowedHref(CASHIER)).toBe('/merchant/redeem');
    expect(fallbackHref(CASHIER, '/merchant/staff')).toBe('/merchant/redeem');
    expect(fallbackHref(CASHIER, '/merchant/redeem')).toBe('/merchant/no-access');
    expect(permissionDescriptionKeys(CASHIER)).toEqual(['redeemOwn']);
    expect(membershipHref('approved', CASHIER)).toBe('/merchant/redeem');
    expect(membershipHref('in_review', CASHIER)).toBe('/merchant/redeem');
    expect(membershipHref('in_review', OWNER)).toBe('/merchant/review');
    expect(membershipHref('in_review', MANAGER)).toBe('/merchant/dashboard');
  });

  it('links the header entry to the first permitted page, and hides it for buyers', () => {
    const member = (permissions: MerchantPermission[]) => ({
      roles: ['user'],
      memberships: [{ role: 'merchant_cashier', permissions }],
    });
    expect(merchantEntryFor(member(CASHIER))).toBe('/merchant/redeem');
    expect(merchantEntryFor(member(OWNER))).toBe('/merchant/dashboard');
    expect(merchantEntryFor({ roles: ['user'] })).toBeNull();
    expect(merchantEntryFor(null)).toBeNull();
    // A member is never sent to registration (it sends members back to the panel: a loop).
    expect(merchantEntryFor(member([]))).toBe('/merchant/no-access');
    expect(fallbackHref([], '/merchant/dashboard')).toBe('/merchant/no-access');
  });
});

describe('admin access', () => {
  it('matches the API role checks for every admin area', () => {
    expect(adminAreas(['user', 'merchant_owner'])).toEqual([]);
    expect(adminAreas(['moderator'])).toEqual(['moderation', 'merchants', 'reports']);
    expect(adminAreas(['admin'])).toEqual(['moderation', 'merchants', 'reports', 'audit']);
    expect(adminAreas(['support'])).toEqual(['finance']);
    expect(adminAreas(['finance'])).toEqual(['finance']);
    expect(adminAreas(['superadmin'])).toEqual([
      'moderation',
      'merchants',
      'reports',
      'finance',
      'audit',
    ]);
    expect(canOpenAdminArea(['moderator'], 'audit')).toBe(false);
    expect(canOpenAdminArea(['finance'], 'moderation')).toBe(false);
  });
});
