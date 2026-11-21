'use client';

import { useTranslations } from 'next-intl';
import { Briefcase, Store } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { merchantEntryFor } from '@/lib/merchant-access';
import { useMe } from '@/lib/me-query';

type EntryState = { loaded: false } | { loaded: true; href: string | null };

/** The signed-in account's merchant workspace entry, from the one shared GET /me query. */
function useMerchantEntry(): EntryState {
  const me = useMe();
  if (me.isPending) return { loaded: false };
  return { loaded: true, href: me.isError ? null : merchantEntryFor(me.data) };
}

/**
 * The header's business call to action. Members of a merchant workspace see only their business
 * panel entry; everyone else (guests, buyers, staff without a workspace) sees "Add your business".
 * Until the account is known the invitation stays visible, so guests never see the header shift.
 */
export function BusinessCta({
  addClassName,
  panelClassName,
}: {
  addClassName: string;
  panelClassName: string;
}) {
  const t = useTranslations('Navigation');
  const entry = useMerchantEntry();
  if (entry.loaded && entry.href) {
    return (
      <Link className={panelClassName} href={entry.href}>
        <Briefcase aria-hidden="true" className="size-4" />
        {t('businessSection')}
      </Link>
    );
  }
  return (
    <Link className={addClassName} href="/merchant">
      <Store aria-hidden="true" className="size-4" />
      {t('addBusiness')}
    </Link>
  );
}

/**
 * Shows the business panel entry only to accounts with a merchant workspace, linking to the first
 * section their permissions allow (a cashier lands on Redeem). Everyone else sees no trace of it.
 */
export function BusinessNavLink({
  variant = 'icon',
  className,
}: {
  variant?: 'icon' | 'text';
  className?: string;
}) {
  const t = useTranslations('Navigation');
  const entry = useMerchantEntry();
  const href = entry.loaded ? entry.href : null;

  if (!href) return null;
  if (variant === 'text') {
    return (
      <Link className="mt-2 block text-small font-semibold text-brand" href={href}>
        {t('businessSection')}
      </Link>
    );
  }
  return (
    <Link
      className={
        className ??
        'hidden items-center gap-2 rounded-control-ui px-3 py-2 text-small font-semibold text-brand hover:bg-page sm:flex'
      }
      href={href}
    >
      <Briefcase aria-hidden="true" size={18} />
      {t('businessSection')}
    </Link>
  );
}

/**
 * The business tab of the phone bottom bar, shown only to merchant workspace members. It opens the
 * first section their permissions allow, so a cashier lands on Redeem.
 */
export function BusinessTabLink({ className }: { className: string }) {
  const t = useTranslations('Navigation');
  const entry = useMerchantEntry();
  if (!entry.loaded || !entry.href) return null;
  return (
    <Link className={className} href={entry.href}>
      <Briefcase aria-hidden="true" />
      <span>{t('businessSection')}</span>
    </Link>
  );
}
