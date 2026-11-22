import type { components } from '@dealo/api-client';
import { isLocale, type Locale } from '@dealo/config';
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import { AccountShell } from '@/components/account-shell';
import { ProfileForm } from '@/components/profile-form';
import { Link } from '@/i18n/navigation';
import { getMe, loadForVisitor, requireSession } from '@/lib/account-api';
import {
  panelEntryHref,
  permissionDescriptionKeys,
  type MerchantPermission,
} from '@/lib/merchant-access';
import {
  formatPhone,
  initials,
  isDefaultName,
  isPlaceholderEmail,
  membershipHref,
  sortRoles,
  staffAreas,
  type StaffArea,
} from '@/lib/profile';

type MembershipStatus = components['schemas']['MerchantMembership']['review_status'];

const STATUS_BADGE: Record<MembershipStatus, string> = {
  draft: 'bg-page text-ink-muted',
  submitted: 'bg-brand-tint text-brand',
  in_review: 'bg-brand-tint text-brand',
  approved: 'bg-save-tint text-save',
  rejected: 'bg-error-tint text-error',
  suspended: 'bg-error-tint text-error',
  terminated: 'bg-page text-ink-muted',
};

/** Permissions the API reported for a membership, or null when an older API omitted them. */
function permissionsOf(
  membership: components['schemas']['MerchantMembership'],
): MerchantPermission[] | null {
  return (membership.permissions as MerchantPermission[] | undefined) ?? null;
}

const sectionClass = 'rounded-panel-ui border border-border bg-surface p-5 sm:p-6';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const returnPath = `/${locale}/account/profile`;
  const user = await loadForVisitor(locale, returnPath, () => getMe());
  if (!user) requireSession(locale, returnPath);

  const [t, format, moderation, merchants, reports, finance] = await Promise.all([
    getTranslations('Profile'),
    getFormatter(),
    getTranslations('Moderation'),
    getTranslations('AdminMerchants'),
    getTranslations('Reports'),
    getTranslations('AdminFinance'),
  ]);

  const unnamed = isDefaultName(user.name);
  const avatar = initials(user.name);
  const phone = formatPhone(user.phone);
  const email = isPlaceholderEmail(user.email) ? null : user.email;
  const roles = sortRoles(user.roles.length > 0 ? user.roles : ['user']);
  const memberships = user.memberships ?? [];
  const hasMerchantRole = roles.some((role) => role.startsWith('merchant_'));
  const areas = staffAreas(roles);
  const preferred: Locale = isLocale(user.locale) ? user.locale : 'uz';

  const areaTitle: Record<StaffArea, string> = {
    moderation: moderation('title'),
    merchants: merchants('title'),
    reports: reports('title'),
    finance: finance('title'),
    audit: reports('auditTitle'),
  };

  return (
    <AccountShell section="profile">
      <div className="grid gap-6">
        {/* Identity */}
        <section className={`${sectionClass} flex flex-col gap-5 sm:flex-row sm:items-center`}>
          <div
            aria-hidden="true"
            className="grid size-20 shrink-0 place-items-center rounded-round-ui bg-night text-title-small font-bold text-neon"
          >
            {avatar ?? <UserRound className="size-9" />}
          </div>
          <div className="grid min-w-0 gap-2">
            <p className="truncate text-title-small font-bold text-ink">
              {unnamed ? t('unnamed') : user.name}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Phone aria-hidden="true" className="size-4" />
                <span dir="ltr">{phone ?? t('phoneMissing')}</span>
              </span>
              {user.created_at && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays aria-hidden="true" className="size-4" />
                  {t('memberSince', {
                    date: format.dateTime(new Date(user.created_at), {
                      month: 'long',
                      year: 'numeric',
                    }),
                  })}
                </span>
              )}
            </div>
            <ul className="flex flex-wrap gap-2" aria-label={t('accessTitle')}>
              {roles.map((role) => (
                <li
                  key={role}
                  className="rounded-round-ui bg-brand-tint px-3 py-1 text-label font-semibold text-brand"
                >
                  {t(`role.${role}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {user.status === 'blocked' && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control-ui bg-error-tint p-4 text-small text-error"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('blocked')}
          </p>
        )}

        {unnamed && (
          <div className="flex items-start gap-3 rounded-panel-ui border border-brand bg-brand-tint p-4">
            <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
            <div>
              <p className="font-semibold text-ink">{t('nameNudgeTitle')}</p>
              <p className="text-small text-ink-muted">{t('nameNudgeText')}</p>
            </div>
          </div>
        )}

        {/* Personal information */}
        <section className={sectionClass} aria-labelledby="profile-personal">
          <h3 id="profile-personal" className="text-lead font-bold text-ink">
            {t('personalTitle')}
          </h3>
          <p className="mt-1 text-small text-ink-muted">{t('personalText')}</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1 rounded-control-ui bg-page p-4">
              <dt className="inline-flex items-center gap-2 text-small font-semibold text-ink">
                <Phone aria-hidden="true" className="size-4" />
                {t('phoneLabel')}
                <Lock aria-hidden="true" className="size-3.5 text-ink-faint" />
              </dt>
              <dd className="text-ink" dir="ltr">
                {phone ?? t('phoneMissing')}
              </dd>
              <dd className="text-small text-ink-muted">{t('phoneHint')}</dd>
            </div>
            {email && (
              <div className="grid content-start gap-1 rounded-control-ui bg-page p-4">
                <dt className="inline-flex items-center gap-2 text-small font-semibold text-ink">
                  <Mail aria-hidden="true" className="size-4" />
                  {t('emailLabel')}
                </dt>
                <dd className="break-all text-ink">{email}</dd>
              </div>
            )}
          </dl>
          <div className="mt-6 border-t border-border pt-6">
            <ProfileForm initial={{ name: user.name, locale: preferred }} currentLocale={locale} />
          </div>
        </section>

        {/* Roles and access */}
        <section className={sectionClass} aria-labelledby="profile-access">
          <h3 id="profile-access" className="text-lead font-bold text-ink">
            {t('accessTitle')}
          </h3>
          <p className="mt-1 text-small text-ink-muted">{t('accessText')}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {roles.map((role) => (
              <li key={role} className="flex items-start gap-3 rounded-control-ui bg-page p-4">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
                <div>
                  <p className="font-semibold text-ink">{t(`role.${role}`)}</p>
                  <p className="text-small text-ink-muted">{t(`roleText.${role}`)}</p>
                </div>
              </li>
            ))}
          </ul>

          {(memberships.length > 0 || hasMerchantRole) && (
            <div className="mt-6">
              <h4 className="font-semibold text-ink">{t('businessesTitle')}</h4>
              {memberships.length > 0 ? (
                <ul className="mt-3 grid gap-3">
                  {memberships.map((membership) => (
                    <li
                      key={membership.merchant_id}
                      className="flex flex-col gap-3 rounded-control-ui border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Store
                          aria-hidden="true"
                          className="mt-0.5 size-5 shrink-0 text-ink-muted"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {membership.merchant_name}
                          </p>
                          <p className="text-small text-ink-muted">
                            {t('businessRole', { role: t(`role.${membership.role}`) })}
                          </p>
                          {permissionsOf(membership) && (
                            <div className="mt-2">
                              <p className="text-label font-semibold uppercase tracking-wide text-ink-faint">
                                {t('permissionsTitle')}
                              </p>
                              <ul className="mt-1 grid gap-1 text-small text-ink">
                                {permissionDescriptionKeys(permissionsOf(membership) ?? []).map(
                                  (key) => (
                                    <li key={key} className="flex items-start gap-2">
                                      <CircleCheck
                                        aria-hidden="true"
                                        className="mt-0.5 size-4 shrink-0 text-save"
                                      />
                                      {t(`permission.${key}`)}
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-round-ui px-3 py-1 text-label font-semibold ${STATUS_BADGE[membership.review_status]}`}
                        >
                          {t(`membershipStatus.${membership.review_status}`)}
                        </span>
                      </div>
                      <Link
                        href={membershipHref(membership.review_status, permissionsOf(membership))}
                        className="inline-flex shrink-0 items-center gap-2 text-small font-semibold text-brand hover:underline"
                      >
                        {membership.review_status === 'approved'
                          ? t('openPanel')
                          : t('viewApplication')}
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Link
                  href={panelEntryHref(null)}
                  className="mt-3 inline-flex items-center gap-2 text-small font-semibold text-brand hover:underline"
                >
                  <Briefcase aria-hidden="true" className="size-4" />
                  {t('openPanel')}
                </Link>
              )}
            </div>
          )}

          {areas.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-ink">{t('staffTitle')}</h4>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {areas.map((area) => (
                  <li key={area}>
                    <Link
                      href={`/admin/${area}`}
                      className="flex h-full items-center justify-between gap-3 rounded-control-ui border border-border p-4 hover:border-brand"
                    >
                      <span>
                        <span className="block font-semibold text-ink">{areaTitle[area]}</span>
                        <span className="block text-small text-ink-muted">
                          {t(`areaText.${area}`)}
                        </span>
                      </span>
                      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasMerchantRole && memberships.length === 0 && areas.length === 0 && (
            <div className="mt-6 flex flex-col gap-3 rounded-control-ui bg-night p-5 text-surface sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t('addBusinessTitle')}</p>
                <p className="text-small text-surface/70">{t('addBusinessText')}</p>
              </div>
              <Link
                href="/merchant/register"
                className="inline-flex shrink-0 items-center gap-2 rounded-control-ui bg-neon px-4 py-2 text-small font-semibold text-night"
              >
                {t('addBusiness')}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
