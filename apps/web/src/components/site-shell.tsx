import type { PublicConfig } from '@dealo/api-client';
import { brandConfig, type Currency, type Locale } from '@dealo/config';
import { Home, Search, Ticket, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { PropsWithChildren } from 'react';
import { Link } from '@/i18n/navigation';
import { BusinessNavLink, BusinessTabLink } from './business-nav-link';
import { SiteHeader } from './site-header';

type Props = PropsWithChildren<{ config: PublicConfig; locale: Locale; currency: Currency }>;

export async function SiteShell({ children, config, locale }: Props) {
  const t = await getTranslations('Navigation');
  const footer = await getTranslations('Footer');
  return (
    <>
      <a
        className="sr-only z-50 rounded-control-ui bg-surface px-4 py-3 text-small text-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#main-content"
      >
        {t('skipToContent')}
      </a>
      <SiteHeader categories={config.categories} cities={config.cities} locale={locale} />
      <main id="main-content" className="min-h-[70dvh]">
        {children}
      </main>
      <footer className="mb-16 mt-20 border-t bg-surface lg:mb-0">
        <div className="mx-auto grid max-w-layout gap-10 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
          <div>
            <div className="text-subtitle font-bold text-brand">{brandConfig.name}</div>
            <p className="mt-3 text-small text-ink-muted">{footer('appSoon')}</p>
          </div>
          <div>
            <h2 className="font-semibold">{footer('discover')}</h2>
            <BusinessNavLink variant="text" />
            <Link className="mt-2 block text-small text-ink-muted" href="/merchant">
              {t('sell')}
            </Link>
          </div>
          <div>
            <h2 className="font-semibold">{footer('support')}</h2>
            <Link className="mt-3 block text-small text-ink-muted" href="/help">
              {footer('help')}
            </Link>
            <Link className="mt-2 block text-small text-ink-muted" href="/terms">
              {footer('terms')}
            </Link>
            <Link className="mt-2 block text-small text-ink-muted" href="/privacy">
              {footer('privacy')}
            </Link>
          </div>
        </div>
        <div className="border-t py-5 text-center text-label text-ink-muted">
          © {new Date().getFullYear()} {brandConfig.name}. {footer('rights')}
        </div>
      </footer>
      {/* Flex, not a fixed grid: the business tab appears only for merchant workspace members. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <MobileLink href="/" label={t('home')}>
          <Home />
        </MobileLink>
        <MobileLink href="/search" label={t('search')}>
          <Search />
        </MobileLink>
        <MobileLink href="/account/coupons" label={t('coupons')}>
          <Ticket />
        </MobileLink>
        <BusinessTabLink className={mobileLinkClass} />
        <MobileLink href="/account" label={t('account')}>
          <UserRound />
        </MobileLink>
      </nav>
    </>
  );
}

const mobileLinkClass =
  'flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-center text-[12px] leading-tight text-ink-muted';

function MobileLink({ href, label, children }: PropsWithChildren<{ href: string; label: string }>) {
  return (
    <Link className={mobileLinkClass} href={href}>
      {children}
      <span>{label}</span>
    </Link>
  );
}
