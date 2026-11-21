import type { components } from '@grupon/api-client';

type Role = components['schemas']['Role'];

export type AdminArea = 'moderation' | 'merchants' | 'reports' | 'finance' | 'audit';

/**
 * Platform roles admitted to each admin area, in navigation order. These mirror the API checks
 * (moderation, merchant review and review reports: superadmin, admin, moderator; finance desk:
 * superadmin, finance, support; audit log: superadmin, admin), which enforce the same rules.
 */
export const ADMIN_AREAS: readonly { area: AdminArea; roles: readonly Role[] }[] = [
  { area: 'moderation', roles: ['superadmin', 'admin', 'moderator'] },
  { area: 'merchants', roles: ['superadmin', 'admin', 'moderator'] },
  { area: 'reports', roles: ['superadmin', 'admin', 'moderator'] },
  { area: 'finance', roles: ['superadmin', 'finance', 'support'] },
  { area: 'audit', roles: ['superadmin', 'admin'] },
];

export function canOpenAdminArea(roles: readonly Role[], area: AdminArea): boolean {
  const entry = ADMIN_AREAS.find((item) => item.area === area);
  return Boolean(entry?.roles.some((role) => roles.includes(role)));
}

/** Admin areas the roles may open, in navigation order. */
export function adminAreas(roles: readonly Role[]): AdminArea[] {
  return ADMIN_AREAS.filter(({ area }) => canOpenAdminArea(roles, area)).map(({ area }) => area);
}
