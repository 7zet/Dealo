import type { components } from '@grupon/api-client';

import { adminAreas } from './admin-access';
import { merchantEntryFor, type MeSummary } from './merchant-access';
import { safeNextPath } from './safe-next';

type Role = components['schemas']['Role'];

/**
 * Where a visitor lands after signing in when no `next` was asked for: merchant staff open the first
 * panel page their role allows (a cashier lands on Redeem), platform staff their first admin area,
 * everyone else the homepage. Paths carry no locale.
 */
export function landingPath(user: MeSummary | null | undefined): string {
  if (!user) return '/';
  const merchant = merchantEntryFor(user);
  if (merchant) return merchant;
  const [area] = adminAreas(user.roles as readonly Role[]);
  return area ? `/admin/${area}` : '/';
}

/**
 * The post-sign-in destination: a safe, same-site `next` when one was given (never an open
 * redirect), otherwise the role landing.
 */
export function postLoginPath(
  next: string | undefined,
  user: MeSummary | null | undefined,
): string {
  return next ? safeNextPath(next) : landingPath(user);
}
