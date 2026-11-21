'use client';

import type { components, PublicConfig } from '@grupon/api-client';
import { brandConfig, localized, type Locale } from '@grupon/config';
import { Bell, MapPinned, Menu, Smartphone, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { categoryLabel, subcategoryLabel } from '@/lib/catalog-labels';
import { formatTashkentDateTime } from '@/lib/dates';
import { useMyNotifications } from '@/lib/me-query';
import { BusinessCta } from './business-nav-link';
import { LanguageSelect } from './preferences';
import { CurrentSearchBox } from './search-box';

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

/** Site header: one dark bar on every page with the logo, the search and all controls in one row. */
export function SiteHeader({ categories, cities, locale }: Props) {
  const notifications = useNotifications();
  return (
    <header className="sticky top-0 z-40">
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
          <CurrentSearchBox tone="dark" className="mx-1 sm:mx-3" />
          <Controls
            categories={categories}
            cities={cities}
            locale={locale}
            notifications={notifications}
          />
        </div>
      </div>
    </header>
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
      <BusinessCta
        addClassName="hidden items-center gap-2 rounded-round-ui bg-brand px-4 py-2 text-small font-bold text-surface shadow-[0_0_20px_rgb(255_122_26/45%)] transition hover:bg-brand-hover lg:inline-flex"
        panelClassName="hidden items-center gap-2 rounded-round-ui border border-neon/40 px-3 py-2 text-small font-semibold text-neon transition hover:bg-surface/10 lg:inline-flex"
      />
      <span className="hidden items-center gap-2 rounded-round-ui border border-surface/15 bg-night/60 px-3 py-2 text-small text-surface/80 backdrop-blur-md xl:inline-flex">
        <Smartphone className="size-4" />
        {t('app')}
        <span className="rounded-round-ui bg-brand/20 px-2 py-0.5 text-label font-bold text-neon">
          {t('soon')}
        </span>
      </span>
      <span className="hidden sm:block">
        <Link className={iconButton} href="/map" aria-label={t('map')} title={t('map')}>
          <MapPinned className="size-5" />
        </Link>
      </span>
      <NotificationBell state={notifications} />
      <Link
        className={iconButton}
        href={notifications.status === 'guest' ? '/login' : '/account'}
        aria-label={t('account')}
      >
        <UserRound className="size-5" />
      </Link>
    </div>
  );
}

/** Notifications from the shared query, so every header instance makes one request per page. */
function useNotifications(): NotificationState {
  const query = useMyNotifications();
  if (query.isPending) return { status: 'loading' };
  if (query.isError) return { status: 'error' };
  return query.data;
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
                      {formatTashkentDateTime(item.created_at)}
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
  const catalog = useTranslations('Catalog');
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
              {categoryLabel(catalog, category, locale)}
            </Link>
            {category.subcategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                {category.subcategories.map((sub) => (
                  <Link
                    className="rounded-round-ui bg-page px-3 py-1 text-small text-ink-muted"
                    href={`/tashkent/${category.slug}?subcategory=${sub.slug}`}
                    key={sub.id}
                  >
                    {subcategoryLabel(catalog, category.slug, sub, locale)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        <BusinessCta
          addClassName="mt-4 flex items-center gap-2 rounded-round-ui bg-brand px-4 py-3 font-bold text-surface"
          panelClassName="mt-4 flex items-center gap-2 rounded-round-ui border px-4 py-3 font-semibold text-brand"
        />
        <Link
          className="mt-2 flex items-center gap-2 rounded-round-ui border px-4 py-3 font-semibold"
          href="/map"
        >
          <MapPinned className="size-4 text-brand" />
          {t('map')}
        </Link>
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
