import 'server-only';

import type { components } from '@dealo/api-client';
import { notFound } from 'next/navigation';

import { canOpenAdminArea, type AdminArea } from './admin-access';
import { getMe, loadForVisitor } from './account-api';

type User = components['schemas']['User'];

/**
 * Guard for one admin page: a signed-out visitor signs in first; an account whose roles do not admit
 * the area gets a 404, so the admin tools stay invisible to everyone else.
 */
export async function requireAdminArea(area: AdminArea, locale: string): Promise<User> {
  const user = await loadForVisitor(locale, `/${locale}/admin/${area}`, () => getMe());
  if (!user || !canOpenAdminArea(user.roles, area)) notFound();
  return user;
}
