/**
 * Merchant panel access, derived only from the permissions the API returns on the user's membership
 * (GET /me → memberships[].permissions). The web never maps roles to pages itself: each panel page
 * declares the one permission it needs, and the API enforces the same rule on every request.
 */

import type { components } from '@dealo/api-client';

/** Permission codes of the server's merchant permission matrix. */
export type MerchantPermission = components['schemas']['MerchantPermission'];

type LabelKey =
  | {
      ns: 'Panel';
      key: 'navOverview' | 'navBusiness' | 'navDeals' | 'navCreateDeal' | 'navMedia' | 'navRedeem';
    }
  | {
      ns: 'MerchantPanel';
      key:
        | 'navStaff'
        | 'navOrders'
        | 'navPayouts'
        | 'navCustomers'
        | 'navAnalytics'
        | 'navReviews'
        | 'navCalculator'
        | 'navSettings';
    };

export type PanelSection = LabelKey & { href: string; permission: MerchantPermission };

/** Panel navigation in display order. The first permitted entry is the user's home in the panel. */
export const PANEL_SECTIONS: readonly PanelSection[] = [
  { href: '/merchant/dashboard', permission: 'workspace.view', ns: 'Panel', key: 'navOverview' },
  { href: '/merchant/business', permission: 'workspace.view', ns: 'Panel', key: 'navBusiness' },
  { href: '/merchant/deals', permission: 'workspace.view', ns: 'Panel', key: 'navDeals' },
  { href: '/merchant/deals/new', permission: 'workspace.edit', ns: 'Panel', key: 'navCreateDeal' },
  { href: '/merchant/media', permission: 'workspace.view', ns: 'Panel', key: 'navMedia' },
  { href: '/merchant/redeem', permission: 'redeem', ns: 'Panel', key: 'navRedeem' },
  { href: '/merchant/staff', permission: 'workspace.view', ns: 'MerchantPanel', key: 'navStaff' },
  { href: '/merchant/orders', permission: 'workspace.view', ns: 'MerchantPanel', key: 'navOrders' },
  { href: '/merchant/payouts', permission: 'payouts.view', ns: 'MerchantPanel', key: 'navPayouts' },
  {
    href: '/merchant/customers',
    permission: 'workspace.view',
    ns: 'MerchantPanel',
    key: 'navCustomers',
  },
  {
    href: '/merchant/analytics',
    permission: 'workspace.view',
    ns: 'MerchantPanel',
    key: 'navAnalytics',
  },
  {
    href: '/merchant/reviews',
    permission: 'workspace.view',
    ns: 'MerchantPanel',
    key: 'navReviews',
  },
  {
    href: '/merchant/calculator',
    permission: 'workspace.view',
    ns: 'MerchantPanel',
    key: 'navCalculator',
  },
  {
    href: '/merchant/settings',
    permission: 'workspace.view',
    ns: 'MerchantPanel',
    key: 'navSettings',
  },
];

/** Where an account without a merchant workspace is sent: business registration. */
export const NO_WORKSPACE_HREF = '/merchant/register';

/**
 * Where a member whose role permits no (other) panel section is sent. Never registration: a member
 * already has a business, and the registration page sends members back into the panel, which would
 * loop.
 */
export const NO_ACCESS_HREF = '/merchant/no-access';

/**
 * Permissions of a membership. `null` means the API did not report them (an API build from before
 * the permission matrix): the UI then hides nothing and relies on the API to refuse.
 */
export type PermissionSet = readonly MerchantPermission[] | null;

export function can(permissions: PermissionSet, permission: MerchantPermission): boolean {
  return permissions === null || permissions.includes(permission);
}

export function allowedSections(permissions: PermissionSet): PanelSection[] {
  return PANEL_SECTIONS.filter((section) => can(permissions, section.permission));
}

/** The first panel page the user may open, or null when no section is permitted. */
export function firstAllowedHref(permissions: PermissionSet): string | null {
  return allowedSections(permissions)[0]?.href ?? null;
}

/**
 * Destination for a "business panel" link: registration for accounts without a workspace
 * (`undefined`), otherwise the first permitted page, else the "no access" page.
 */
export function panelEntryHref(permissions: PermissionSet | undefined): string {
  if (permissions === undefined) return NO_WORKSPACE_HREF;
  return firstAllowedHref(permissions) ?? NO_ACCESS_HREF;
}

/** Where a page guard sends a member who lacks the permission (never back to the same page). */
export function fallbackHref(permissions: PermissionSet, deniedHref?: string): string {
  const target = allowedSections(permissions).find((section) => section.href !== deniedHref);
  return target?.href ?? NO_ACCESS_HREF;
}

/**
 * Human description keys (Profile.permission.*) for a membership, in matrix order. Cashier-style
 * memberships that may redeem but not see every redemption get the "own redemptions" wording.
 */
export type PermissionDescriptionKey =
  | 'workspaceView'
  | 'workspaceEdit'
  | 'payoutsView'
  | 'staffManage'
  | 'businessManage'
  | 'redeemOwn'
  | 'redeemAll'
  | 'redemptionsViewAll';

export function permissionDescriptionKeys(
  permissions: readonly MerchantPermission[],
): PermissionDescriptionKey[] {
  const keys: PermissionDescriptionKey[] = [];
  if (permissions.includes('workspace.view')) {
    keys.push(permissions.includes('workspace.edit') ? 'workspaceEdit' : 'workspaceView');
  }
  if (permissions.includes('payouts.view')) keys.push('payoutsView');
  if (permissions.includes('staff.manage')) keys.push('staffManage');
  if (permissions.includes('business.manage')) keys.push('businessManage');
  if (permissions.includes('redeem')) {
    keys.push(permissions.includes('redemptions.view_all') ? 'redeemAll' : 'redeemOwn');
  } else if (permissions.includes('redemptions.view_all')) {
    keys.push('redemptionsViewAll');
  }
  return keys;
}

export type MeSummary = {
  roles: readonly string[];
  memberships?: readonly { role: string; permissions?: readonly MerchantPermission[] }[];
};

/** The panel page this account may open first, or null for accounts without a merchant workspace. */
export function merchantEntryFor(user: MeSummary | null | undefined): string | null {
  if (!user) return null;
  const membership = user.memberships?.[0];
  const member = Boolean(membership) || user.roles.some((role) => role.startsWith('merchant_'));
  if (!member) return null;
  // Without reported permissions (older API) every section is listed; the API still enforces access.
  return panelEntryHref(membership?.permissions ?? null);
}
