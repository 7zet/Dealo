import 'server-only';

import type { components } from '@grupon/api-client';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getMe, requireSession, SessionRequiredError } from './account-api';
import {
  can,
  fallbackHref,
  NO_WORKSPACE_HREF,
  type MerchantPermission,
  type PermissionSet,
} from './merchant-access';

type User = components['schemas']['User'];
type Membership = components['schemas']['MerchantMembership'];

export type MerchantAccess = {
  user: User;
  /** The account's merchant workspace (one per account), when the API reports it. */
  membership: Membership | null;
  permissions: PermissionSet;
  can: (permission: MerchantPermission) => boolean;
};

function isMember(user: User): boolean {
  return (user.memberships?.length ?? 0) > 0 || user.roles.some((r) => r.startsWith('merchant_'));
}

/**
 * The visitor's merchant access, memoised per request. Returns null for a signed-out visitor or an
 * account with no merchant workspace.
 */
export const getMerchantAccess = cache(async (): Promise<MerchantAccess | null> => {
  let user: User | null;
  try {
    user = await getMe();
  } catch (error) {
    if (error instanceof SessionRequiredError) return null;
    throw error;
  }
  if (!user || !isMember(user)) return null;
  const membership = user.memberships?.[0] ?? null;
  // Fail closed: without permissions from the API nothing in the panel is offered.
  const permissions: PermissionSet = membership?.permissions ?? [];
  return { user, membership, permissions, can: (permission) => can(permissions, permission) };
});

/**
 * Guard for one panel page. A signed-out visitor goes to sign-in, an account without a workspace to
 * registration, and a member without the permission to the first panel page they may use.
 */
export async function requirePanelPermission(
  permission: MerchantPermission,
  href: string,
): Promise<MerchantAccess> {
  const locale = await getLocale();
  const access = await getMerchantAccess();
  if (!access) {
    try {
      await getMe();
    } catch (error) {
      if (error instanceof SessionRequiredError) requireSession(locale, `/${locale}${href}`);
      throw error;
    }
    redirect(`/${locale}${NO_WORKSPACE_HREF}`);
  }
  if (!access.can(permission)) redirect(`/${locale}${fallbackHref(access.permissions, href)}`);
  return access;
}
