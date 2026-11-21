import type { components } from '@grupon/api-client';

import { can, panelEntryHref, type MerchantPermission } from './merchant-access';

type Role = components['schemas']['Role'];
type MembershipStatus = components['schemas']['MerchantMembership']['review_status'];

/** Phone sign-in creates the account with this name until the person sets their own. */
export const DEFAULT_USER_NAME = 'Foydalanuvchi';

/** Phone sign-in accounts get a generated address on this host; it is not a real mailbox. */
const PLACEHOLDER_EMAIL_HOST = '@phone.grupon.local';

export function isDefaultName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  return trimmed === '' || trimmed === DEFAULT_USER_NAME;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !email || email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_HOST);
}

/** Formats an Uzbekistan number as +998 90 000 00 02. Other numbers are shown as stored. */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return phone;
}

/** Up to two initials for the avatar, or null when the person has not set a name yet. */
export function initials(name: string | null | undefined): string | null {
  if (isDefaultName(name)) return null;
  const letters = (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
  return letters ? letters.toLocaleUpperCase() : null;
}

/** Display order of roles: platform staff first, then business roles, the buyer role last. */
export const ROLE_ORDER: readonly Role[] = [
  'superadmin',
  'admin',
  'moderator',
  'finance',
  'support',
  'merchant_owner',
  'merchant_manager',
  'merchant_cashier',
  'user',
];

export function sortRoles(roles: readonly Role[]): Role[] {
  return [...new Set(roles)].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

export { adminAreas as staffAreas, type AdminArea as StaffArea } from './admin-access';

/**
 * An approved business opens the first panel page the membership permits; a business still in
 * review leads to its application status, when the membership manages the business (the owner).
 */
export function membershipHref(
  status: MembershipStatus,
  permissions: readonly MerchantPermission[] | null = null,
): string {
  if (status !== 'approved' && can(permissions, 'business.manage')) return '/merchant/review';
  return panelEntryHref(permissions);
}

export type ProfileErrorKey =
  'errorName' | 'errorPhone' | 'errorSession' | 'errorRateLimited' | 'errorGeneric';

/** Maps a failed PATCH /me response to a message key in the Profile namespace. */
export function profileErrorKey(
  status: number,
  problem: { code?: string; errors?: Record<string, string[]> },
): ProfileErrorKey {
  if (status === 401) return 'errorSession';
  if (problem.code === 'phone_change_requires_verification') return 'errorPhone';
  if (problem.code === 'rate_limited' || status === 429) return 'errorRateLimited';
  if (problem.code === 'validation_failed' && problem.errors?.name) return 'errorName';
  return 'errorGeneric';
}
