import { Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { MerchantDeniedNotice } from '@/components/merchant-denied-notice';
import { MerchantSidebar, type SidebarGroup } from '@/components/merchant-sidebar';
import { REVIEW_TONES, StatusBadge, type ReviewStatus } from '@/components/merchant-ui';
import { getMe, SessionRequiredError } from '@/lib/account-api';
import { allowedSections, NO_WORKSPACE_HREF } from '@/lib/merchant-access';
import { getMerchantAccess } from '@/lib/merchant-session';

/** True when the visitor holds a session the API accepts. */
async function hasSession(): Promise<boolean> {
  try {
    return (await getMe()) !== null;
  } catch (error) {
    if (error instanceof SessionRequiredError) return false;
    throw error;
  }
}

/**
 * Frame of the merchant workspace: the business card, the visitor's role, the review status and the
 * sections their membership permits. Each page also guards itself with requirePanelPermission, and
 * the API enforces the same permissions on every merchant operation.
 */
export default async function PanelLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const access = await getMerchantAccess();
  if (!access) {
    // Signed-out visitors: a layout does not know the URL, so the page's own guard sends them to sign
    // in and back to that same page. Signed-in accounts without a workspace register one.
    if (!(await hasSession())) return <>{children}</>;
    redirect(`/${locale}${NO_WORKSPACE_HREF}`);
  }

  const [panel, merchantPanel, profile, ui] = await Promise.all([
    getTranslations('Panel'),
    getTranslations('MerchantPanel'),
    getTranslations('Profile'),
    getTranslations('MerchantUI'),
  ]);
  const items = allowedSections(access.permissions).map((section) => ({
    href: section.href,
    label: section.ns === 'Panel' ? panel(section.key) : merchantPanel(section.key),
  }));
  // Documents and the review submission are the owner's (business.manage).
  if (access.can('business.manage')) {
    items.push({ href: '/merchant/review', label: ui('navReview') });
  }
  const role =
    access.membership?.role ?? access.user.roles.find((value) => value.startsWith('merchant_'));
  const status = access.membership?.review_status as ReviewStatus | undefined;
  const groupLabels: Record<SidebarGroup, string> = {
    overview: ui('groupOverview'),
    sales: ui('groupSales'),
    operations: ui('groupOperations'),
    finance: ui('groupFinance'),
    team: ui('groupTeam'),
  };

  return (
    <div className="mx-auto max-w-layout px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-10">
        <aside className="grid min-w-0 content-start gap-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:gap-6 lg:self-start">
          <div className="flex items-center gap-3 rounded-card-ui border border-border bg-surface p-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-control-ui bg-night text-neon">
              <Store aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">
                {access.membership?.merchant_name ?? panel('panelLabel')}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {role && (
                  <span className="text-label font-semibold text-ink-muted">
                    {profile(`role.${role}`)}
                  </span>
                )}
                {status && (
                  <StatusBadge tone={REVIEW_TONES[status]}>{ui(`status.${status}`)}</StatusBadge>
                )}
              </div>
            </div>
          </div>
          {/* A member with one section (a cashier: redeem only) is already on it; a menu would only push
              the work below the fold on a phone. */}
          {items.length > 1 && (
            <MerchantSidebar items={items} groupLabels={groupLabels} label={panel('panelLabel')} />
          )}
        </aside>
        {/* One minmax(0,1fr) column: a wide child (KPI row, table) shrinks to the screen instead of
            widening the page on a phone. */}
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <Suspense fallback={null}>
            <MerchantDeniedNotice text={panel('deniedNotice')} />
          </Suspense>
          {children}
        </div>
      </div>
    </div>
  );
}
