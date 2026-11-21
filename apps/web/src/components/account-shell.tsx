import { Briefcase, ReceiptText, Star, Ticket, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';
import { getMe } from '@/lib/account-api';
import { merchantEntryFor } from '@/lib/merchant-access';

import { SignOutButton } from './sign-out-button';

/** The business panel entry for merchant members; a failed lookup simply hides it. */
async function merchantEntry(): Promise<string | null> {
  try {
    return merchantEntryFor(await getMe());
  } catch {
    return null;
  }
}

const SECTIONS = [
  { key: 'profile', icon: UserRound },
  { key: 'coupons', icon: Ticket },
  { key: 'orders', icon: ReceiptText },
  { key: 'reviews', icon: Star },
] as const;

type Section = (typeof SECTIONS)[number]['key'];

/**
 * Frame of every account page: the section navigation (a sidebar on wide screens, a two-column grid on
 * phones so no item is cut off), the business switch for merchant roles, and sign-out. Detail pages
 * (`detail`) drop the repeated section heading on phones so their main content starts higher.
 */
export async function AccountShell({
  section,
  detail = false,
  children,
}: {
  section: Section;
  detail?: boolean;
  children: ReactNode;
}) {
  const [t, merchant, tm] = await Promise.all([
    getTranslations('Account'),
    merchantEntry(),
    getTranslations('MerchantRegister'),
  ]);
  const current = SECTIONS.find((item) => item.key === section);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
        <aside className="grid content-start gap-4 md:sticky md:top-24 md:self-start">
          <h1 className="text-title-small font-bold text-ink">{t('title')}</h1>
          <nav aria-label={t('title')}>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-1">
              {SECTIONS.map(({ key, icon: Icon }) => {
                const active = key === section;
                return (
                  <li key={key} className="min-w-0">
                    <Link
                      href={`/account/${key}`}
                      aria-current={active ? 'page' : undefined}
                      className={
                        active
                          ? 'flex min-h-11 items-center gap-2 rounded-control-ui bg-brand-tint px-3 py-2 font-semibold text-brand md:gap-3 md:px-4 md:py-2.5'
                          : 'flex min-h-11 items-center gap-2 rounded-control-ui border border-border px-3 py-2 text-ink-muted hover:bg-page hover:text-ink md:gap-3 md:border-transparent md:px-4 md:py-2.5'
                      }
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      {t(`${key}Title`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-3 md:grid md:border-t md:border-border md:pt-4">
            {merchant && (
              <Link
                href={merchant}
                className="inline-flex items-center gap-2 text-small font-semibold text-brand hover:underline"
              >
                <Briefcase aria-hidden="true" className="size-4" />
                {tm('switchToBusiness')}
              </Link>
            )}
            <div>
              <SignOutButton />
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          {current && (
            <h2 className={`mb-6 text-title font-bold text-ink ${detail ? 'max-md:sr-only' : ''}`}>
              {t(`${current.key}Title`)}
            </h2>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
