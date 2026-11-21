'use client';

import {
  BadgeCheck,
  BarChart3,
  Calculator,
  CreditCard,
  Images,
  LayoutDashboard,
  MessageSquare,
  PlusCircle,
  QrCode,
  Receipt,
  Settings,
  Store,
  Tag,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

import { Link, usePathname } from '@/i18n/navigation';

export type SidebarGroup = 'overview' | 'sales' | 'operations' | 'finance' | 'team';

export type SidebarItem = { href: string; label: string };

/** Icon and group of every panel page; pages not listed here fall into "operations". */
const META: Record<string, { icon: LucideIcon; group: SidebarGroup }> = {
  '/merchant/dashboard': { icon: LayoutDashboard, group: 'overview' },
  '/merchant/analytics': { icon: BarChart3, group: 'overview' },
  '/merchant/deals': { icon: Tag, group: 'sales' },
  '/merchant/deals/new': { icon: PlusCircle, group: 'sales' },
  '/merchant/orders': { icon: Receipt, group: 'sales' },
  '/merchant/customers': { icon: UsersRound, group: 'sales' },
  '/merchant/reviews': { icon: MessageSquare, group: 'sales' },
  '/merchant/redeem': { icon: QrCode, group: 'operations' },
  '/merchant/business': { icon: Store, group: 'operations' },
  '/merchant/media': { icon: Images, group: 'operations' },
  '/merchant/review': { icon: BadgeCheck, group: 'operations' },
  '/merchant/payouts': { icon: CreditCard, group: 'finance' },
  '/merchant/calculator': { icon: Calculator, group: 'finance' },
  '/merchant/staff': { icon: Users, group: 'team' },
  '/merchant/settings': { icon: Settings, group: 'team' },
};

const GROUP_ORDER: SidebarGroup[] = ['overview', 'sales', 'operations', 'finance', 'team'];

function useCurrent(items: SidebarItem[]) {
  const pathname = usePathname();
  // The longest matching link is current, so /merchant/deals/new does not also mark /merchant/deals.
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * Navigation of the merchant workspace. Only the sections the member's permissions allow are passed
 * in. Wide screens get a grouped sidebar; phones a single scrollable row. No motion: merchant screens
 * stay still.
 */
export function MerchantSidebar({
  items,
  groupLabels,
  label,
}: {
  items: SidebarItem[];
  groupLabels: Record<SidebarGroup, string>;
  label: string;
}) {
  const current = useCurrent(items);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => (META[item.href]?.group ?? 'operations') === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <>
      <nav aria-label={label} className="hidden lg:block">
        <div className="grid gap-5">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group}>
              <p className="px-3 text-label font-semibold uppercase tracking-wider text-ink-faint">
                {groupLabels[group]}
              </p>
              <ul className="mt-1.5 grid gap-0.5">
                {groupItems.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} current={item.href === current} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
        <ul className="flex gap-1.5 pb-1">
          {items.map((item) => (
            <li key={item.href} className="shrink-0">
              <NavLink item={item} current={item.href === current} compact />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function NavLink({
  item,
  current,
  compact = false,
}: {
  item: SidebarItem;
  current: boolean;
  compact?: boolean;
}) {
  const Icon = META[item.href]?.icon ?? Store;
  const base = compact
    ? 'flex items-center gap-2 whitespace-nowrap rounded-round-ui border px-3.5 py-2 text-small font-medium'
    : 'flex items-center gap-3 rounded-control-ui px-3 py-2 text-small font-medium';
  const state = current
    ? compact
      ? 'border-brand bg-brand-tint text-brand'
      : 'bg-brand-tint font-semibold text-brand shadow-[inset_3px_0_0_var(--brand)]'
    : compact
      ? 'border-border bg-surface text-ink-muted hover:text-ink'
      : 'text-ink-muted hover:bg-surface hover:text-ink';
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={`${base} ${state}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}
