'use client';
import { publicApi } from '@grupon/api-client';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * Search with live suggestions. `tone="dark"` is for the black header and hero; `submitLabel` adds the
 * orange search button (an icon on phones).
 */
export function SearchBox({
  compact = false,
  tone = 'light',
  size = 'md',
  submitLabel,
  className = '',
}: {
  compact?: boolean;
  tone?: 'light' | 'dark';
  size?: 'md' | 'lg';
  submitLabel?: string;
  className?: string;
}) {
  const t = useTranslations('Navigation');
  const locale = useLocale();
  const [value, setValue] = useState('');
  const query = useDeferredValue(value.trim());
  const result = useQuery({
    queryKey: ['suggestions', query],
    queryFn: () => publicApi.suggestions(query),
    enabled: query.length >= 2,
  });
  const dark = tone === 'dark';
  const height = size === 'lg' ? 'h-14 text-body' : 'h-11 text-small';
  const input = dark
    ? 'rounded-round-ui bg-surface/10 text-surface ring-1 ring-surface/15 placeholder:text-surface/50 focus:bg-surface/15 focus:outline-none focus:ring-neon/70'
    : 'rounded-control-ui border bg-page';
  return (
    <form
      action={`/${locale}/search`}
      className={`relative ${compact ? '' : 'min-w-0 flex-1'} ${className}`}
    >
      <Search
        className={`pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 ${dark ? 'text-surface/60' : 'text-ink-muted'}`}
      />
      <input
        autoComplete="off"
        className={`${height} w-full pl-11 transition ${submitLabel ? 'pr-14 sm:pr-44' : 'pr-4'} ${input}`}
        name="q"
        placeholder={t('searchPlaceholder')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {submitLabel && (
        <button
          className="absolute bottom-1.5 right-1.5 top-1.5 grid place-items-center rounded-round-ui bg-brand px-3.5 text-small font-bold text-surface shadow-[0_0_24px_rgb(255_122_26/55%)] transition hover:bg-brand-hover sm:px-6"
          type="submit"
          aria-label={submitLabel}
        >
          <Search className="size-5 sm:hidden" />
          <span className="hidden sm:inline">{submitLabel}</span>
        </button>
      )}
      {result.data?.items.length ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card-ui border bg-surface text-ink shadow-floating-ui">
          {result.data.items.map((item) => (
            <Link
              className="block border-b px-4 py-3 text-small hover:bg-brand-tint"
              href={item.href}
              key={`${item.type}-${item.href}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </form>
  );
}
