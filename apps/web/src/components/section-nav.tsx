'use client';

import { Link, usePathname } from '@/i18n/navigation';

/** Tab row for the merchant panel and admin tools. Only the sections the server permits are passed in. */
export function SectionNav({
  items,
  label,
}: {
  items: { href: string; label: string }[];
  label: string;
}) {
  const pathname = usePathname();
  // The longest matching link is current, so /merchant/deals/new does not also mark /merchant/deals.
  const current = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 border-b border-border pb-3 sm:flex-wrap">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.href === current ? 'page' : undefined}
              className={
                item.href === current
                  ? 'block whitespace-nowrap rounded-control-ui bg-brand-tint px-4 py-2 font-semibold text-brand'
                  : 'block whitespace-nowrap rounded-control-ui px-4 py-2 text-ink-muted hover:text-ink'
              }
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
