'use client';

import type { components, PublicConfig } from '@grupon/api-client';
import { brandConfig, localized, type Locale } from '@grupon/config';
import { Bell, Menu, Smartphone, Store, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { BusinessNavLink } from './business-nav-link';
import { LanguageSelect } from './preferences';
import { SearchBox } from './search-box';

type Notification = components['schemas']['Notification'];
type NotificationState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'error' }
  | { status: 'ready'; items: Notification[] };

type Props = {
  categories: PublicConfig['categories'];
  cities: PublicConfig['cities'];
  locale: Locale;
};

const darkControl =
  'rounded-round-ui border border-surface/15 bg-night/60 px-3 py-2 text-small text-surface backdrop-blur-md transition hover:border-surface/30 hover:bg-night/80 [&>option]:text-ink';
const iconButton =
  'relative grid size-10 shrink-0 place-items-center rounded-round-ui border border-surface/15 bg-night/60 text-surface backdrop-blur-md transition hover:border-neon/60 hover:shadow-[0_0_18px_rgb(255_122_26/40%)]';

/**
 * Site header. On the home page the controls float over the black hero, and a condensed bar (logo, long
 * search, controls in one row) slides down once the hero search scrolls away. Other pages show the
 * condensed bar all the time.
 */
export function SiteHeader({ categories, cities, locale }: Props) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [pastHero, setPastHero] = useState(false);
  const condensed = !isHome || pastHero;
  const notifications = useNotifications();

  useEffect(() => {
    if (!isHome) return;
    const target = document.getElementById('hero-search');
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 72);
      },
      { rootMargin: '-72px 0px 0px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isHome]);

  const controls = (
    <Controls
      cities={cities}
      locale={locale}
      notifications={notifications}
      categories={categories}
    />
  );

  return (
    <>
      {isHome && (
        <div className="absolute inset-x-0 top-0 z-30">
          <div className="mx-auto flex max-w-layout items-center gap-2 px-4 pt-4 sm:px-6 lg:px-8">
            <MobileMenu categories={categories} cities={cities} locale={locale} />
            <div className="ml-auto">{controls}</div>
          </div>
        </div>
      )}
      <header
        aria-hidden={isHome && !condensed}
        inert={isHome && !condensed}
        className={
          isHome
            ? `fixed inset-x-0 top-0 z-40 transition-[transform,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${
                condensed
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none -translate-y-full opacity-0'
              }`
            : 'sticky top-0 z-40'
        }
      >
        <div className="border-b border-surface/10 bg-night/90 shadow-[0_10px_30px_-12px_rgb(0_0_0/45%)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-layout items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <MobileMenu categories={categories} cities={cities} locale={locale} />
            <Link
              className="shrink-0 text-subtitle font-extrabold tracking-tight text-surface"
              href="/"
            >
              {brandConfig.name}
              <span className="text-brand drop-shadow-[0_0_10px_rgb(255_122_26/70%)]">.</span>
            </Link>
            <SearchBox tone="dark" className="mx-1 sm:mx-3" />
            {controls}
          </div>
        </div>
      </header>
    </>
  );
}

function Controls({ cities, locale, notifications }: Props & { notifications: NotificationState }) {
  const t = useTranslations('Navigation');
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <select
        aria-label={t('city')}
        className={`hidden xl:block ${darkControl}`}
        defaultValue="tashkent"
      >
        {cities.map((city) => (
          <option value={city.slug} key={city.id}>
            {localized(city.name, locale)}
          </option>
        ))}
      </select>
      <LanguageSelect value={locale} className={`hidden md:block ${darkControl}`} />
      <Link
        href="/merchant"
        className="hidden items-center gap-2 rounded-round-ui bg-brand px-4 py-2 text-small font-bold text-surface shadow-[0_0_20px_rgb(255_122_26/45%)] transition hover:bg-brand-hover lg:inline-flex"
      >
        <Store className="size-4" />
        {t('addBusiness')}
      </Link>
      <BusinessNavLink className="hidden items-center gap-2 rounded-round-ui border border-neon/40 px-3 py-2 text-small font-semibold text-neon transition hover:bg-surface/10 lg:inline-flex" />
      <span className="hidden items-center gap-2 rounded-round-ui border border-surface/15 bg-night/60 px-3 py-2 text-small text-surface/80 backdrop-blur-md xl:inline-flex">
        <Smartphone className="size-4" />
        {t('app')}
        <span className="rounded-round-ui bg-brand/20 px-2 py-0.5 text-label font-bold text-neon">
          {t('soon')}
        </span>
      </span>
      <NotificationBell state={notifications} />
      <Link className={iconButton} href="/login" aria-label={t('account')}>
        <UserRound className="size-5" />
      </Link>
    </div>
  );
}

function useNotifications(): NotificationState {
  const [state, setState] = useState<NotificationState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    fetch('/api/bff/me/notifications', { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401 || response.status === 403) setState({ status: 'guest' });
        else if (!response.ok) setState({ status: 'error' });
        else {
          const body = (await response.json()) as { items: Notification[] };
          setState({ status: 'ready', items: body.items });
        }
      })
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

function NotificationBell({ state }: { state: NotificationState }) {
  const t = useTranslations('Navigation');
  const n = useTranslations('Notifications');
  const common = useTranslations('Common');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = state.status === 'ready' && state.items.some((item) => !item.read_at);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={iconButton}
        aria-label={t('notifications')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-5" />
        {unread && (
          <span className="absolute right-2 top-2 size-2 rounded-full bg-brand shadow-[0_0_8px_rgb(255_122_26)]" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-3 w-80 overflow-hidden rounded-card-ui border bg-surface text-ink shadow-floating-ui">
          <p className="border-b px-4 py-3 font-bold">{t('notifications')}</p>
          <div className="max-h-80 overflow-auto">
            {state.status === 'loading' && <p className="px-4 py-6 text-small text-ink-muted">…</p>}
            {state.status === 'guest' && (
              <div className="px-4 py-5 text-small text-ink-muted">
                <p>{t('notificationsLogin')}</p>
                <Link
                  className="mt-3 inline-block rounded-round-ui bg-brand px-4 py-2 font-bold text-surface"
                  href="/login"
                >
                  {t('signIn')}
                </Link>
              </div>
            )}
            {state.status === 'error' && (
              <p className="px-4 py-6 text-small text-ink-muted">{n('errorGeneric')}</p>
            )}
            {state.status === 'ready' &&
              (state.items.length === 0 ? (
                <p className="px-4 py-6 text-small text-ink-muted">{t('notificationsEmpty')}</p>
              ) : (
                state.items.slice(0, 8).map((item) => (
                  <div key={item.id} className="border-b px-4 py-3 text-small last:border-b-0">
                    <p className={item.read_at ? 'text-ink-muted' : 'font-semibold'}>
                      {n('redeemed', { merchant: item.merchant_name })}
                    </p>
                    <p className="mt-1 text-label text-ink-faint">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              ))}
          </div>
          {state.status === 'ready' && state.items.length > 0 && (
            <Link
              className="block border-t px-4 py-3 text-small font-semibold text-brand"
              href="/account/coupons"
            >
              {common('viewAll')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Phone and tablet menu: categories with subcategories, plus the controls that do not fit the bar. */
function MobileMenu({ categories, cities, locale }: Props) {
  const t = useTranslations('Navigation');
  return (
    <details className="group lg:hidden">
      <summary
        className={`${iconButton} list-none [&::-webkit-details-marker]:hidden`}
        aria-label={t('menu')}
      >
        <Menu className="size-5" />
      </summary>
      <nav className="fixed inset-x-0 top-16 z-50 max-h-[calc(100dvh-4rem)] overflow-auto border-b bg-surface p-4 text-ink shadow-floating-ui">
        <div className="mb-4 flex flex-wrap gap-2">
          <LanguageSelect value={locale} />
          <select
            aria-label={t('city')}
            className="rounded-control-ui border bg-surface px-2 py-2 text-small"
            defaultValue="tashkent"
          >
            {cities.map((city) => (
              <option value={city.slug} key={city.id}>
                {localized(city.name, locale)}
              </option>
            ))}
          </select>
        </div>
        {categories.map((category) => (
          <div key={category.id} className="border-b py-2">
            <Link className="block px-2 py-2 font-semibold" href={`/tashkent/${category.slug}`}>
              {localized(category.name, locale)}
            </Link>
            {category.subcategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                {category.subcategories.map((sub) => (
                  <Link
                    className="rounded-round-ui bg-page px-3 py-1 text-small text-ink-muted"
                    href={`/tashkent/${category.slug}?subcategory=${sub.slug}`}
                    key={sub.id}
                  >
                    {localized(sub.name, locale)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        <Link
          className="mt-4 flex items-center gap-2 rounded-round-ui bg-brand px-4 py-3 font-bold text-surface"
          href="/merchant"
        >
          <Store className="size-4" />
          {t('addBusiness')}
        </Link>
        <BusinessNavLink className="mt-2 flex items-center gap-2 rounded-round-ui border px-4 py-3 font-semibold text-brand" />
        <p className="mt-3 flex items-center gap-2 px-1 text-small text-ink-muted">
          <Smartphone className="size-4" />
          {t('app')}
          <span className="rounded-round-ui bg-brand-tint px-2 py-0.5 text-label font-bold text-brand">
            {t('soon')}
          </span>
        </p>
      </nav>
    </details>
  );
}
